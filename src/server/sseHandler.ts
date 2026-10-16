import { EventEmitter } from 'events';
import type { FastifyReply } from 'fastify';

export type SSEEventListener = (event: string, data: any) => void;

const sseBus = new EventEmitter();
sseBus.setMaxListeners(200);

/**
 * Formats an SSE event and payload adhering strictly to W3C Server-Sent Events standard.
 *
 * @param event The event name (e.g., 'sentence_diff', 'completed', 'error').
 * @param data The payload data (object, string, array, etc.).
 * @returns Formatted SSE string chunk with trailing double newlines.
 */
export function formatSSE(event: string, data: unknown): string {
  const serialized = typeof data === 'string' ? JSON.stringify(data) : JSON.stringify(data);
  return `event: ${event}\ndata: ${serialized}\n\n`;
}

/**
 * Subscribes a listener function to events for a specific essay job ID.
 *
 * @param jobId The unique essay evaluation job ID.
 * @param listener Callback invoked when an event is emitted for this job.
 * @returns Unsubscribe function to release the listener.
 */
export function subscribeToJob(jobId: string, listener: SSEEventListener): () => void {
  const channel = `job:${jobId}`;
  sseBus.on(channel, listener);
  return () => {
    sseBus.off(channel, listener);
  };
}

/**
 * Publishes an event for a specific essay job ID to all active listeners.
 *
 * @param jobId The target essay evaluation job ID.
 * @param event The SSE event name (e.g. 'sentence_diff', 'completed').
 * @param data The payload associated with the event.
 */
export function publishJobEvent(jobId: string, event: string, data: unknown): void {
  sseBus.emit(`job:${jobId}`, event, data);
}

export interface SSEStreamOptions {
  redisSubscriber?: any;
  heartbeatIntervalMs?: number;
}

/**
 * Handles an incoming SSE HTTP request for a given essay job ID:
 * 1. Sets appropriate SSE streaming and proxy headers (disabling buffering).
 * 2. Subscribes to real-time `sentence_diff` and `completed` events for `jobId`.
 * 3. Streams formatted chunks directly to the response socket.
 * 4. Gracefully closes connection on job completion and cleans up on client disconnect.
 *
 * @param jobId The target essay job ID to monitor.
 * @param reply FastifyReply instance (or compatible mock / response stream).
 * @param options Optional subscriber or heartbeat configuration.
 */
export function handleSSEStream(
  jobId: string,
  reply: FastifyReply | any,
  options?: SSEStreamOptions
): void {
  // 1. Configure SSE response headers
  if (typeof reply.header === 'function') {
    reply.header('Content-Type', 'text/event-stream');
    reply.header('Cache-Control', 'no-cache, no-transform');
    reply.header('Connection', 'keep-alive');
    reply.header('X-Accel-Buffering', 'no');
  }

  const raw = reply.raw ?? reply;

  if (raw && typeof raw.setHeader === 'function') {
    raw.setHeader('Content-Type', 'text/event-stream');
    raw.setHeader('Cache-Control', 'no-cache, no-transform');
    raw.setHeader('Connection', 'keep-alive');
    raw.setHeader('X-Accel-Buffering', 'no');
  }

  if (raw && typeof raw.writeHead === 'function' && !raw.headersSent) {
    try {
      raw.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no',
      });
    } catch {
      // Ignore if headers already sent
    }
  }

  const writeChunk = (chunk: string): void => {
    if (raw && typeof raw.write === 'function') {
      raw.write(chunk);
    } else if (typeof reply.write === 'function') {
      reply.write(chunk);
    }
  };

  const endStream = (): void => {
    if (raw && typeof raw.end === 'function') {
      raw.end();
    } else if (typeof reply.end === 'function') {
      reply.end();
    }
  };

  let cleanedUp = false;
  let heartbeatTimer: NodeJS.Timeout | null = null;
  let unsubscribeRedis: (() => void) | null = null;

  const cleanup = () => {
    if (cleanedUp) return;
    cleanedUp = true;

    if (heartbeatTimer) {
      clearInterval(heartbeatTimer);
      heartbeatTimer = null;
    }

    unsubscribeLocal();

    if (unsubscribeRedis) {
      unsubscribeRedis();
      unsubscribeRedis = null;
    }
  };

  // 2. Subscribe to local in-process events
  const onEvent = (event: string, data: any) => {
    if (cleanedUp) return;

    writeChunk(formatSSE(event, data));

    if (event === 'completed' || event === 'error') {
      endStream();
      cleanup();
    }
  };

  const unsubscribeLocal = subscribeToJob(jobId, onEvent);

  // 3. Optional Redis pub/sub bridge if subscriber provided
  if (options?.redisSubscriber && typeof options.redisSubscriber.subscribe === 'function') {
    const redisChannel = `essay:events:${jobId}`;
    options.redisSubscriber.subscribe(redisChannel).catch(() => {});

    const onRedisMessage = (channel: string, message: string) => {
      if (channel === redisChannel) {
        try {
          const parsed = JSON.parse(message);
          if (parsed && parsed.event) {
            onEvent(parsed.event, parsed.data);
          }
        } catch {
          // Ignore malformed Redis messages
        }
      }
    };

    if (typeof options.redisSubscriber.on === 'function') {
      options.redisSubscriber.on('message', onRedisMessage);
    }

    unsubscribeRedis = () => {
      if (typeof options.redisSubscriber.unsubscribe === 'function') {
        options.redisSubscriber.unsubscribe(redisChannel).catch(() => {});
      }
      if (typeof options.redisSubscriber.off === 'function') {
        options.redisSubscriber.off('message', onRedisMessage);
      }
    };
  }

  // 4. Optional heartbeat to keep connections alive through proxies
  if (options?.heartbeatIntervalMs && options.heartbeatIntervalMs > 0) {
    heartbeatTimer = setInterval(() => {
      if (cleanedUp) return;
      writeChunk(': ping\n\n');
    }, options.heartbeatIntervalMs);
  }

  // 5. Clean up on client disconnect
  if (raw && typeof raw.on === 'function') {
    raw.on('close', cleanup);
    raw.on('finish', cleanup);
    raw.on('error', cleanup);
  }
}

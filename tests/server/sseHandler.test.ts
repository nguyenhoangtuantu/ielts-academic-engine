import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventEmitter } from 'events';
import {
  formatSSE,
  handleSSEStream,
  publishJobEvent,
  subscribeToJob,
} from '../../src/server/sseHandler';

describe('formatSSE', () => {
  it('formats an event and object payload according to SSE specification', () => {
    const payload = { sentence_id: 1, original: 'Test sentence.' };
    const formatted = formatSSE('sentence_diff', payload);
    expect(formatted).toBe(`event: sentence_diff\ndata: ${JSON.stringify(payload)}\n\n`);
  });

  it('formats an event with string payload', () => {
    const formatted = formatSSE('ping', 'pong');
    expect(formatted).toBe('event: ping\ndata: "pong"\n\n');
  });

  it('formats completed event payload', () => {
    const payload = { jobId: 'job-123', totalSentences: 5 };
    const formatted = formatSSE('completed', payload);
    expect(formatted).toBe(`event: completed\ndata: ${JSON.stringify(payload)}\n\n`);
  });
});

describe('subscribeToJob & publishJobEvent', () => {
  it('delivers events published for a matching jobId to subscriber', () => {
    const received: any[] = [];
    const unsubscribe = subscribeToJob('job-abc', (event: string, data: any) => {
      received.push({ event, data });
    });

    publishJobEvent('job-abc', 'sentence_diff', { id: 1 });
    publishJobEvent('job-xyz', 'sentence_diff', { id: 2 }); // Different jobId

    expect(received).toHaveLength(1);
    expect(received[0]).toEqual({ event: 'sentence_diff', data: { id: 1 } });

    unsubscribe();
    publishJobEvent('job-abc', 'completed', { done: true });
    // Should not receive anything after unsubscribing
    expect(received).toHaveLength(1);
  });
});

describe('handleSSEStream', () => {
  class MockFastifyReply {
    public headers: Record<string, string> = {};
    public writtenData: string[] = [];
    public ended = false;
    public raw: EventEmitter & {
      writeHead: (status: number, headers: Record<string, string>) => void;
      write: (chunk: string) => boolean;
      end: () => void;
      setHeader: (name: string, value: string) => void;
    };

    constructor() {
      const emitter = new EventEmitter();
      this.raw = Object.assign(emitter, {
        writeHead: (status: number, headers: Record<string, string>) => {
          Object.assign(this.headers, headers);
        },
        setHeader: (name: string, value: string) => {
          this.headers[name.toLowerCase()] = value;
        },
        write: (chunk: string) => {
          this.writtenData.push(chunk);
          return true;
        },
        end: () => {
          this.ended = true;
          emitter.emit('close');
        },
      });
    }

    header(name: string, value: string) {
      this.headers[name.toLowerCase()] = value;
      return this;
    }
  }

  it('configures SSE headers on the response', () => {
    const reply = new MockFastifyReply();
    handleSSEStream('job-999', reply as any);

    expect(reply.headers['content-type']).toContain('text/event-stream');
    expect(reply.headers['cache-control']).toContain('no-cache');
    expect(reply.headers['connection']).toContain('keep-alive');
  });

  it('streams sentence_diff and completed SSE chunks to the response', () => {
    const reply = new MockFastifyReply();
    handleSSEStream('job-stream-1', reply as any);

    const diffPayload = {
      sentence_id: 1,
      original: 'I like dogs.',
      diff_65: [{ type: 'equal', value: 'I like dogs.' }],
    };

    publishJobEvent('job-stream-1', 'sentence_diff', diffPayload);

    const expectedDiffSSE = formatSSE('sentence_diff', diffPayload);
    expect(reply.writtenData).toContain(expectedDiffSSE);

    const completedPayload = { jobId: 'job-stream-1', totalSentences: 1 };
    publishJobEvent('job-stream-1', 'completed', completedPayload);

    const expectedCompletedSSE = formatSSE('completed', completedPayload);
    expect(reply.writtenData).toContain(expectedCompletedSSE);
    expect(reply.ended).toBe(true);
  });

  it('cleans up event subscriptions when client closes connection', () => {
    const reply = new MockFastifyReply();
    handleSSEStream('job-disconnect', reply as any);

    const initialChunks = reply.writtenData.length;

    // Simulate client abrupt disconnect
    reply.raw.emit('close');

    // Publishing after close should not write to stream
    publishJobEvent('job-disconnect', 'sentence_diff', { id: 10 });
    expect(reply.writtenData.length).toBe(initialChunks);
  });

  it('streams error events and terminates response', () => {
    const reply = new MockFastifyReply();
    handleSSEStream('job-error-stream', reply as any);

    publishJobEvent('job-error-stream', 'error', { message: 'Failed to process' });

    const expectedErrSSE = formatSSE('error', { message: 'Failed to process' });
    expect(reply.writtenData).toContain(expectedErrSSE);
    expect(reply.ended).toBe(true);
  });

  it('sends periodic heartbeat pings when configured', () => {
    vi.useFakeTimers();
    try {
      const reply = new MockFastifyReply();
      handleSSEStream('job-heartbeat', reply as any, { heartbeatIntervalMs: 15000 });

      expect(reply.writtenData).not.toContain(': ping\n\n');

      vi.advanceTimersByTime(15000);
      expect(reply.writtenData).toContain(': ping\n\n');

      reply.raw.emit('close');
    } finally {
      vi.useRealTimers();
    }
  });

  it('receives and relays events from Redis subscriber when configured', async () => {
    const redisEmitter = new EventEmitter();
    const mockRedisSubscriber = {
      subscribe: vi.fn().mockResolvedValue('OK'),
      unsubscribe: vi.fn().mockResolvedValue('OK'),
      on: redisEmitter.on.bind(redisEmitter),
      off: redisEmitter.off.bind(redisEmitter),
    };

    const reply = new MockFastifyReply();
    handleSSEStream('job-redis-sub', reply as any, {
      redisSubscriber: mockRedisSubscriber,
    });

    expect(mockRedisSubscriber.subscribe).toHaveBeenCalledWith('essay:events:job-redis-sub');

    // Simulate Redis message arrival
    const redisMsg = JSON.stringify({
      event: 'sentence_diff',
      data: { sentence_id: 1, original: 'Redis sentence.' },
    });
    redisEmitter.emit('message', 'essay:events:job-redis-sub', redisMsg);

    const expectedSSE = formatSSE('sentence_diff', { sentence_id: 1, original: 'Redis sentence.' });
    expect(reply.writtenData).toContain(expectedSSE);

    reply.raw.emit('close');
    expect(mockRedisSubscriber.unsubscribe).toHaveBeenCalledWith('essay:events:job-redis-sub');
  });
});

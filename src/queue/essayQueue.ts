import { createHash, randomUUID } from 'crypto';
import { Queue } from 'bullmq';
import Redis from 'ioredis';
import { env } from '../config/env';

export const ESSAY_QUEUE_NAME = 'essay-evaluation';
export const IDEMPOTENCY_TTL_SECONDS = 30;

export interface EssayJobInput {
  essay: string;
  prompt?: string;
  clientIdentifier: string;
  userId?: string | null;
  anonymousId?: string;
  metadata?: Record<string, unknown>;
}

export interface EnqueueOptions {
  redisClient?: any;
  queue?: any;
  ttlSeconds?: number;
}

export interface EnqueueResult {
  jobId: string;
  isDuplicate: boolean;
}

let defaultRedisClient: Redis | null = null;
let defaultEssayQueue: Queue | null = null;

/**
 * Returns a singleton Redis client instance, lazily initialized.
 */
export function getDefaultRedisClient(): Redis {
  if (!defaultRedisClient) {
    defaultRedisClient = new Redis(env.REDIS_URL, {
      maxRetriesPerRequest: null,
      lazyConnect: true,
    });
  }
  return defaultRedisClient;
}

/**
 * Returns a singleton BullMQ Queue instance, lazily initialized.
 */
export function getDefaultEssayQueue(): Queue {
  if (!defaultEssayQueue) {
    const redis = getDefaultRedisClient();
    defaultEssayQueue = new Queue(ESSAY_QUEUE_NAME, {
      connection: redis,
    });
  }
  return defaultEssayQueue;
}

/**
 * Generates a deterministic SHA-256 idempotency key from the essay content
 * and client identifier to prevent duplicate submissions and race conditions.
 *
 * @param essay The submitted essay text.
 * @param clientIdentifier Client IP or unique user/session ID.
 * @returns 64-character SHA-256 hex string.
 */
export function generateIdempotencyKey(essay: string, clientIdentifier: string): string {
  const normalizedEssay = essay.trim();
  const normalizedClient = clientIdentifier.trim();
  return createHash('sha256')
    .update(`${normalizedClient}:${normalizedEssay}`)
    .digest('hex');
}

/**
 * Enqueues an essay evaluation job into BullMQ while enforcing an atomic
 * 30-second TTL idempotency lock in Redis.
 *
 * If a submission with identical content from the same client identifier arrives
 * within 30 seconds, the lock acquisition fails and the existing jobId is returned
 * with `isDuplicate: true` without adding a redundant job to the queue.
 *
 * @param jobData The essay job input data.
 * @param options Optional overrides for Redis and BullMQ instances (useful for testing/DI).
 * @returns Object with jobId and isDuplicate indicator.
 */
export async function enqueueEssayJob(
  jobData: EssayJobInput,
  options?: EnqueueOptions
): Promise<EnqueueResult> {
  const redis = options?.redisClient ?? getDefaultRedisClient();
  const queue = options?.queue ?? getDefaultEssayQueue();
  const ttl = options?.ttlSeconds ?? IDEMPOTENCY_TTL_SECONDS;

  const idempotencyKey = generateIdempotencyKey(jobData.essay, jobData.clientIdentifier);
  const lockKey = `idempotency:${idempotencyKey}`;

  // Candidate job ID generated before lock acquisition attempt
  const candidateJobId = randomUUID();

  // Enforce atomic 30s TTL Redis lock using NX (Not Exists)
  const lockResult = await redis.set(lockKey, candidateJobId, 'EX', ttl, 'NX');

  if (!lockResult) {
    // Lock already held; fetch the active jobId
    const existingJobId = await redis.get(lockKey);
    return {
      jobId: existingJobId ?? candidateJobId,
      isDuplicate: true,
    };
  }

  // Lock successfully acquired; add job to BullMQ queue
  const job = await queue.add('evaluateEssay', jobData, {
    jobId: candidateJobId,
    removeOnComplete: false,
    removeOnFail: false,
  });

  return {
    jobId: job.id ?? candidateJobId,
    isDuplicate: false,
  };
}

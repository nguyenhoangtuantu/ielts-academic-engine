import { Worker, Job } from 'bullmq';
import { randomUUID } from 'crypto';
import Redis from 'ioredis';
import { computeWordDiff, DiffChunk } from '../core/diff/myersDiff';
import { evaluateEssaySentences } from '../core/llm/evaluator';
import { SentenceFeedback } from '../core/llm/schemas';
import { EssayJobInput, ESSAY_QUEUE_NAME, getDefaultRedisClient } from './essayQueue';
import { publishJobEvent } from '../server/sseHandler';

export interface SentenceDiffResult {
  sentence_id: number;
  original: string;
  band_65: string;
  band_75: string;
  diff_65: DiffChunk[];
  diff_75: DiffChunk[];
  error_tags: string[];
  explanation: string;
}

export interface EssayJobResult {
  jobId: string;
  totalSentences: number;
  sentences: SentenceDiffResult[];
}

export interface PublisherLike {
  publish(channel: string, message: string): Promise<number | unknown>;
}

export interface EssayWorkerDependencies {
  evaluateFn?: (prompt: string, essay: string, client?: any) => Promise<SentenceFeedback[]>;
  diffFn?: (original: string, revised: string) => DiffChunk[];
  publisher?: PublisherLike;
  redisClient?: any;
}

export interface EssayWorkerOptions {
  connection?: any;
  concurrency?: number;
  dependencies?: EssayWorkerDependencies;
}

/**
 * Processes an individual essay evaluation job:
 * 1. Executes LLM evaluation via `evaluateEssaySentences`
 * 2. Computes word-level Myers diff for each sentence (Band 6.5 and Band 7.5+)
 * 3. Emits `sentence_diff` events in real-time
 * 4. Emits `completed` event upon full completion
 * 5. Caches results in Redis (TTL 24h) for re-hydration
 */
export async function processEssayJob(
  job: { id?: string; data: EssayJobInput },
  dependencies?: EssayWorkerDependencies
): Promise<EssayJobResult> {
  const jobId = job.id || randomUUID();
  const { essay, prompt = 'IELTS Academic Writing Task 2' } = job.data;

  const evaluateFn = dependencies?.evaluateFn ?? evaluateEssaySentences;
  const diffFn = dependencies?.diffFn ?? computeWordDiff;
  const publisher = dependencies?.publisher;
  const redis = dependencies?.redisClient;

  try {
    const feedbackList = await evaluateFn(prompt, essay);
    const results: SentenceDiffResult[] = [];

    for (const feedback of feedbackList) {
      const diff_65 = diffFn(feedback.original, feedback.band_65);
      const diff_75 = diffFn(feedback.original, feedback.band_75);

      const sentenceResult: SentenceDiffResult = {
        sentence_id: feedback.sentence_id,
        original: feedback.original,
        band_65: feedback.band_65,
        band_75: feedback.band_75,
        diff_65,
        diff_75,
        error_tags: feedback.error_tags,
        explanation: feedback.explanation,
      };

      results.push(sentenceResult);

      // 1. Emit to local in-process SSE handler
      publishJobEvent(jobId, 'sentence_diff', sentenceResult);

      // 2. Publish to Redis pub/sub channel if publisher is configured
      if (publisher && typeof publisher.publish === 'function') {
        const payload = JSON.stringify({
          event: 'sentence_diff',
          data: sentenceResult,
        });
        await publisher.publish(`essay:events:${jobId}`, payload);
      }
    }

    const finalResult: EssayJobResult = {
      jobId,
      totalSentences: results.length,
      sentences: results,
    };

    // Cache final result in Redis if client is provided
    if (redis && typeof redis.set === 'function') {
      await redis.set(`essay:results:${jobId}`, JSON.stringify(finalResult), 'EX', 86400);
    }

    // Emit completed event
    publishJobEvent(jobId, 'completed', finalResult);

    if (publisher && typeof publisher.publish === 'function') {
      const payload = JSON.stringify({
        event: 'completed',
        data: finalResult,
      });
      await publisher.publish(`essay:events:${jobId}`, payload);
    }

    return finalResult;
  } catch (error) {
    const errorPayload = {
      jobId,
      error: error instanceof Error ? error.message : 'Evaluation failed',
    };

    publishJobEvent(jobId, 'error', errorPayload);

    if (publisher && typeof publisher.publish === 'function') {
      await publisher.publish(
        `essay:events:${jobId}`,
        JSON.stringify({ event: 'error', data: errorPayload })
      );
    }

    throw error;
  }
}

/**
 * Creates and initializes a BullMQ Worker for essay evaluation.
 */
export function createEssayWorker(options?: EssayWorkerOptions): Worker {
  const connection = options?.connection ?? getDefaultRedisClient();
  const concurrency = options?.concurrency ?? 5;
  const dependencies = options?.dependencies;

  return new Worker(
    ESSAY_QUEUE_NAME,
    async (job: Job<EssayJobInput>) => {
      return processEssayJob(job, dependencies);
    },
    {
      connection,
      concurrency,
    }
  );
}

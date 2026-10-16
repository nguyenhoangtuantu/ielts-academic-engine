import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  generateIdempotencyKey,
  enqueueEssayJob,
  EssayJobInput,
} from '../../src/queue/essayQueue';
import { processEssayJob, SentenceDiffResult } from '../../src/queue/essayWorker';
import { DiffChunk } from '../../src/core/diff/myersDiff';
import { SentenceFeedback } from '../../src/core/llm/schemas';

// Mock in-memory Redis client
class MockRedis {
  public store = new Map<string, { value: string; expiresAt?: number }>();
  public setCalls: Array<[string, string, ...any[]]> = [];

  async get(key: string): Promise<string | null> {
    const item = this.store.get(key);
    if (!item) return null;
    if (item.expiresAt && Date.now() > item.expiresAt) {
      this.store.delete(key);
      return null;
    }
    return item.value;
  }

  async set(key: string, value: string, ...args: any[]): Promise<'OK' | null> {
    this.setCalls.push([key, value, ...args]);
    const isNx = args.includes('NX');
    const exIdx = args.indexOf('EX');
    let ttlSeconds: number | undefined;
    if (exIdx !== -1 && args[exIdx + 1] !== undefined) {
      ttlSeconds = Number(args[exIdx + 1]);
    }

    if (isNx && (await this.get(key)) !== null) {
      return null;
    }

    const expiresAt = ttlSeconds ? Date.now() + ttlSeconds * 1000 : undefined;
    this.store.set(key, { value, expiresAt });
    return 'OK';
  }

  async del(key: string): Promise<number> {
    return this.store.delete(key) ? 1 : 0;
  }
}

// Mock BullMQ Queue
class MockQueue {
  public jobs: Array<{ name: string; data: any; opts?: any }> = [];

  async add(name: string, data: any, opts?: any): Promise<{ id: string; name: string; data: any }> {
    const jobId = opts?.jobId || `job-${Math.random().toString(36).slice(2, 9)}`;
    const job = { id: jobId, name, data, opts };
    this.jobs.push(job);
    return job;
  }
}

describe('generateIdempotencyKey', () => {
  it('creates identical hashes for identical text within window', () => {
    const key1 = generateIdempotencyKey('User essay content', '127.0.0.1');
    const key2 = generateIdempotencyKey('User essay content', '127.0.0.1');
    expect(key1).toBe(key2);
  });

  it('generates a 64-character SHA-256 hex string', () => {
    const key = generateIdempotencyKey('Some essay', 'client-1');
    expect(key).toMatch(/^[a-f0-9]{64}$/);
  });

  it('generates different hashes for different essay texts', () => {
    const key1 = generateIdempotencyKey('Essay content A', '127.0.0.1');
    const key2 = generateIdempotencyKey('Essay content B', '127.0.0.1');
    expect(key1).not.toBe(key2);
  });

  it('generates different hashes for different client identifiers', () => {
    const key1 = generateIdempotencyKey('Identical content', 'client-a');
    const key2 = generateIdempotencyKey('Identical content', 'client-b');
    expect(key1).not.toBe(key2);
  });

  it('normalizes leading and trailing whitespace so identical trimmed content matches', () => {
    const key1 = generateIdempotencyKey('  Essay content with spaces  \n', 'client-a');
    const key2 = generateIdempotencyKey('Essay content with spaces', 'client-a');
    expect(key1).toBe(key2);
  });
});

describe('enqueueEssayJob & Idempotency Lock', () => {
  let mockRedis: MockRedis;
  let mockQueue: MockQueue;

  beforeEach(() => {
    mockRedis = new MockRedis();
    mockQueue = new MockQueue();
  });

  it('enqueues a new essay job and acquires 30s TTL Redis lock', async () => {
    const jobData: EssayJobInput = {
      essay: 'This is my first submission for IELTS writing.',
      prompt: 'Discuss both views and give your opinion.',
      clientIdentifier: 'user-ip-1.2.3.4',
    };

    const result = await enqueueEssayJob(jobData, {
      redisClient: mockRedis as any,
      queue: mockQueue as any,
    });

    expect(result.isDuplicate).toBe(false);
    expect(result.jobId).toBeDefined();
    expect(typeof result.jobId).toBe('string');
    expect(mockQueue.jobs).toHaveLength(1);
    expect(mockQueue.jobs[0].data.essay).toBe(jobData.essay);

    // Verify 30s TTL Redis lock was set
    const key = `idempotency:${generateIdempotencyKey(jobData.essay, jobData.clientIdentifier)}`;
    const storedJobId = await mockRedis.get(key);
    expect(storedJobId).toBe(result.jobId);

    // Verify EX 30 was passed to redis.set
    const setCall = mockRedis.setCalls.find((call) => call[0] === key);
    expect(setCall).toBeDefined();
    expect(setCall).toContain('EX');
    expect(setCall).toContain(30);
  });

  it('prevents duplicate submission within 30s and returns existing jobId', async () => {
    const jobData: EssayJobInput = {
      essay: 'Technology has transformed modern communication deeply.',
      clientIdentifier: '192.168.1.100',
    };

    const first = await enqueueEssayJob(jobData, {
      redisClient: mockRedis as any,
      queue: mockQueue as any,
    });
    expect(first.isDuplicate).toBe(false);
    expect(mockQueue.jobs).toHaveLength(1);

    // Immediate second submission with identical content and clientIdentifier
    const second = await enqueueEssayJob(jobData, {
      redisClient: mockRedis as any,
      queue: mockQueue as any,
    });

    expect(second.isDuplicate).toBe(true);
    expect(second.jobId).toBe(first.jobId);
    // Queue length should still be 1 (no duplicate job added)
    expect(mockQueue.jobs).toHaveLength(1);
  });

  it('allows re-submission after lock expires or is removed', async () => {
    const jobData: EssayJobInput = {
      essay: 'Education is essential for social mobility.',
      clientIdentifier: 'user-42',
    };

    const first = await enqueueEssayJob(jobData, {
      redisClient: mockRedis as any,
      queue: mockQueue as any,
    });
    expect(first.isDuplicate).toBe(false);
    expect(mockQueue.jobs).toHaveLength(1);

    // Simulate lock expiration by deleting the key
    const key = `idempotency:${generateIdempotencyKey(jobData.essay, jobData.clientIdentifier)}`;
    await mockRedis.del(key);

    const second = await enqueueEssayJob(jobData, {
      redisClient: mockRedis as any,
      queue: mockQueue as any,
    });

    expect(second.isDuplicate).toBe(false);
    expect(second.jobId).not.toBe(first.jobId);
    expect(mockQueue.jobs).toHaveLength(2);
  });
});

describe('essayWorker sentence-level processing and diff streaming', () => {
  it('processes essay evaluation and computes word diffs for each sentence', async () => {
    const mockSentences: SentenceFeedback[] = [
      {
        sentence_id: 1,
        original: 'I very like this idea.',
        band_65: 'I like this idea very much.',
        band_75: 'I strongly endorse this notion.',
        error_tags: ['collocation', 'word-order'],
        explanation: 'Do not use very directly preceding a verb.',
      },
      {
        sentence_id: 2,
        original: 'It make people happy.',
        band_65: 'It makes people happy.',
        band_75: 'It engenders substantial satisfaction among individuals.',
        error_tags: ['subject-verb-agreement'],
        explanation: 'Singular subject "It" takes "makes".',
      },
    ];

    const emittedEvents: Array<{ event: string; data: any }> = [];
    const mockPublisher = {
      publish: vi.fn(async (channel: string, message: string) => {
        const parsed = JSON.parse(message);
        emittedEvents.push(parsed);
      }),
    };

    const mockEvaluate = vi.fn().mockResolvedValue(mockSentences);

    const job = {
      id: 'job-12345',
      data: {
        essay: 'I very like this idea. It make people happy.',
        prompt: 'Do you agree or disagree?',
        clientIdentifier: 'client-1',
      },
    };

    const result = await processEssayJob(job as any, {
      evaluateFn: mockEvaluate,
      publisher: mockPublisher as any,
    });

    expect(mockEvaluate).toHaveBeenCalledWith(
      'Do you agree or disagree?',
      'I very like this idea. It make people happy.'
    );

    // Check sentence_diff events emitted per sentence
    const diffEvents = emittedEvents.filter((e) => e.event === 'sentence_diff');
    expect(diffEvents).toHaveLength(2);

    expect(diffEvents[0].data.sentence_id).toBe(1);
    expect(diffEvents[0].data.diff_65).toBeDefined();
    expect(diffEvents[0].data.diff_75).toBeDefined();
    expect(diffEvents[0].data.diff_65.some((d: DiffChunk) => d.type === 'delete')).toBe(true);

    expect(diffEvents[1].data.sentence_id).toBe(2);
    expect(diffEvents[1].data.diff_65).toBeDefined();
    expect(diffEvents[1].data.diff_75).toBeDefined();

    // Check completed event
    const completedEvent = emittedEvents.find((e) => e.event === 'completed');
    expect(completedEvent).toBeDefined();
    expect(completedEvent?.data.jobId).toBe('job-12345');
    expect(completedEvent?.data.totalSentences).toBe(2);

    // Verify worker returned result
    expect(result.jobId).toBe('job-12345');
    expect(result.sentences).toHaveLength(2);
    expect(result.sentences[0].sentence_id).toBe(1);
  });

  it('publishes error event and throws when evaluateFn fails', async () => {
    const emittedEvents: Array<{ event: string; data: any }> = [];
    const mockPublisher = {
      publish: vi.fn(async (channel: string, message: string) => {
        emittedEvents.push(JSON.parse(message));
      }),
    };

    const mockEvaluate = vi.fn().mockRejectedValue(new Error('OpenAI timeout'));

    const job = {
      id: 'job-fail-1',
      data: {
        essay: 'Some essay text.',
        clientIdentifier: 'client-err',
      },
    };

    await expect(
      processEssayJob(job as any, {
        evaluateFn: mockEvaluate,
        publisher: mockPublisher as any,
      })
    ).rejects.toThrow('OpenAI timeout');

    const errEvent = emittedEvents.find((e) => e.event === 'error');
    expect(errEvent).toBeDefined();
    expect(errEvent?.data.jobId).toBe('job-fail-1');
    expect(errEvent?.data.error).toBe('OpenAI timeout');
  });

  it('caches completed evaluation in redis when redisClient is provided', async () => {
    const mockRedis = new MockRedis();
    const mockSentences: SentenceFeedback[] = [
      {
        sentence_id: 1,
        original: 'Original text.',
        band_65: 'Revised text.',
        band_75: 'Sophisticated text.',
        error_tags: ['grammar'],
        explanation: 'Simple fix.',
      },
    ];

    const job = {
      id: 'job-cached-1',
      data: {
        essay: 'Original text.',
        clientIdentifier: 'client-cache',
      },
    };

    await processEssayJob(job as any, {
      evaluateFn: vi.fn().mockResolvedValue(mockSentences),
      redisClient: mockRedis as any,
    });

    const cached = await mockRedis.get('essay:results:job-cached-1');
    expect(cached).toBeDefined();
    const parsed = JSON.parse(cached!);
    expect(parsed.jobId).toBe('job-cached-1');
    expect(parsed.totalSentences).toBe(1);
  });
});

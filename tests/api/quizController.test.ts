import { describe, it, expect, beforeEach } from 'vitest';
import Fastify, { FastifyInstance } from 'fastify';
import {
  quizRoutes,
  GetDailyQuizQuerySchema,
  SubmitQuizReviewBodySchema,
  SaveMistakesBodySchema,
} from '../../src/api/quizController';
import {
  createInMemoryMistakeRepository,
  MistakeRepository,
} from '../../src/services/mistakeService';

describe('Quiz Controller Zod Schemas', () => {
  it('validates daily quiz query parameters', () => {
    const valid = GetDailyQuizQuerySchema.safeParse({ userId: 'user-123' });
    expect(valid.success).toBe(true);

    const invalid = GetDailyQuizQuerySchema.safeParse({});
    expect(invalid.success).toBe(false);
  });

  it('validates quiz review body parameters', () => {
    const valid = SubmitQuizReviewBodySchema.safeParse({
      mistakeId: 'm-123',
      grade: 4,
      timezoneOffsetHours: 7,
    });
    expect(valid.success).toBe(true);

    const invalidGrade = SubmitQuizReviewBodySchema.safeParse({
      mistakeId: 'm-123',
      grade: 6, // out of range
    });
    expect(invalidGrade.success).toBe(false);

    const missingId = SubmitQuizReviewBodySchema.safeParse({
      grade: 3,
    });
    expect(missingId.success).toBe(false);
  });

  it('validates save mistakes body parameters', () => {
    const valid = SaveMistakesBodySchema.safeParse({
      userId: 'user-123',
      anonId: 'anon-abc',
      essayId: 'essay-456',
      feedback: [
        {
          sentence_id: 1,
          original: 'He go home.',
          band_65: 'He went home.',
          band_75: 'He returned to his residence.',
          error_tags: ['verb-tense'],
          explanation: 'Use past tense.',
        },
      ],
    });
    expect(valid.success).toBe(true);
  });
});

describe('Quiz Controller Fastify Routes', () => {
  let app: FastifyInstance;
  let repo: MistakeRepository;

  beforeEach(async () => {
    repo = createInMemoryMistakeRepository();
    app = Fastify();
    await app.register(quizRoutes, { db: repo });
    await app.ready();
  });

  it('GET /api/quiz/daily returns 400 when userId is missing', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/quiz/daily',
    });
    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(false);
    expect(body.error).toContain('userId');
  });

  it('GET /api/quiz/daily returns cloze questions for due mistakes', async () => {
    const now = new Date('2026-10-16T12:00:00.000Z');
    await repo.createMistakes([
      {
        id: 'card-1',
        user_id: 'student-1',
        anonymous_session_id: null,
        essay_id: 'e-1',
        context_sentence: 'It is vital to solve the problem about traffic.',
        blank_phrase: 'solve the problem about',
        corrected_phrase: 'address the issue of',
        error_tag: 'collocation',
        interval: 0,
        efactor: 2.5,
        repetitions: 0,
        due_date: new Date('2026-10-15T00:00:00.000Z'),
      },
    ]);

    const res = await app.inject({
      method: 'GET',
      url: '/api/quiz/daily?userId=student-1',
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(body.questions).toHaveLength(1);
    expect(body.questions[0].id).toBe('card-1');
    expect(body.questions[0].masked_sentence).toBe('It is vital to [.....] traffic.');
    expect(body.questions[0].target_phrase).toBe('address the issue of');
  });

  it('POST /api/quiz/review returns 400 for invalid body', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/quiz/review',
      payload: { mistakeId: 'card-1', grade: 99 },
    });
    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(false);
  });

  it('POST /api/quiz/review returns 404 when card does not exist', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/quiz/review',
      payload: { mistakeId: 'non-existent', grade: 4 },
    });
    expect(res.statusCode).toBe(404);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(false);
    expect(body.error).toContain('not found');
  });

  it('POST /api/quiz/review updates card and returns SM-2 result', async () => {
    await repo.createMistakes([
      {
        id: 'review-card-1',
        user_id: 'student-1',
        anonymous_session_id: null,
        essay_id: 'e-1',
        context_sentence: 'He go to school.',
        blank_phrase: 'go',
        corrected_phrase: 'went',
        error_tag: 'verb-tense',
        interval: 0,
        efactor: 2.5,
        repetitions: 0,
        due_date: new Date('2026-10-15T00:00:00.000Z'),
      },
    ]);

    const res = await app.inject({
      method: 'POST',
      url: '/api/quiz/review',
      payload: { mistakeId: 'review-card-1', grade: 5, timezoneOffsetHours: 7 },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(body.result.repetitions).toBe(1);
    expect(body.result.interval).toBe(1);
    expect(body.result.efactor).toBeGreaterThanOrEqual(2.5);
  });

  it('POST /api/quiz/mistakes ingests feedback into database', async () => {
    const payload = {
      userId: 'student-1',
      anonId: 'anon-1',
      essayId: 'essay-1',
      feedback: [
        {
          sentence_id: 1,
          original: 'Technology play an important role.',
          band_65: 'Technology plays an important role.',
          band_75: 'Technology plays an indispensable role.',
          error_tags: ['subject-verb-agreement'],
          explanation: 'Singular subject requires plays.',
        },
      ],
    };

    const res = await app.inject({
      method: 'POST',
      url: '/api/quiz/mistakes',
      payload,
    });

    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(body.records).toHaveLength(1);
    expect(body.records[0].blank_phrase).toBe('play');
    expect(body.records[0].corrected_phrase).toBe('plays');
  });
});

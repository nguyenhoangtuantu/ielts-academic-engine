import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { SentenceFeedbackSchema } from '../core/llm/schemas';
import {
  generateDailyQuiz,
  submitQuizReview,
  saveMistakesFromFeedback,
  MistakeRepository,
  getDefaultMistakeRepository,
} from '../services/mistakeService';

/**
 * Zod validation schema for GET /api/quiz/daily query parameters.
 */
export const GetDailyQuizQuerySchema = z.object({
  userId: z.string().min(1, 'userId is required'),
  now: z.string().optional(),
});

export type GetDailyQuizQuery = z.infer<typeof GetDailyQuizQuerySchema>;

/**
 * Zod validation schema for POST /api/quiz/review request body.
 */
export const SubmitQuizReviewBodySchema = z.object({
  mistakeId: z.string().min(1, 'mistakeId is required'),
  grade: z
    .number()
    .int('Grade must be an integer')
    .min(0, 'Grade must be at least 0')
    .max(5, 'Grade must be at most 5'),
  timezoneOffsetHours: z.number().optional(),
});

export type SubmitQuizReviewBody = z.infer<typeof SubmitQuizReviewBodySchema>;

/**
 * Zod validation schema for POST /api/quiz/mistakes ingestion request body.
 */
export const SaveMistakesBodySchema = z.object({
  userId: z.string().nullable().optional(),
  anonId: z.string().min(1, 'anonId is required'),
  essayId: z.string().min(1, 'essayId is required'),
  feedback: z.array(SentenceFeedbackSchema).min(1, 'feedback array cannot be empty'),
});

export type SaveMistakesBody = z.infer<typeof SaveMistakesBodySchema>;

export interface QuizRouteOptions {
  db?: MistakeRepository;
}

/**
 * Fastify plugin registering Mistake Bank and Cloze Quiz REST API endpoints.
 */
export async function quizRoutes(
  fastify: FastifyInstance,
  options: QuizRouteOptions = {}
): Promise<void> {
  const getRepo = () => options.db ?? getDefaultMistakeRepository();

  /**
   * GET /api/quiz/daily
   * Retrieves deterministic cloze test questions for due mistakes (due_date <= now).
   */
  fastify.get('/api/quiz/daily', async (request: FastifyRequest, reply: FastifyReply) => {
    const queryResult = GetDailyQuizQuerySchema.safeParse(request.query);
    if (!queryResult.success) {
      return reply.status(400).send({
        success: false,
        error: queryResult.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '),
        details: queryResult.error.issues,
      });
    }

    const { userId, now: nowStr } = queryResult.data;
    const now = nowStr ? new Date(nowStr) : undefined;

    try {
      const questions = await generateDailyQuiz(userId, {
        db: getRepo(),
        now,
      });

      return reply.status(200).send({
        success: true,
        count: questions.length,
        questions,
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Internal server error';
      return reply.status(500).send({
        success: false,
        error: message,
      });
    }
  });

  /**
   * POST /api/quiz/review
   * Submits SM-2 review score for a mistake card, calculating updated SRS metrics.
   */
  fastify.post('/api/quiz/review', async (request: FastifyRequest, reply: FastifyReply) => {
    const bodyResult = SubmitQuizReviewBodySchema.safeParse(request.body);
    if (!bodyResult.success) {
      return reply.status(400).send({
        success: false,
        error: bodyResult.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '),
        details: bodyResult.error.issues,
      });
    }

    const { mistakeId, grade, timezoneOffsetHours } = bodyResult.data;

    try {
      const result = await submitQuizReview(mistakeId, grade, {
        db: getRepo(),
        timezoneOffsetHours,
      });

      return reply.status(200).send({
        success: true,
        result,
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Internal server error';
      if (/not found/i.test(message)) {
        return reply.status(404).send({
          success: false,
          error: message,
        });
      }
      return reply.status(500).send({
        success: false,
        error: message,
      });
    }
  });

  /**
   * POST /api/quiz/mistakes
   * Ingests sentence feedback and stores mistake records with initial SM-2 defaults.
   */
  fastify.post('/api/quiz/mistakes', async (request: FastifyRequest, reply: FastifyReply) => {
    const bodyResult = SaveMistakesBodySchema.safeParse(request.body);
    if (!bodyResult.success) {
      return reply.status(400).send({
        success: false,
        error: bodyResult.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '),
        details: bodyResult.error.issues,
      });
    }

    const { userId, anonId, essayId, feedback } = bodyResult.data;

    try {
      const records = await saveMistakesFromFeedback(
        userId ?? null,
        anonId,
        essayId,
        feedback,
        { db: getRepo() }
      );

      return reply.status(201).send({
        success: true,
        savedCount: records.length,
        records,
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Internal server error';
      return reply.status(500).send({
        success: false,
        error: message,
      });
    }
  });
}

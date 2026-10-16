import { z } from 'zod';

/**
 * Zod schema for individual sentence-level feedback.
 */
export const SentenceFeedbackSchema = z.object({
  sentence_id: z.number().int().positive(),
  original: z.string().min(1, 'Original sentence cannot be empty'),
  band_65: z.string().min(1, 'Band 6.5 revision cannot be empty'),
  band_75: z.string().min(1, 'Band 7.5 revision cannot be empty'),
  error_tags: z.array(z.string()),
  explanation: z.string().min(1, 'Explanation cannot be empty'),
});

export type SentenceFeedback = z.infer<typeof SentenceFeedbackSchema>;

/**
 * Zod schema for the full essay evaluation response from the LLM.
 * Supports responses wrapped in `sentences` or `feedback` arrays.
 */
export const EssayEvaluationSchema = z
  .object({
    sentences: z.array(SentenceFeedbackSchema).optional(),
    feedback: z.array(SentenceFeedbackSchema).optional(),
  })
  .refine((data) => data.sentences !== undefined || data.feedback !== undefined, {
    message: "Essay evaluation object must contain a 'sentences' or 'feedback' array.",
  });

export type EssayEvaluation = z.infer<typeof EssayEvaluationSchema>;

/**
 * Custom error thrown when LLM output violates schema or fails parsing.
 */
export class ValidationError extends Error {
  constructor(message: string, public readonly details?: unknown) {
    super(message);
    this.name = 'ValidationError';
    Object.setPrototypeOf(this, ValidationError.prototype);
  }
}

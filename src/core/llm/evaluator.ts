import { z } from 'zod';
import OpenAI from 'openai';
import { env } from '../../config/env';
import { splitSentences } from '../diff/sentenceSplitter';
import {
  SentenceFeedbackSchema,
  EssayEvaluationSchema,
  SentenceFeedback,
  EssayEvaluation,
  ValidationError,
} from './schemas';
import { buildEvaluationMessages } from './prompts';

export {
  SentenceFeedbackSchema,
  EssayEvaluationSchema,
  SentenceFeedback,
  EssayEvaluation,
  ValidationError,
};

export interface EvaluateOptions {
  maxRetries?: number;
  retryDelayMs?: number;
  timeoutMs?: number;
  model?: string;
}

/**
 * Parses and validates an LLM JSON string response into an array of SentenceFeedback items.
 *
 * Handles:
 * - Direct JSON arrays of SentenceFeedback
 * - JSON objects wrapping sentences in `sentences` or `feedback` properties
 * - Markdown code fences (` ```json ... ``` `)
 *
 * Throws a ValidationError if JSON is malformed or does not adhere to the schema.
 */
export function parseLLMResponse(jsonString: string): SentenceFeedback[] {
  if (typeof jsonString !== 'string' || !jsonString.trim()) {
    throw new ValidationError('LLM response is empty or not a string');
  }

  let cleaned = jsonString.trim();

  // Strip markdown code fences if present
  if (cleaned.startsWith('```')) {
    cleaned = cleaned
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```$/, '')
      .trim();
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch (err) {
    throw new ValidationError(
      `Failed to parse LLM response as JSON: ${(err as Error).message}`,
      err
    );
  }

  if (Array.isArray(parsed)) {
    const arrayResult = z.array(SentenceFeedbackSchema).safeParse(parsed);
    if (!arrayResult.success) {
      const details = arrayResult.error.issues
        .map((i) => `${i.path.join('.')}: ${i.message}`)
        .join(', ');
      throw new ValidationError(`Schema validation failed on feedback array: ${details}`, arrayResult.error);
    }
    return arrayResult.data;
  }

  if (parsed && typeof parsed === 'object') {
    const objResult = EssayEvaluationSchema.safeParse(parsed);
    if (!objResult.success) {
      const details = objResult.error.issues
        .map((i) => `${i.path.join('.')}: ${i.message}`)
        .join(', ');
      throw new ValidationError(`Schema validation failed on essay evaluation: ${details}`, objResult.error);
    }

    const sentences = objResult.data.sentences ?? objResult.data.feedback;
    if (!sentences) {
      throw new ValidationError("Evaluation object must contain 'sentences' or 'feedback' array.");
    }
    return sentences;
  }

  throw new ValidationError('Expected JSON response to be an array or object containing sentences');
}

/**
 * Evaluates an IELTS essay sentence-by-sentence using an LLM.
 *
 * Splits the essay into discrete sentences, formats structured evaluation prompt,
 * and calls OpenAI Chat Completions API with structured JSON output enforcement.
 * Automatically retries on malformed JSON, schema violation, or network timeout with exponential backoff.
 *
 * @param topicPrompt The IELTS Writing prompt/question.
 * @param essay The student essay text.
 * @param client Optional custom OpenAI client (useful for dependency injection and testing).
 * @param options Configuration for retries, timeouts, and model.
 * @returns Array of SentenceFeedback items for each sentence.
 */
export async function evaluateEssaySentences(
  topicPrompt: string,
  essay: string,
  client?: OpenAI | any,
  options?: EvaluateOptions
): Promise<SentenceFeedback[]> {
  const sentences = splitSentences(essay);
  if (sentences.length === 0) {
    return [];
  }

  const maxRetries = options?.maxRetries ?? 3;
  const retryDelayMs = options?.retryDelayMs ?? 1000;
  const timeoutMs = options?.timeoutMs ?? 30000;
  const model = options?.model ?? 'gpt-4o-mini';

  const llmClient = client ?? new OpenAI({
    apiKey: env.OPENAI_API_KEY,
    timeout: timeoutMs,
  });

  const messages = buildEvaluationMessages(topicPrompt, sentences);

  let lastError: unknown;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const response = await llmClient.chat.completions.create(
        {
          model,
          messages,
          response_format: { type: 'json_object' },
          max_tokens: 3500,
        },
        {
          timeout: timeoutMs,
        }
      );

      const content = response.choices?.[0]?.message?.content;
      if (!content) {
        throw new ValidationError('Received empty message content from LLM completion');
      }

      return parseLLMResponse(content);
    } catch (err) {
      lastError = err;

      if (attempt < maxRetries) {
        const delay = retryDelayMs * Math.pow(2, attempt - 1);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  throw lastError;
}

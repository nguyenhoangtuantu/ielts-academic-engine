import { describe, it, expect, vi } from 'vitest';
import {
  SentenceFeedbackSchema,
  EssayEvaluationSchema,
  ValidationError,
  parseLLMResponse,
  evaluateEssaySentences,
} from '../../src/core/llm/evaluator';
import { buildEvaluationMessages } from '../../src/core/llm/prompts';

describe('SentenceFeedbackSchema and EssayEvaluationSchema', () => {
  it('validates a correct sentence feedback object', () => {
    const validItem = {
      sentence_id: 1,
      original: 'Technology play an important role.',
      band_65: 'Technology plays an important role.',
      band_75: 'Technology plays an indispensable role in contemporary society.',
      error_tags: ['subject-verb-agreement', 'collocation'],
      explanation: 'Subject "Technology" is singular, requiring "plays".',
    };
    const result = SentenceFeedbackSchema.safeParse(validItem);
    expect(result.success).toBe(true);
  });

  it('rejects feedback items missing required fields', () => {
    const invalidItem = {
      sentence_id: 1,
      original: 'Technology play an important role.',
      band_65: 'Technology plays an important role.',
      // missing band_75, error_tags, explanation
    };
    const result = SentenceFeedbackSchema.safeParse(invalidItem);
    expect(result.success).toBe(false);
  });

  it('validates wrapped essay evaluations', () => {
    const validWrapper = {
      sentences: [
        {
          sentence_id: 1,
          original: 'Some people thinks so.',
          band_65: 'Some people think so.',
          band_75: 'A considerable cohort of scholars maintains this perspective.',
          error_tags: ['subject-verb-agreement'],
          explanation: 'Plural subject "people" takes base verb "think".',
        },
      ],
    };
    const result = EssayEvaluationSchema.safeParse(validWrapper);
    expect(result.success).toBe(true);
  });
});

describe('parseLLMResponse', () => {
  it('validates strictly structured feedback array', () => {
    const mockJson = JSON.stringify([
      {
        sentence_id: 1,
        original: 'I very like English.',
        band_65: 'I like English very much.',
        band_75: 'I have a profound passion for the English language.',
        error_tags: ['word-order', 'collocation'],
        explanation: "Avoid placing 'very' directly before a main verb.",
      },
    ]);
    const parsed = parseLLMResponse(mockJson);
    expect(parsed).toHaveLength(1);
    expect(parsed[0].sentence_id).toBe(1);
    expect(parsed[0].error_tags).toContain('word-order');
    expect(parsed[0].band_65).toBe('I like English very much.');
  });

  it('validates feedback wrapped in an object with sentences or feedback key', () => {
    const mockObj = JSON.stringify({
      sentences: [
        {
          sentence_id: 1,
          original: 'In conclusion, education is good.',
          band_65: 'In conclusion, education is beneficial.',
          band_75: 'In conclusion, the transformative value of tertiary education remains paramount.',
          error_tags: ['lexical-choice'],
          explanation: 'Replace generic "good" with academic alternatives.',
        },
      ],
    });
    const parsed = parseLLMResponse(mockObj);
    expect(parsed).toHaveLength(1);
    expect(parsed[0].sentence_id).toBe(1);
    expect(parsed[0].error_tags).toContain('lexical-choice');
  });

  it('strips markdown code blocks around JSON', () => {
    const mockWithFences = "```json\n" + JSON.stringify([
      {
        sentence_id: 1,
        original: 'It make people happy.',
        band_65: 'It makes people happy.',
        band_75: 'It fosters enduring personal well-being.',
        error_tags: ['subject-verb-agreement'],
        explanation: 'Singular subject "It" requires singular verb "makes".',
      },
    ]) + "\n```";

    const parsed = parseLLMResponse(mockWithFences);
    expect(parsed).toHaveLength(1);
    expect(parsed[0].sentence_id).toBe(1);
  });

  it('throws ValidationError on broken or truncated JSON', () => {
    expect(() => parseLLMResponse('{"broken":')).toThrow(ValidationError);
  });

  it('throws ValidationError when required schema fields are missing or mistyped', () => {
    const invalidJson = JSON.stringify([
      {
        sentence_id: 'invalid-id-type',
        original: 'Test sentence.',
      },
    ]);
    expect(() => parseLLMResponse(invalidJson)).toThrow(ValidationError);
  });
});

describe('buildEvaluationMessages and Prompts', () => {
  it('instructs LLM to evaluate sentence-by-sentence and never rewrite the entire essay', () => {
    const messages = buildEvaluationMessages('Some prompt', ['Sentence 1.', 'Sentence 2.']);
    const systemPrompt = messages.find((m) => m.role === 'system')?.content || '';
    const userPrompt = messages.find((m) => m.role === 'user')?.content || '';

    expect(systemPrompt.toLowerCase()).toContain('sentence-by-sentence');
    expect(systemPrompt.toLowerCase()).toContain('never rewrite');
    expect(userPrompt).toContain('Sentence 1.');
    expect(userPrompt).toContain('Sentence 2.');
    expect(userPrompt).toContain('[1]');
    expect(userPrompt).toContain('[2]');
  });
});

describe('evaluateEssaySentences', () => {
  it('returns empty array when essay text is empty or blank', async () => {
    const result = await evaluateEssaySentences('Topic', '   ');
    expect(result).toEqual([]);
  });

  it('evaluates sentences successfully with mock OpenAI client', async () => {
    const mockFeedback = [
      {
        sentence_id: 1,
        original: 'Governments should invest in public transport.',
        band_65: 'Governments ought to invest in public transport systems.',
        band_75: 'Municipal authorities should allocate substantial capital to public transit infrastructure.',
        error_tags: ['lexical-resource'],
        explanation: 'Elevates generic vocabulary to formal academic discourse.',
      },
    ];

    const mockCreate = vi.fn().mockResolvedValue({
      choices: [
        {
          message: {
            content: JSON.stringify({ sentences: mockFeedback }),
          },
        },
      ],
    });

    const mockClient = {
      chat: {
        completions: {
          create: mockCreate,
        },
      },
    };

    const result = await evaluateEssaySentences(
      'Should governments spend on public transport?',
      'Governments should invest in public transport.',
      mockClient as any
    );

    expect(result).toHaveLength(1);
    expect(result[0].sentence_id).toBe(1);
    expect(mockCreate).toHaveBeenCalledTimes(1);

    const callArgs = mockCreate.mock.calls[0][0];
    expect(callArgs.response_format).toEqual({ type: 'json_object' });
    expect(callArgs.max_tokens).toBe(3500);
  });

  it('retries when client returns malformed JSON and succeeds on retry', async () => {
    const validFeedback = [
      {
        sentence_id: 1,
        original: 'Education is very vital.',
        band_65: 'Education is vital.',
        band_75: 'Education is of paramount significance.',
        error_tags: ['redundancy', 'collocation'],
        explanation: 'Vital is an ungradable adjective; avoid "very vital".',
      },
    ];

    const mockCreate = vi
      .fn()
      .mockResolvedValueOnce({
        choices: [{ message: { content: '{"malformed": [' } }],
      })
      .mockResolvedValueOnce({
        choices: [
          { message: { content: JSON.stringify({ sentences: validFeedback }) } },
        ],
      });

    const mockClient = {
      chat: {
        completions: {
          create: mockCreate,
        },
      },
    };

    const result = await evaluateEssaySentences(
      'Topic',
      'Education is very vital.',
      mockClient as any,
      { maxRetries: 2, retryDelayMs: 10 }
    );

    expect(result).toHaveLength(1);
    expect(result[0].original).toBe('Education is very vital.');
    expect(mockCreate).toHaveBeenCalledTimes(2);
  });

  it('throws when all retries fail due to malformed JSON or timeout', async () => {
    const mockCreate = vi.fn().mockResolvedValue({
      choices: [{ message: { content: '{"truncated_json": ' } }],
    });

    const mockClient = {
      chat: {
        completions: {
          create: mockCreate,
        },
      },
    };

    await expect(
      evaluateEssaySentences('Topic', 'Some sentence.', mockClient as any, {
        maxRetries: 2,
        retryDelayMs: 5,
      })
    ).rejects.toThrow();

    expect(mockCreate).toHaveBeenCalledTimes(2);
  });
});

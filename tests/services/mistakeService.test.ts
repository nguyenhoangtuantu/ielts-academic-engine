import { describe, it, expect, beforeEach } from 'vitest';
import {
  maskContextSentence,
  saveMistakesFromFeedback,
  generateDailyQuiz,
  submitQuizReview,
  createInMemoryMistakeRepository,
  MistakeRecord,
  ClozeQuestion,
} from '../../src/services/mistakeService';
import { SentenceFeedback } from '../../src/core/llm/schemas';

describe('maskContextSentence', () => {
  it('masks the target error phrase into a cloze blank with index', () => {
    const sentence = 'It is vital to solve the problem about traffic.';
    const phrase = 'solve the problem about';
    const masked = maskContextSentence(sentence, phrase);
    expect(masked).toBe('It is vital to [.....] traffic.');
  });

  it('handles case-insensitive phrase matching', () => {
    const sentence = 'It is vital to Solve The Problem About traffic.';
    const phrase = 'solve the problem about';
    const masked = maskContextSentence(sentence, phrase);
    expect(masked).toBe('It is vital to [.....] traffic.');
  });

  it('trims leading/trailing whitespace and normalizes internal whitespace in phrase', () => {
    const sentence = 'It is vital to solve  the problem   about traffic.';
    const phrase = '  solve the problem about  ';
    const masked = maskContextSentence(sentence, phrase);
    expect(masked).toBe('It is vital to [.....] traffic.');
  });

  it('preserves sentence punctuation when target phrase is at the end of sentence', () => {
    const sentence = 'We need to address traffic.';
    const phrase = 'traffic';
    const masked = maskContextSentence(sentence, phrase);
    expect(masked).toBe('We need to address [.....].');
  });

  it('preserves sentence punctuation when phrase includes punctuation', () => {
    const sentence = 'Technology plays an important role in our lives.';
    const phrase = 'in our lives.';
    const masked = maskContextSentence(sentence, phrase);
    expect(masked).toBe('Technology plays an important role [.....].');
  });

  it('preserves punctuation before commas and mid-sentence clauses', () => {
    const sentence = 'Although he tried hard, he failed the exam.';
    const phrase = 'he tried hard';
    const masked = maskContextSentence(sentence, phrase);
    expect(masked).toBe('Although [.....], he failed the exam.');
  });

  it('returns sentence unchanged if target phrase is not found', () => {
    const sentence = 'The economy is growing rapidly.';
    const phrase = 'environment';
    const masked = maskContextSentence(sentence, phrase);
    expect(masked).toBe('The economy is growing rapidly.');
  });

  it('returns empty string if sentence is empty', () => {
    expect(maskContextSentence('', 'test')).toBe('');
  });
});

describe('Mistake Bank Ingestion & Quiz Generator', () => {
  let repo: ReturnType<typeof createInMemoryMistakeRepository>;

  beforeEach(() => {
    repo = createInMemoryMistakeRepository();
  });

  describe('saveMistakesFromFeedback', () => {
    it('extracts grammar tags, target phrases, and context sentences with initial SM-2 defaults', async () => {
      const feedback: SentenceFeedback[] = [
        {
          sentence_id: 1,
          original: 'Technology play an important role in society.',
          band_65: 'Technology plays an important role in society.',
          band_75: 'Technology plays an indispensable role in contemporary society.',
          error_tags: ['subject-verb-agreement'],
          explanation: 'Singular subject "Technology" requires singular verb "plays".',
        },
      ];

      const now = new Date('2026-10-16T10:00:00.000Z');
      const records = await saveMistakesFromFeedback(
        'user-123',
        'anon-session-abc',
        'essay-456',
        feedback,
        { db: repo, now }
      );

      expect(records).toHaveLength(1);
      const record = records[0];
      expect(record.user_id).toBe('user-123');
      expect(record.anonymous_session_id).toBe('anon-session-abc');
      expect(record.essay_id).toBe('essay-456');
      expect(record.context_sentence).toBe('Technology play an important role in society.');
      expect(record.blank_phrase).toBe('play');
      expect(record.corrected_phrase).toBe('plays');
      expect(record.error_tag).toBe('subject-verb-agreement');
      // SM-2 initial defaults
      expect(record.interval).toBe(0);
      expect(record.efactor).toBe(2.5);
      expect(record.repetitions).toBe(0);
      expect(record.due_date.toISOString()).toBe(now.toISOString());
    });

    it('handles multiple errors across feedback sentences and ignores error-free sentences', async () => {
      const feedback: SentenceFeedback[] = [
        {
          sentence_id: 1,
          original: 'This sentence is already perfect.',
          band_65: 'This sentence is already perfect.',
          band_75: 'This sentence is completely flawless.',
          error_tags: [],
          explanation: 'No grammatical errors found.',
        },
        {
          sentence_id: 2,
          original: 'He go to school yesterday.',
          band_65: 'He went to school yesterday.',
          band_75: 'He attended school yesterday.',
          error_tags: ['past-tense-verb', 'grammar'],
          explanation: 'Past tense required for past action.',
        },
      ];

      const records = await saveMistakesFromFeedback(
        null,
        'anon-session-456',
        'essay-789',
        feedback,
        { db: repo }
      );

      expect(records).toHaveLength(1);
      expect(records[0].user_id).toBeNull();
      expect(records[0].anonymous_session_id).toBe('anon-session-456');
      expect(records[0].blank_phrase).toBe('go');
      expect(records[0].corrected_phrase).toBe('went');
    });
  });

  describe('generateDailyQuiz', () => {
    it('queries mistakes where due_date <= now and constructs cloze questions deterministically without calling LLM', async () => {
      const now = new Date('2026-10-16T12:00:00.000Z');
      const past = new Date('2026-10-15T12:00:00.000Z');
      const future = new Date('2026-10-17T12:00:00.000Z');

      await repo.createMistakes([
        {
          id: 'mistake-due-1',
          user_id: 'user-1',
          anonymous_session_id: null,
          essay_id: 'essay-1',
          context_sentence: 'It is vital to solve the problem about traffic.',
          blank_phrase: 'solve the problem about',
          corrected_phrase: 'address the issue of',
          error_tag: 'collocation',
          interval: 0,
          efactor: 2.5,
          repetitions: 0,
          due_date: past,
        },
        {
          id: 'mistake-due-2',
          user_id: 'user-1',
          anonymous_session_id: null,
          essay_id: 'essay-1',
          context_sentence: 'Technology play an important role.',
          blank_phrase: 'play',
          corrected_phrase: 'plays',
          error_tag: 'subject-verb-agreement',
          interval: 0,
          efactor: 2.5,
          repetitions: 0,
          due_date: now,
        },
        {
          id: 'mistake-future',
          user_id: 'user-1',
          anonymous_session_id: null,
          essay_id: 'essay-1',
          context_sentence: 'Government should take actions.',
          blank_phrase: 'take actions',
          corrected_phrase: 'take action',
          error_tag: 'uncountable-noun',
          interval: 6,
          efactor: 2.5,
          repetitions: 2,
          due_date: future,
        },
        {
          id: 'mistake-other-user',
          user_id: 'user-2',
          anonymous_session_id: null,
          essay_id: 'essay-2',
          context_sentence: 'People thinks so.',
          blank_phrase: 'thinks',
          corrected_phrase: 'think',
          error_tag: 'subject-verb-agreement',
          interval: 0,
          efactor: 2.5,
          repetitions: 0,
          due_date: past,
        },
      ]);

      const quiz = await generateDailyQuiz('user-1', { db: repo, now });

      expect(quiz).toHaveLength(2);
      expect(quiz.map((q: ClozeQuestion) => q.id)).toEqual(['mistake-due-1', 'mistake-due-2']);

      const q1 = quiz.find((q: ClozeQuestion) => q.id === 'mistake-due-1')!;
      expect(q1.masked_sentence).toBe('It is vital to [.....] traffic.');
      expect(q1.target_phrase).toBe('address the issue of');
      expect(q1.hint).toBe('collocation');

      const q2 = quiz.find((q: ClozeQuestion) => q.id === 'mistake-due-2')!;
      expect(q2.masked_sentence).toBe('Technology [.....] an important role.');
      expect(q2.target_phrase).toBe('plays');
      expect(q2.hint).toBe('subject-verb-agreement');
    });

    it('returns empty array when no mistakes are due for the user', async () => {
      const now = new Date('2026-10-16T12:00:00.000Z');
      const future = new Date('2026-10-17T12:00:00.000Z');

      await repo.createMistakes([
        {
          id: 'mistake-1',
          user_id: 'user-1',
          anonymous_session_id: null,
          essay_id: 'essay-1',
          context_sentence: 'Test sentence.',
          blank_phrase: 'Test',
          corrected_phrase: 'Trial',
          error_tag: 'lexical-choice',
          interval: 1,
          efactor: 2.5,
          repetitions: 1,
          due_date: future,
        },
      ]);

      const quiz = await generateDailyQuiz('user-1', { db: repo, now });
      expect(quiz).toEqual([]);
    });
  });

  describe('submitQuizReview', () => {
    it('updates SM-2 metrics on mistake record after review', async () => {
      const now = new Date('2026-10-16T12:00:00.000Z');
      await repo.createMistakes([
        {
          id: 'mistake-test-1',
          user_id: 'user-1',
          anonymous_session_id: null,
          essay_id: 'essay-1',
          context_sentence: 'Technology play an important role.',
          blank_phrase: 'play',
          corrected_phrase: 'plays',
          error_tag: 'subject-verb-agreement',
          interval: 0,
          efactor: 2.5,
          repetitions: 0,
          due_date: now,
        },
      ]);

      // Grade 4 (good recall): repetitions 0 -> 1, interval 1 day
      const sm2Result = await submitQuizReview('mistake-test-1', 4, {
        db: repo,
        now,
        timezoneOffsetHours: 7,
      });

      expect(sm2Result.repetitions).toBe(1);
      expect(sm2Result.interval).toBe(1);
      expect(sm2Result.efactor).toBe(2.5);
      expect(sm2Result.dueDate).toBeDefined();

      const updated = await repo.getMistakeById('mistake-test-1');
      expect(updated?.repetitions).toBe(1);
      expect(updated?.interval).toBe(1);
      expect(updated?.efactor).toBe(2.5);
      expect(updated?.due_date.toISOString()).toBe(sm2Result.dueDate.toISOString());
    });

    it('resets interval and repetitions when grade is less than 3 (failed recall)', async () => {
      const now = new Date('2026-10-16T12:00:00.000Z');
      await repo.createMistakes([
        {
          id: 'mistake-test-2',
          user_id: 'user-1',
          anonymous_session_id: null,
          essay_id: 'essay-1',
          context_sentence: 'Technology play an important role.',
          blank_phrase: 'play',
          corrected_phrase: 'plays',
          error_tag: 'subject-verb-agreement',
          interval: 6,
          efactor: 2.5,
          repetitions: 2,
          due_date: now,
        },
      ]);

      const sm2Result = await submitQuizReview('mistake-test-2', 2, {
        db: repo,
        now,
      });

      expect(sm2Result.repetitions).toBe(0);
      expect(sm2Result.interval).toBe(1);
      expect(sm2Result.efactor).toBeLessThan(2.5);

      const updated = await repo.getMistakeById('mistake-test-2');
      expect(updated?.repetitions).toBe(0);
      expect(updated?.interval).toBe(1);
    });

    it('throws error when mistake id does not exist', async () => {
      await expect(submitQuizReview('non-existent-id', 4, { db: repo })).rejects.toThrow(
        /not found/i
      );
    });
  });
});

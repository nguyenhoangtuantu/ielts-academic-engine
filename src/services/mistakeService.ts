import { randomUUID } from 'crypto';
import { computeWordDiff } from '../core/diff/myersDiff';
import { calculateSM2, SM2Result } from '../core/srs/sm2';
import { SentenceFeedback } from '../core/llm/schemas';

export interface MistakeRecord {
  id: string;
  user_id: string | null;
  anonymous_session_id: string | null;
  essay_id: string;
  context_sentence: string;
  blank_phrase: string;
  corrected_phrase: string;
  error_tag: string;
  interval: number;
  efactor: number;
  repetitions: number;
  due_date: Date;
  created_at?: Date;
  updated_at?: Date;
}

export interface ClozeQuestion {
  id: string;
  masked_sentence: string;
  target_phrase: string;
  hint: string;
}

export interface MistakeRepository {
  createMistakes(records: MistakeRecord[]): Promise<MistakeRecord[]>;
  getDueMistakes(userId: string, now: Date): Promise<MistakeRecord[]>;
  getMistakeById(id: string): Promise<MistakeRecord | null>;
  updateMistakeSM2(
    id: string,
    update: { interval: number; efactor: number; repetitions: number; due_date: Date }
  ): Promise<MistakeRecord>;
}

export interface MistakeServiceOptions {
  db?: MistakeRepository;
  now?: Date;
  timezoneOffsetHours?: number;
}

/**
 * In-memory repository implementation for MistakeRecord operations.
 * Allows pure in-memory execution with 0 external dependencies for tests and local fallback.
 */
export function createInMemoryMistakeRepository(
  initialRecords: MistakeRecord[] = []
): MistakeRepository {
  const store = new Map<string, MistakeRecord>();

  for (const record of initialRecords) {
    store.set(record.id, { ...record });
  }

  return {
    async createMistakes(records: MistakeRecord[]): Promise<MistakeRecord[]> {
      const created: MistakeRecord[] = [];
      const now = new Date();
      for (const rec of records) {
        const id = rec.id || randomUUID();
        const saved: MistakeRecord = {
          ...rec,
          id,
          created_at: rec.created_at || now,
          updated_at: rec.updated_at || now,
        };
        store.set(id, saved);
        created.push(saved);
      }
      return created;
    },

    async getDueMistakes(userId: string, now: Date): Promise<MistakeRecord[]> {
      const results: MistakeRecord[] = [];
      for (const record of store.values()) {
        const matchesUser =
          record.user_id === userId || record.anonymous_session_id === userId;
        const isDue = new Date(record.due_date).getTime() <= now.getTime();
        if (matchesUser && isDue) {
          results.push({ ...record });
        }
      }
      return results;
    },

    async getMistakeById(id: string): Promise<MistakeRecord | null> {
      const record = store.get(id);
      return record ? { ...record } : null;
    },

    async updateMistakeSM2(
      id: string,
      update: { interval: number; efactor: number; repetitions: number; due_date: Date }
    ): Promise<MistakeRecord> {
      const existing = store.get(id);
      if (!existing) {
        throw new Error(`Mistake record not found for id: ${id}`);
      }
      const updated: MistakeRecord = {
        ...existing,
        ...update,
        updated_at: new Date(),
      };
      store.set(id, updated);
      return { ...updated };
    },
  };
}

let defaultRepo: MistakeRepository = createInMemoryMistakeRepository();

export function setDefaultMistakeRepository(repo: MistakeRepository): void {
  defaultRepo = repo;
}

export function getDefaultMistakeRepository(): MistakeRepository {
  return defaultRepo;
}

function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Converts the target error phrase in a sentence into a cloze blank `[.....]`.
 * Handles case-insensitive matches, whitespace trimming, and preserves sentence punctuation.
 *
 * @param sentence The original or context sentence.
 * @param phrase The error or target phrase to mask.
 * @param blank Optional custom blank placeholder (defaults to `[.....]`).
 */
export function maskContextSentence(
  sentence: string,
  phrase: string,
  blank: string = '[.....]'
): string {
  if (!sentence) return '';
  if (!phrase || !phrase.trim()) return sentence;

  const trimmedPhrase = phrase.trim();

  // Extract trailing punctuation from phrase if any (e.g. '.', ',', ';', '!', '?')
  const punctRegex = /([.,!?;:]+)$/;
  const trailingPunctMatch = trimmedPhrase.match(punctRegex);
  const trailingPunct = trailingPunctMatch ? trailingPunctMatch[1] : '';
  const corePhrase = trailingPunctMatch
    ? trimmedPhrase.slice(0, -trailingPunct.length).trim()
    : trimmedPhrase;

  const words = (corePhrase || trimmedPhrase).split(/\s+/).filter(Boolean).map(escapeRegExp);
  if (words.length === 0) return sentence;

  // Pattern matches words separated by one or more whitespace characters (case-insensitive)
  const pattern = new RegExp(words.join('\\s+'), 'i');
  const match = sentence.match(pattern);

  if (!match || match.index === undefined) {
    // Fallback: try matching the trimmed phrase directly
    const fallbackPattern = new RegExp(escapeRegExp(trimmedPhrase), 'i');
    const fallbackMatch = sentence.match(fallbackPattern);
    if (!fallbackMatch || fallbackMatch.index === undefined) {
      return sentence;
    }

    const matchIdx = fallbackMatch.index;
    const matchLength = fallbackMatch[0].length;
    const punctInMatch = fallbackMatch[0].match(/([.,!?;:]+)$/);
    const preservedPunct = punctInMatch ? punctInMatch[1] : '';
    const afterMatch = sentence.slice(matchIdx + matchLength);

    return (
      sentence.slice(0, matchIdx) +
      blank +
      (afterMatch.startsWith(preservedPunct) ? '' : preservedPunct) +
      afterMatch
    );
  }

  const matchIdx = match.index;
  const matchLength = match[0].length;
  const afterMatch = sentence.slice(matchIdx + matchLength);

  let preservedPunct = '';
  const matchEndPunct = match[0].match(/([.,!?;:]+)$/);
  if (matchEndPunct) {
    preservedPunct = matchEndPunct[1];
  } else if (trailingPunct && !afterMatch.startsWith(trailingPunct)) {
    preservedPunct = trailingPunct;
  }

  return sentence.slice(0, matchIdx) + blank + preservedPunct + afterMatch;
}

/**
 * Extracts error phrase and corrected phrase pairs between original and revised sentences
 * using the word-level Myers diff algorithm.
 */
export function extractMistakePhrases(
  original: string,
  revised: string
): Array<{ blank_phrase: string; corrected_phrase: string }> {
  if (original === revised) return [];

  const chunks = computeWordDiff(original, revised);
  const pairs: Array<{ blank_phrase: string; corrected_phrase: string }> = [];

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];

    if (chunk.type === 'delete') {
      const nextChunk = chunks[i + 1];
      if (nextChunk && nextChunk.type === 'insert') {
        pairs.push({
          blank_phrase: chunk.value.trim(),
          corrected_phrase: nextChunk.value.trim(),
        });
        i++; // consumed adjacent insert
      } else {
        pairs.push({
          blank_phrase: chunk.value.trim(),
          corrected_phrase: '',
        });
      }
    } else if (chunk.type === 'insert') {
      pairs.push({
        blank_phrase: '',
        corrected_phrase: chunk.value.trim(),
      });
    }
  }

  return pairs;
}

/**
 * Ingests sentence-level feedback from Task 3 into the mistake bank.
 * Extracts grammar tags, target phrases, and context sentences, and assigns
 * initial SM-2 defaults: interval=0, efactor=2.5, repetitions=0, due_date=NOW.
 */
export async function saveMistakesFromFeedback(
  userId: string | null,
  anonId: string,
  essayId: string,
  feedback: SentenceFeedback[],
  options?: MistakeServiceOptions
): Promise<MistakeRecord[]> {
  const repo = options?.db ?? defaultRepo;
  const now = options?.now ?? new Date();

  const toCreate: MistakeRecord[] = [];

  for (const item of feedback) {
    const isClean =
      item.original === item.band_65 && (!item.error_tags || item.error_tags.length === 0);
    if (isClean) {
      continue;
    }

    const errorTag =
      item.error_tags && item.error_tags.length > 0
        ? item.error_tags.join(', ')
        : 'grammar';

    const pairs = extractMistakePhrases(item.original, item.band_65);

    if (pairs.length > 0) {
      for (const pair of pairs) {
        // Skip empty pairs
        if (!pair.blank_phrase && !pair.corrected_phrase) continue;

        toCreate.push({
          id: randomUUID(),
          user_id: userId,
          anonymous_session_id: anonId,
          essay_id: essayId,
          context_sentence: item.original,
          blank_phrase: pair.blank_phrase,
          corrected_phrase: pair.corrected_phrase,
          error_tag: errorTag,
          interval: 0,
          efactor: 2.5,
          repetitions: 0,
          due_date: now,
          created_at: now,
          updated_at: now,
        });
      }
    } else if (item.original !== item.band_65) {
      // Fallback if tokenization diff didn't yield clean pairs
      toCreate.push({
        id: randomUUID(),
        user_id: userId,
        anonymous_session_id: anonId,
        essay_id: essayId,
        context_sentence: item.original,
        blank_phrase: item.original,
        corrected_phrase: item.band_65,
        error_tag: errorTag,
        interval: 0,
        efactor: 2.5,
        repetitions: 0,
        due_date: now,
        created_at: now,
        updated_at: now,
      });
    }
  }

  if (toCreate.length === 0) {
    return [];
  }

  return repo.createMistakes(toCreate);
}

/**
 * Queries mistakes where due_date <= now for the specified user or anonymous session.
 * Deterministically constructs cloze test questions `{ id, masked_sentence, target_phrase, hint }`
 * without making runtime LLM calls.
 */
export async function generateDailyQuiz(
  userId: string,
  options?: MistakeServiceOptions
): Promise<ClozeQuestion[]> {
  const repo = options?.db ?? defaultRepo;
  const now = options?.now ?? new Date();

  const dueRecords = await repo.getDueMistakes(userId, now);

  const questions: ClozeQuestion[] = [];

  for (const record of dueRecords) {
    const target_phrase = record.corrected_phrase || record.blank_phrase;

    // Use blank_phrase to mask the context sentence if available, else target_phrase
    const phraseToMask = record.blank_phrase || record.corrected_phrase;
    const masked_sentence = maskContextSentence(record.context_sentence, phraseToMask);

    questions.push({
      id: record.id,
      masked_sentence,
      target_phrase,
      hint: record.error_tag,
    });
  }

  return questions;
}

/**
 * Submits learner review grade (0-5) for a mistake card.
 * Uses `calculateSM2` to compute new interval, efactor, repetitions, and due_date,
 * and persists the updated SM-2 metrics.
 */
export async function submitQuizReview(
  mistakeId: string,
  grade: number,
  options?: MistakeServiceOptions
): Promise<SM2Result> {
  const repo = options?.db ?? defaultRepo;
  const now = options?.now ?? new Date();
  const timezoneOffsetHours = options?.timezoneOffsetHours ?? 0;

  const record = await repo.getMistakeById(mistakeId);
  if (!record) {
    throw new Error(`Mistake record not found for id: ${mistakeId}`);
  }

  const sm2Result = calculateSM2(
    {
      interval: record.interval,
      efactor: record.efactor,
      repetitions: record.repetitions,
      due_date: record.due_date,
    },
    grade,
    { now, timezoneOffsetHours }
  );

  await repo.updateMistakeSM2(mistakeId, {
    interval: sm2Result.interval,
    efactor: sm2Result.efactor,
    repetitions: sm2Result.repetitions,
    due_date: sm2Result.dueDate,
  });

  return sm2Result;
}

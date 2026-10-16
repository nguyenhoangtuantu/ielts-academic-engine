import { describe, it, expect } from 'vitest';
import { calculateSM2, SM2Card } from '../../src/core/srs/sm2';
import * as fs from 'fs';
import * as path from 'path';

describe('calculateSM2', () => {
  it('correctly sets initial intervals on first and second successful reviews', () => {
    const initial: SM2Card = { repetitions: 0, interval: 0, efactor: 2.5 };
    const step1 = calculateSM2(initial, 4);
    expect(step1.repetitions).toBe(1);
    expect(step1.interval).toBe(1);

    const step2 = calculateSM2(step1, 4);
    expect(step2.repetitions).toBe(2);
    expect(step2.interval).toBe(6);
  });

  it('calculates subsequent intervals when repetitions >= 2', () => {
    const card: SM2Card = { repetitions: 2, interval: 6, efactor: 2.5 };
    const step3 = calculateSM2(card, 4);
    expect(step3.repetitions).toBe(3);
    // 6 * 2.5 = 15
    expect(step3.interval).toBe(15);

    const step4 = calculateSM2(step3, 4);
    expect(step4.repetitions).toBe(4);
    // 15 * 2.5 = 37.5 -> rounded to 38
    expect(step4.interval).toBe(38);
  });

  it('resets repetitions on failed review (grade < 3)', () => {
    const card: SM2Card = { repetitions: 4, interval: 30, efactor: 2.4 };
    const failed = calculateSM2(card, 2);
    expect(failed.repetitions).toBe(0);
    expect(failed.interval).toBe(1);
  });

  it('updates efactor according to SuperMemo-2 formula', () => {
    const card: SM2Card = { repetitions: 1, interval: 1, efactor: 2.5 };

    // Grade 5: EF' = EF + (0.1 - 0) = EF + 0.1 = 2.6
    const g5 = calculateSM2(card, 5);
    expect(g5.efactor).toBe(2.6);

    // Grade 4: EF' = EF + (0.1 - 0.1) = EF = 2.5
    const g4 = calculateSM2(card, 4);
    expect(g4.efactor).toBe(2.5);

    // Grade 3: EF' = EF + (0.1 - 2 * 0.12) = EF - 0.14 = 2.36
    const g3 = calculateSM2(card, 3);
    expect(g3.efactor).toBe(2.36);

    // Grade 2: EF' = EF + (0.1 - 3 * 0.14) = EF - 0.32 = 2.18
    const g2 = calculateSM2(card, 2);
    expect(g2.efactor).toBe(2.18);
  });

  it('enforces minimum efactor limit of 1.3', () => {
    // Starting near boundary: 1.4, grade 0: EF delta = -0.8 -> 0.6 -> clamped to 1.3
    const card: SM2Card = { repetitions: 2, interval: 6, efactor: 1.4 };
    const result = calculateSM2(card, 0);
    expect(result.efactor).toBe(1.3);

    // Hard floor remains 1.3
    const cardAtFloor: SM2Card = { repetitions: 0, interval: 1, efactor: 1.3 };
    const resultFloor = calculateSM2(cardAtFloor, 1);
    expect(resultFloor.efactor).toBe(1.3);
  });

  it('provides both dueDate and due_date aliases on result', () => {
    const card: SM2Card = { repetitions: 0, interval: 0, efactor: 2.5 };
    const fixedNow = new Date('2026-10-16T10:00:00.000Z');
    const result = calculateSM2(card, 4, { now: fixedNow, timezoneOffsetHours: 0 });

    expect(result.dueDate).toBeInstanceOf(Date);
    expect(result.due_date).toBeInstanceOf(Date);
    expect(result.dueDate.getTime()).toBe(result.due_date.getTime());
  });

  describe('timezone boundary calculation (Review Focus Item 4)', () => {
    it('test_sm2_timezone_boundary_calculation: prevents premature review across UTC vs local GMT+7 day boundaries', () => {
      // User in Vietnam (GMT+7) reviews essay mistake at 01:00 AM on Oct 16 local time.
      // UTC time is 18:00 on Oct 15.
      const reviewTimeUtc = new Date('2026-10-15T18:00:00.000Z');
      const card: SM2Card = { repetitions: 0, interval: 0, efactor: 2.5 };

      // Naive UTC calculation (offset 0) mistakenly uses UTC date Oct 15 -> schedules due date for Oct 16 00:00:00 UTC (07:00 AM local time).
      const naiveUtcResult = calculateSM2(card, 4, { now: reviewTimeUtc, timezoneOffsetHours: 0 });
      expect(naiveUtcResult.dueDate.toISOString()).toBe('2026-10-16T00:00:00.000Z');

      // GMT+7 calculation (offset 7) correctly detects local calendar date is already Oct 16 -> schedules for Oct 17 00:00:00 GMT+7 (Oct 16 17:00:00 UTC).
      const gmt7Result = calculateSM2(card, 4, { now: reviewTimeUtc, timezoneOffsetHours: 7 });
      expect(gmt7Result.dueDate.toISOString()).toBe('2026-10-16T17:00:00.000Z');

      // Later that same morning at 08:00 AM local time (01:00 UTC on Oct 16):
      const morningCheckTime = new Date('2026-10-16T01:00:00.000Z');

      // Naive calculation causes PREMATURE review (8 AM > 7 AM, card appears again on the same day!):
      expect(morningCheckTime >= naiveUtcResult.dueDate).toBe(true);

      // GMT+7 calculation correctly holds card until tomorrow:
      expect(morningCheckTime < gmt7Result.dueDate).toBe(true);
    });

    it('allows passing timezone offset directly as a number', () => {
      const fixedNow = new Date('2026-10-15T18:00:00.000Z');
      const card: SM2Card = { repetitions: 0, interval: 0, efactor: 2.5 };
      const res = calculateSM2(card, 4, { now: fixedNow, timezoneOffsetHours: 7 });
      const resWithNumber = calculateSM2(card, 4, 7);

      expect(res.dueDate.toISOString()).toBe('2026-10-16T17:00:00.000Z');
      // When options is a number, it sets timezone offset and uses current time
      expect(resWithNumber.dueDate).toBeInstanceOf(Date);
    });
  });

  it('throws an error for invalid grade values outside [0..5]', () => {
    const card: SM2Card = { repetitions: 0, interval: 0, efactor: 2.5 };
    expect(() => calculateSM2(card, -1)).toThrow(/Grade must be an integer between 0 and 5/);
    expect(() => calculateSM2(card, 6)).toThrow(/Grade must be an integer between 0 and 5/);
    expect(() => calculateSM2(card, NaN)).toThrow(/Grade must be an integer between 0 and 5/);
  });
});

describe('Database Schema & RLS Migration DDL', () => {
  const migrationPath = path.resolve(__dirname, '../../src/db/migrations/001_initial_schema.sql');

  it('contains DDL migration file with all required tables and indexes', () => {
    expect(fs.existsSync(migrationPath)).toBe(true);
    const sql = fs.readFileSync(migrationPath, 'utf8');

    // Tables
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS users');
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS payments');
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS essays');
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS mistakes');

    // Row-Level Security enablement on all tables
    expect(sql).toContain('ALTER TABLE users ENABLE ROW LEVEL SECURITY;');
    expect(sql).toContain('ALTER TABLE payments ENABLE ROW LEVEL SECURITY;');
    expect(sql).toContain('ALTER TABLE essays ENABLE ROW LEVEL SECURITY;');
    expect(sql).toContain('ALTER TABLE mistakes ENABLE ROW LEVEL SECURITY;');

    // Indexes on slug, user_id, due_date
    expect(sql).toContain('idx_essays_slug');
    expect(sql).toContain('idx_essays_user_id');
    expect(sql).toContain('idx_mistakes_user_id');
    expect(sql).toContain('idx_mistakes_due_date');

    // Policies: public SEO essays, user isolation, anonymous sessions
    expect(sql).toContain('CREATE POLICY "Public essays are viewable by everyone"');
    expect(sql).toContain('CREATE POLICY "Users can view their own essays"');
    expect(sql).toContain('CREATE POLICY "Anonymous sessions can view their essays"');
    expect(sql).toContain('CREATE POLICY "Users can view their own mistakes"');
    expect(sql).toContain('CREATE POLICY "Users can view their own payments"');
  });
});

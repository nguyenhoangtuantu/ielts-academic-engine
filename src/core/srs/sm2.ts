/**
 * SuperMemo-2 (SM-2) Spaced Repetition Algorithm Implementation.
 *
 * Implements standard SM-2 intervals, factor calculation, and timezone-aware
 * due date scheduling to prevent premature / delayed review desync across UTC
 * and learner local timezones (e.g. GMT+7).
 */

export interface SM2Card {
  repetitions: number;
  interval: number;
  efactor: number;
  dueDate?: Date | string;
  due_date?: Date | string;
}

export interface SM2Result {
  repetitions: number;
  interval: number;
  efactor: number;
  dueDate: Date;
  due_date: Date;
}

export interface SM2Options {
  now?: Date;
  timezoneOffsetHours?: number;
}

/**
 * Calculates next review due date with timezone offset support.
 * Schedules the card for 00:00:00 (local midnight) on the target day in the learner's timezone,
 * preventing premature same-day reviews across UTC / local day boundaries (e.g. GMT+7).
 */
export function calculateDueDate(
  now: Date,
  intervalDays: number,
  timezoneOffsetHours: number = 0
): Date {
  const offsetMs = timezoneOffsetHours * 60 * 60 * 1000;
  // Shift current UTC time by timezone offset to obtain local calendar date
  const localTime = new Date(now.getTime() + offsetMs);

  const localYear = localTime.getUTCFullYear();
  const localMonth = localTime.getUTCMonth();
  const localDate = localTime.getUTCDate();

  // Target local midnight after intervalDays
  const targetLocalDate = localDate + intervalDays;
  const targetLocalMidnightUtcMs = Date.UTC(localYear, localMonth, targetLocalDate, 0, 0, 0, 0);

  // Shift back to UTC
  const dueUtcMs = targetLocalMidnightUtcMs - offsetMs;
  return new Date(dueUtcMs);
}

/**
 * Calculates updated SM-2 parameters after a review response.
 *
 * Grade quality scale:
 * 5 - perfect response
 * 4 - correct response after a hesitation
 * 3 - correct response recalled with serious difficulty
 * 2 - incorrect response; where the correct one seemed easy to recall
 * 1 - incorrect response; the correct one remembered
 * 0 - complete blackout
 *
 * @param card Current card state (repetitions, interval, efactor)
 * @param grade Review grade (0 to 5)
 * @param optionsOrOffset Optional configuration object or timezone offset in hours
 */
export function calculateSM2(
  card: SM2Card,
  grade: number,
  optionsOrOffset?: SM2Options | number
): SM2Result {
  if (typeof grade !== 'number' || isNaN(grade) || grade < 0 || grade > 5) {
    throw new Error(`Grade must be an integer between 0 and 5, received: ${grade}`);
  }

  let now = new Date();
  let timezoneOffsetHours = 0;

  if (typeof optionsOrOffset === 'number') {
    timezoneOffsetHours = optionsOrOffset;
  } else if (optionsOrOffset && typeof optionsOrOffset === 'object') {
    if (optionsOrOffset.now instanceof Date) {
      now = optionsOrOffset.now;
    }
    if (typeof optionsOrOffset.timezoneOffsetHours === 'number') {
      timezoneOffsetHours = optionsOrOffset.timezoneOffsetHours;
    }
  }

  const currentEfactor = card.efactor ?? 2.5;
  const currentRepetitions = card.repetitions ?? 0;
  const currentInterval = card.interval ?? 0;

  // SuperMemo-2 E-Factor formula:
  // EF' = EF + (0.1 - (5 - grade) * (0.08 + (5 - grade) * 0.02))
  const delta = 0.1 - (5 - grade) * (0.08 + (5 - grade) * 0.02);
  const rawEfactor = currentEfactor + delta;
  const newEfactor = Math.max(1.3, Math.round((rawEfactor + Number.EPSILON) * 100) / 100);

  let newRepetitions: number;
  let newInterval: number;

  if (grade >= 3) {
    if (currentRepetitions === 0) {
      newRepetitions = 1;
      newInterval = 1;
    } else if (currentRepetitions === 1) {
      newRepetitions = 2;
      newInterval = 6;
    } else {
      newRepetitions = currentRepetitions + 1;
      newInterval = Math.round(currentInterval * newEfactor);
    }
  } else {
    newRepetitions = 0;
    newInterval = 1;
  }

  const dueDate = calculateDueDate(now, newInterval, timezoneOffsetHours);

  return {
    repetitions: newRepetitions,
    interval: newInterval,
    efactor: newEfactor,
    dueDate,
    due_date: dueDate,
  };
}

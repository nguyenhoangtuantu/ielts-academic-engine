import { describe, it, expect } from 'vitest';
import { computeWordDiff, type DiffChunk } from '../../src/core/diff/myersDiff';

describe('computeWordDiff', () => {
  it('identifies word insertions, deletions, and equalities', () => {
    const orig = 'I have many problems';
    const rev = 'I face numerous challenges';
    const diff = computeWordDiff(orig, rev);
    expect(diff).toEqual([
      { type: 'equal', value: 'I ' },
      { type: 'delete', value: 'have many problems' },
      { type: 'insert', value: 'face numerous challenges' },
    ]);
  });

  it('handles identical strings by returning a single equal chunk', () => {
    const text = 'The global economy is evolving rapidly.';
    const diff = computeWordDiff(text, text);
    expect(diff).toEqual([
      { type: 'equal', value: 'The global economy is evolving rapidly.' },
    ]);
  });

  it('handles empty original as pure insertion', () => {
    const rev = 'A completely new sentence.';
    const diff = computeWordDiff('', rev);
    expect(diff).toEqual([
      { type: 'insert', value: 'A completely new sentence.' },
    ]);
  });

  it('handles empty revised as pure deletion', () => {
    const orig = 'A completely removed sentence.';
    const diff = computeWordDiff(orig, '');
    expect(diff).toEqual([
      { type: 'delete', value: 'A completely removed sentence.' },
    ]);
  });

  it('handles both empty strings by returning an empty array', () => {
    expect(computeWordDiff('', '')).toEqual([]);
  });

  it('handles word deletion in the middle of a sentence', () => {
    const orig = 'The quick brown fox jumps';
    const rev = 'The brown fox jumps';
    const diff = computeWordDiff(orig, rev);
    expect(diff).toEqual([
      { type: 'equal', value: 'The ' },
      { type: 'delete', value: 'quick ' },
      { type: 'equal', value: 'brown fox jumps' },
    ]);
  });

  it('handles word insertion in the middle of a sentence', () => {
    const orig = 'The brown fox jumps';
    const rev = 'The quick brown fox jumps';
    const diff = computeWordDiff(orig, rev);
    expect(diff).toEqual([
      { type: 'equal', value: 'The ' },
      { type: 'insert', value: 'quick ' },
      { type: 'equal', value: 'brown fox jumps' },
    ]);
  });

  it('handles punctuation differences accurately', () => {
    const orig = 'In fact, education is vital.';
    const rev = 'In fact; education is essential.';
    const diff = computeWordDiff(orig, rev);
    // Preserves invariant and isolates the punctuation / word changes
    const reconstructedOrig = diff
      .filter((c: DiffChunk) => c.type !== 'insert')
      .map((c: DiffChunk) => c.value)
      .join('');
    const reconstructedRev = diff
      .filter((c: DiffChunk) => c.type !== 'delete')
      .map((c: DiffChunk) => c.value)
      .join('');
    expect(reconstructedOrig).toBe(orig);
    expect(reconstructedRev).toBe(rev);
  });

  it('maintains strict bidirectional reconstruction invariant on complex essays', () => {
    const orig =
      'Although technology has many benefits, it also create serious issue for young people in modern society.';
    const rev =
      'While technological advancements offer numerous advantages, they also create substantial challenges for adolescents in contemporary society.';

    const diff = computeWordDiff(orig, rev);

    const reconstructedOrig = diff
      .filter((c: DiffChunk) => c.type !== 'insert')
      .map((c: DiffChunk) => c.value)
      .join('');
    const reconstructedRev = diff
      .filter((c: DiffChunk) => c.type !== 'delete')
      .map((c: DiffChunk) => c.value)
      .join('');

    expect(reconstructedOrig).toBe(orig);
    expect(reconstructedRev).toBe(rev);

    // Verify consecutive chunks are merged and no empty values exist
    for (let i = 0; i < diff.length; i++) {
      expect(diff[i].value.length).toBeGreaterThan(0);
      if (i > 0) {
        expect(diff[i].type).not.toBe(diff[i - 1].type);
      }
    }
  });
});

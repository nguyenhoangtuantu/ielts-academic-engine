import { describe, it, expect } from 'vitest';
import { splitSentences } from '../../src/core/diff/sentenceSplitter';

describe('splitSentences', () => {
  it('handles standard periods, question marks, and exclamation marks', () => {
    const text = 'This is sentence one. Is this two? Yes it is!';
    expect(splitSentences(text)).toEqual([
      'This is sentence one.',
      'Is this two?',
      'Yes it is!',
    ]);
  });

  it('does not split on abbreviations such as U.S.A., e.g., and Mr.', () => {
    const text = 'In the U.S.A., Mr. Smith argued e.g. economics was vital. Next sentence.';
    expect(splitSentences(text)).toHaveLength(2);
    expect(splitSentences(text)).toEqual([
      'In the U.S.A., Mr. Smith argued e.g. economics was vital.',
      'Next sentence.',
    ]);
  });

  it('handles titles and academic honorifics without splitting', () => {
    const text = 'Dr. Watson and Prof. Moriarty met at St. Jude Hospital. They discussed biology.';
    expect(splitSentences(text)).toEqual([
      'Dr. Watson and Prof. Moriarty met at St. Jude Hospital.',
      'They discussed biology.',
    ]);
  });

  it('preserves decimal numbers and currency figures', () => {
    const text = 'Inflation rose by 3.5% in 2023. The item costs $12.99 today.';
    expect(splitSentences(text)).toEqual([
      'Inflation rose by 3.5% in 2023.',
      'The item costs $12.99 today.',
    ]);
  });

  it('handles quotes enclosing sentence terminators', () => {
    const text = 'She said, "This is essential." Then she left the room.';
    expect(splitSentences(text)).toEqual([
      'She said, "This is essential."',
      'Then she left the room.',
    ]);
  });

  it('splits across paragraph breaks with multiple newlines', () => {
    const text = 'First paragraph sentence.\n\nSecond paragraph sentence one. Sentence two.';
    expect(splitSentences(text)).toEqual([
      'First paragraph sentence.',
      'Second paragraph sentence one.',
      'Sentence two.',
    ]);
  });

  it('handles single sentence without trailing punctuation', () => {
    const text = 'Just a single statement without dot';
    expect(splitSentences(text)).toEqual(['Just a single statement without dot']);
  });

  it('returns empty array for empty or whitespace-only strings', () => {
    expect(splitSentences('')).toEqual([]);
    expect(splitSentences('   \n\t  ')).toEqual([]);
  });

  it('handles ellipsis without premature splitting', () => {
    const text = 'Thinking... is necessary. Action follows.';
    expect(splitSentences(text)).toEqual([
      'Thinking... is necessary.',
      'Action follows.',
    ]);
  });

  it('handles common academic abbreviations like etc. and i.e.', () => {
    const text = 'Students study arts, sciences, etc., in modern schools. That is, i.e. education is broad. Next thought.';
    expect(splitSentences(text)).toEqual([
      'Students study arts, sciences, etc., in modern schools.',
      'That is, i.e. education is broad.',
      'Next thought.',
    ]);
  });
});

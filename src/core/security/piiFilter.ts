/**
 * PII Masking and Content Sanitization Module
 *
 * Provides:
 * 1. Masking of Personally Identifiable Information (Vietnamese & international phone numbers, emails)
 * 2. Neutralization and escaping of XSS tags and malicious protocols
 * 3. SEO-friendly kebab-case slug generation with diacritics removal
 */

/**
 * Regex matching Vietnamese phone numbers:
 * - Country code prefixes: +84, (+84), 84 with optional zero: +84 905 123 456
 * - Domestic mobile prefixes: 03x, 05x, 07x, 08x, 09x (10 digits total)
 * - Domestic landline prefixes: 02x (11 digits total)
 * - Delimiters supported: spaces, hyphens, periods, or no delimiters
 */
const VIETNAMESE_PHONE_REGEX = /(?:(?:\+84|(?:\(\+84\))|84)[-.\s]?(?:\(0\)|0)?[-.\s]?[235789](?:[-.\s]?\d){7,8}\b|(?:\(0\d{2,3}\)|0)(?:[35789]|2\d)(?:[-.\s]?\d){7,8}\b)/g;

/**
 * Regex matching international phone numbers formatted with international plus sign (+1, +44, etc.)
 */
const INTL_PHONE_REGEX = /\+\d{1,3}[-.\s]?(?:\(\d{1,4}\)|\d{1,4})(?:[-.\s]?\d{2,4}){2,4}\b/g;

/**
 * Standard RFC-compliant email matching regex
 */
const EMAIL_REGEX = /\b[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}\b/g;

export interface SanitizedPIIResult {
  cleanText: string;
  hasPII: boolean;
}

/**
 * Sanitizes input text by masking personal identifiers and escaping malicious XSS markup.
 *
 * @param text The input essay or user submission text
 * @returns Object containing the cleaned text and a boolean flag indicating if PII was detected
 */
export function sanitizeAndMaskPII(text: string): SanitizedPIIResult {
  if (!text) {
    return { cleanText: '', hasPII: false };
  }

  let clean = text;
  let hasPII = false;

  // 1. Mask email addresses
  clean = clean.replace(EMAIL_REGEX, () => {
    hasPII = true;
    return '[EMAIL]';
  });

  // 2. Mask Vietnamese phone numbers
  clean = clean.replace(VIETNAMESE_PHONE_REGEX, () => {
    hasPII = true;
    return '[PHONE]';
  });

  // 3. Mask international phone numbers
  clean = clean.replace(INTL_PHONE_REGEX, () => {
    hasPII = true;
    return '[PHONE]';
  });

  // 4. Neutralize dangerous javascript: pseudo-protocols
  clean = clean.replace(/javascript\s*:/gi, '[BLOCKED_URI]');

  // 5. Escape HTML angle brackets to completely neutralize any XSS markup
  clean = clean.replace(/</g, '&lt;').replace(/>/g, '&gt;');

  return {
    cleanText: clean,
    hasPII,
  };
}

/**
 * Generates an SEO-optimized kebab-case URL slug from an essay title.
 * Removes Vietnamese diacritics, normalizes accented characters, converts đ/Đ to d,
 * removes punctuation, collapses consecutive hyphens, and trims boundaries.
 *
 * @param title Essay topic or title string
 * @returns Clean kebab-case slug (e.g., 'bai-viet-mau-ielts-writing-task-2')
 */
export function generateSlug(title: string): string {
  if (!title) return '';

  return title
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // remove decomposed diacritical marks
    .replace(/[đĐ]/g, 'd') // replace Vietnamese đ/Đ
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-') // convert non-alphanumeric characters to hyphens
    .replace(/^-+|-+$/g, ''); // strip leading and trailing hyphens
}

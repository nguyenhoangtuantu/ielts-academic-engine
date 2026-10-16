import { describe, it, expect } from 'vitest';
import { sanitizeAndMaskPII, generateSlug } from '../../src/core/security/piiFilter';

describe('sanitizeAndMaskPII', () => {
  it('replaces Vietnamese phone numbers and emails with placeholders', () => {
    const input = "Contact me at tuann@vku.udn.vn or 0905123456 for details.";
    const { cleanText } = sanitizeAndMaskPII(input);
    expect(cleanText).not.toContain("0905123456");
    expect(cleanText).not.toContain("tuann@vku.udn.vn");
    expect(cleanText).toContain("[EMAIL]");
    expect(cleanText).toContain("[PHONE]");
  });

  it('escapes potential XSS tags', () => {
    const malicious = "<script>alert('xss')</script>";
    const { cleanText } = sanitizeAndMaskPII(malicious);
    expect(cleanText).not.toContain("<script>");
  });

  describe('phone number masking edge cases', () => {
    it('masks various Vietnamese mobile formats and prefixes', () => {
      const inputs = [
        "Call 0905123456 now",
        "Phone: 0388123456",
        "Mobile: 0771234567",
        "Hotline: 0868123456",
        "Number: 0568123456",
        "Spaced: 0905 123 456",
        "Dashed: 0905-123-456",
        "Dotted: 0905.123.456",
        "Intl: +84905123456",
        "Intl spaced: +84 905 123 456",
        "Intl dashed: +84-905-123-456",
      ];

      for (const text of inputs) {
        const { cleanText, hasPII } = sanitizeAndMaskPII(text);
        expect(cleanText).toContain("[PHONE]");
        expect(hasPII).toBe(true);
      }
    });

    it('masks international numbers with country codes', () => {
      const usNumber = "Contact US office at +1 (555) 123-4567.";
      const ukNumber = "Reach UK department via +44 20 7946 0958.";

      const resUS = sanitizeAndMaskPII(usNumber);
      expect(resUS.cleanText).toContain("[PHONE]");
      expect(resUS.cleanText).not.toContain("+1 (555) 123-4567");
      expect(resUS.hasPII).toBe(true);

      const resUK = sanitizeAndMaskPII(ukNumber);
      expect(resUK.cleanText).toContain("[PHONE]");
      expect(resUK.cleanText).not.toContain("+44 20 7946 0958");
      expect(resUK.hasPII).toBe(true);
    });

    it('preserves academic statistics, years, percentages, and band scores without false positives', () => {
      const academicText =
        "In 2024, approximately 500,000 students achieved Band 6.5 or Band 7.5; around 85% reported improved band scores, up by 12,500 compared to 2019.";
      const { cleanText, hasPII } = sanitizeAndMaskPII(academicText);
      expect(cleanText).toBe(academicText);
      expect(hasPII).toBe(false);
      expect(cleanText).not.toContain("[PHONE]");
      expect(cleanText).not.toContain("[EMAIL]");
    });
  });

  describe('email masking edge cases', () => {
    it('masks complex emails with subdomains and tags', () => {
      const text = "Send your drafts to student.test+ielts2026@academic.oxford.ac.uk or admin@sub.ielts-engine.vn.";
      const { cleanText, hasPII } = sanitizeAndMaskPII(text);
      expect(cleanText).not.toContain("student.test+ielts2026@academic.oxford.ac.uk");
      expect(cleanText).not.toContain("admin@sub.ielts-engine.vn");
      expect(cleanText).toBe("Send your drafts to [EMAIL] or [EMAIL].");
      expect(hasPII).toBe(true);
    });
  });

  describe('XSS and malicious markup sanitization', () => {
    it('sanitizes script, iframe, img onerror, and javascript pseudo-protocols', () => {
      const maliciousCases = [
        { raw: '<iframe src="http://evil.com"></iframe>', forbidden: '<iframe' },
        { raw: '<img src=x onerror="alert(1)">', forbidden: '<img' },
        { raw: '<script type="text/javascript">document.cookie</script>', forbidden: '<script' },
        { raw: '<a href="javascript:alert(\'pwned\')">Click</a>', forbidden: '<a href=' },
      ];

      for (const { raw, forbidden } of maliciousCases) {
        const { cleanText } = sanitizeAndMaskPII(raw);
        expect(cleanText).not.toContain(forbidden);
        expect(cleanText).not.toContain('<');
      }
    });

    it('neutralizes standalone javascript: URIs', () => {
      const input = "Visit javascript:alert(document.domain) for free scores.";
      const { cleanText } = sanitizeAndMaskPII(input);
      expect(cleanText).not.toContain("javascript:");
    });
  });

  describe('hasPII flag behavior', () => {
    it('returns hasPII: false when text contains no personal information', () => {
      const normalEssay = "Governments should allocate more budgetary resources toward public education.";
      const { hasPII, cleanText } = sanitizeAndMaskPII(normalEssay);
      expect(hasPII).toBe(false);
      expect(cleanText).toBe(normalEssay);
    });

    it('returns hasPII: true when only email or only phone is present', () => {
      const withEmail = "My email is candidate@example.org.";
      expect(sanitizeAndMaskPII(withEmail).hasPII).toBe(true);

      const withPhone = "My telephone number is 0912345678.";
      expect(sanitizeAndMaskPII(withPhone).hasPII).toBe(true);
    });
  });
});

describe('generateSlug', () => {
  it('converts titles to clean kebab-case URL slugs', () => {
    const title = "The Impact of Artificial Intelligence on Modern Education";
    expect(generateSlug(title)).toBe("the-impact-of-artificial-intelligence-on-modern-education");
  });

  it('removes Vietnamese diacritics and converts đ/Đ to d', () => {
    const title = "Bài viết mẫu IELTS Writing Task 2: Môi trường & Đô thị hóa";
    expect(generateSlug(title)).toBe("bai-viet-mau-ielts-writing-task-2-moi-truong-do-thi-hoa");
  });

  it('handles punctuation, parenthesized band scores, and special symbols', () => {
    const title = "Should Governments Fund Space Exploration? (Band 7.5+ Sample!)";
    expect(generateSlug(title)).toBe("should-governments-fund-space-exploration-band-7-5-sample");
  });

  it('collapses multiple spaces, dashes and trims boundaries', () => {
    const title = "   --- Band  8.0 --- Cambridge 19 Test 1 ---   ";
    expect(generateSlug(title)).toBe("band-8-0-cambridge-19-test-1");
  });

  it('returns empty string for empty or null-ish inputs', () => {
    expect(generateSlug("")).toBe("");
  });
});

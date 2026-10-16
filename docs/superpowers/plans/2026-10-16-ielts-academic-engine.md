# IELTS Academic Feedback Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a production-grade, high-concurrency academic feedback engine for IELTS Writing that performs sentence-by-sentence word-level diffing, streams real-time evaluations via BullMQ and SSE, manages an automated Spaced Repetition mistake bank (SM-2), generates programmatic SEO sample pages with PII masking, and enforces the 20-point Pre-launch Security standard with VietQR micro-payments.

**Architecture:** A decoupled Next.js 15 client communicating with a Node.js TypeScript API Gateway and BullMQ worker service over Redis. The worker orchestrates LLM structured evaluation, computes Myers Diff per sentence, extracts grammar tags into a Supabase PostgreSQL database with Row-Level Security, and streams tokens/sentence diffs to the client via Server-Sent Events.

**Tech Stack:** Next.js 15 (React 19, Tailwind CSS), TypeScript, Fastify/Node.js, Vitest, Redis + BullMQ, PostgreSQL (Supabase) + pgvector, Zod, PayOS SDK.

**Spec:** `docs/superpowers/specs/2026-10-16-ielts-academic-engine-design.md`

## Global Constraints
- Maximum LLM output tokens capped at 3,500 tokens with a 30-second timeout.
- Never rewrite full essays: evaluations must map 1:1 to original sentences with Band 6.5 and Band 7.5+ alternatives.
- Myers Diff runs strictly at word/token level per individual sentence.
- Zero secrets committed to git; all credentials read from validated `.env` via Zod schema.
- All database queries must be parameterized with Row-Level Security (RLS) enabled on all tables.
- All public SEO pages must sanitize HTML and mask PII (names, emails, phone numbers).
- PayOS webhooks must verify HMAC-SHA256 signatures before activating subscriptions.
- Anonymous visitors get 1 free check/day tracked by IP rate limit and `anonymous_session_id` cookie.

## Review Focus
1. **Sentence Alignment Edge Cases:** Compound abbreviations (`U.S.A.`, `e.g.`, `i.e.`) and contractions breaking sentence segmentation regex.
   - *Test in Task 2:* `test_abbreviation_sentence_splitting()`
2. **LLM Output Truncation / Broken JSON:** LLM hitting token limit or network timeout mid-stream returning malformed JSON.
   - *Test in Task 3:* `test_malformed_json_fallback_and_retry()`
3. **Double Submission / Race Conditions:** User spamming "Submit" resulting in duplicate BullMQ jobs and wasted API calls.
   - *Test in Task 4:* `test_idempotency_key_redis_lock()`
4. **Timezone Desync in Spaced Repetition:** UTC vs GMT+7 causing premature or delayed SM-2 review dates.
   - *Test in Task 5:* `test_sm2_timezone_boundary_calculation()`
5. **PayOS Webhook Replay Attacks:** Replaying valid payment signatures to grant unauthorized Pro time.
   - *Test in Task 9:* `test_payos_webhook_replay_prevention()`

---

### Task 1: Scaffolding, TypeScript Config, and Environment Security
**Files:**
- Create: `package.json`, `tsconfig.json`, `vitest.config.ts`, `.env.example`, `.gitignore`
- Create: `src/config/env.ts`
- Test: `tests/config/env.test.ts`

**Interfaces:**
- Produces: `env: EnvConfig` exporting validated environment variables (`PORT`, `REDIS_URL`, `DATABASE_URL`, `OPENAI_API_KEY`, `PAYOS_CLIENT_ID`, `PAYOS_API_KEY`, `PAYOS_CHECKSUM_KEY`).

- [ ] **Step 1: Write the failing test for environment validation**
```typescript
// tests/config/env.test.ts
import { describe, it, expect } from 'vitest';
import { validateEnv } from '../../src/config/env';

describe('validateEnv', () => {
  it('throws when required environment variables are missing', () => {
    expect(() => validateEnv({})).toThrow(/OPENAI_API_KEY/);
  });
  it('passes and returns parsed config when valid', () => {
    const valid = {
      PORT: '3000',
      REDIS_URL: 'redis://localhost:6379',
      DATABASE_URL: 'postgresql://postgres:postgres@localhost:5432/db',
      OPENAI_API_KEY: 'sk-test',
      PAYOS_CLIENT_ID: 'cid',
      PAYOS_API_KEY: 'key',
      PAYOS_CHECKSUM_KEY: 'check'
    };
    expect(validateEnv(valid).PORT).toBe(3000);
  });
});
```
- [ ] **Step 2: Run test to verify it fails**
Run: `npx vitest run tests/config/env.test.ts`  
Expected: FAIL (file or function not found).
- [ ] **Step 3: Implement `validateEnv` in `src/config/env.ts` using Zod**
Enforce type coercion and strict error messaging. Add `.env` to `.gitignore`.
- [ ] **Step 4: Run test to verify it passes**
Run: `npx vitest run tests/config/env.test.ts`  
Expected: PASS
- [ ] **Step 5: Commit**
```bash
git add package.json tsconfig.json vitest.config.ts .gitignore .env.example src/config/env.ts tests/config/env.test.ts
git commit -m "feat(config): add project scaffolding and secure env validation"
```

---

### Task 2: Core Sentence Splitter & Word-Level Myers Diff Algorithm
**Files:**
- Create: `src/core/diff/sentenceSplitter.ts`
- Create: `src/core/diff/myersDiff.ts`
- Test: `tests/core/sentenceSplitter.test.ts`
- Test: `tests/core/myersDiff.test.ts`

**Interfaces:**
- Produces: `splitSentences(text: string): string[]`
- Produces: `computeWordDiff(original: string, revised: string): DiffChunk[]` where `DiffChunk = { type: 'equal' | 'delete' | 'insert', value: string }`

- [ ] **Step 1: Write failing tests for sentence splitter and Myers Diff**
```typescript
// tests/core/sentenceSplitter.test.ts
import { describe, it, expect } from 'vitest';
import { splitSentences } from '../../src/core/diff/sentenceSplitter';

describe('splitSentences', () => {
  it('handles standard periods, question marks, and exclamation marks', () => {
    const text = "This is sentence one. Is this two? Yes it is!";
    expect(splitSentences(text)).toEqual([
      "This is sentence one.",
      "Is this two?",
      "Yes it is!"
    ]);
  });

  it('does not split on abbreviations such as U.S.A., e.g., and Mr.', () => {
    const text = "In the U.S.A., Mr. Smith argued e.g. economics was vital. Next sentence.";
    expect(splitSentences(text)).toHaveLength(2);
  });
});

// tests/core/myersDiff.test.ts
import { describe, it, expect } from 'vitest';
import { computeWordDiff } from '../../src/core/diff/myersDiff';

describe('computeWordDiff', () => {
  it('identifies word insertions, deletions, and equalities', () => {
    const orig = "I have many problems";
    const rev = "I face numerous challenges";
    const diff = computeWordDiff(orig, rev);
    expect(diff).toEqual([
      { type: 'equal', value: 'I ' },
      { type: 'delete', value: 'have many problems' },
      { type: 'insert', value: 'face numerous challenges' }
    ]);
  });
});
```
- [ ] **Step 2: Run tests to verify they fail**
Run: `npx vitest run tests/core/`  
Expected: FAIL
- [ ] **Step 3: Implement `splitSentences` and `computeWordDiff`**
Implement tokenizer preserving whitespace and punctuation, plus Myers diff algorithm (LCS Dynamic Programming table backtracking).
- [ ] **Step 4: Run tests to verify they pass**
Run: `npx vitest run tests/core/`  
Expected: PASS
- [ ] **Step 5: Commit**
```bash
git add src/core/diff/ tests/core/
git commit -m "feat(core): implement robust sentence splitter and word-level myers diff"
```

---

### Task 3: LLM Structured Output & Zod Evaluation Engine
**Files:**
- Create: `src/core/llm/schemas.ts`
- Create: `src/core/llm/prompts.ts`
- Create: `src/core/llm/evaluator.ts`
- Test: `tests/core/evaluator.test.ts`

**Interfaces:**
- Consumes: `splitSentences` from Task 2
- Produces: `evaluateEssaySentences(prompt: string, essay: string): Promise<SentenceFeedback[]>`
  where `SentenceFeedback = { sentence_id: number, original: string, band_65: string, band_75: string, error_tags: string[], explanation: string }`

- [ ] **Step 1: Write failing test for LLM JSON Schema validation and fallback**
```typescript
// tests/core/evaluator.test.ts
import { describe, it, expect } from 'vitest';
import { SentenceFeedbackSchema, parseLLMResponse } from '../../src/core/llm/evaluator';

describe('parseLLMResponse', () => {
  it('validates strictly structured feedback array', () => {
    const mockJson = JSON.stringify([
      {
        sentence_id: 1,
        original: "I very like English.",
        band_65: "I like English very much.",
        band_75: "I have a profound passion for the English language.",
        error_tags: ["word-order", "collocation"],
        explanation: "Avoid placing 'very' directly before a main verb."
      }
    ]);
    const parsed = parseLLMResponse(mockJson);
    expect(parsed[0].sentence_id).toBe(1);
    expect(parsed[0].error_tags).toContain("word-order");
  });

  it('throws ValidationError on broken or truncated JSON', () => {
    expect(() => parseLLMResponse('{"broken":')).toThrow();
  });
});
```
- [ ] **Step 2: Run test to verify it fails**
Run: `npx vitest run tests/core/evaluator.test.ts`  
Expected: FAIL
- [ ] **Step 3: Implement `parseLLMResponse` and `evaluateEssaySentences`**
Wrap OpenAI/LiteLLM client with structured output enforcement (`response_format: { type: "json_object" }`), max_tokens 3,500, and exponential backoff retry.
- [ ] **Step 4: Run test to verify it passes**
Run: `npx vitest run tests/core/evaluator.test.ts`  
Expected: PASS
- [ ] **Step 5: Commit**
```bash
git add src/core/llm/ tests/core/evaluator.test.ts
git commit -m "feat(llm): add structured json schema evaluation engine with zod validation"
```

---

### Task 4: BullMQ Queue, Worker & Server-Sent Events (SSE) Stream
**Files:**
- Create: `src/queue/essayQueue.ts`
- Create: `src/queue/essayWorker.ts`
- Create: `src/server/sseHandler.ts`
- Test: `tests/queue/essayQueue.test.ts`
- Test: `tests/server/sseHandler.test.ts`

**Interfaces:**
- Consumes: `computeWordDiff` from Task 2, `evaluateEssaySentences` from Task 3
- Produces: `enqueueEssayJob(jobData: EssayJobInput): Promise<{ jobId: string }>`
- Produces: `handleSSEStream(jobId: string, reply: FastifyReply): void`

- [ ] **Step 1: Write failing tests for queue idempotency and SSE stream events**
```typescript
// tests/queue/essayQueue.test.ts
import { describe, it, expect } from 'vitest';
import { generateIdempotencyKey } from '../../src/queue/essayQueue';

describe('generateIdempotencyKey', () => {
  it('creates identical hashes for identical text within window', () => {
    const key1 = generateIdempotencyKey("User essay content", "127.0.0.1");
    const key2 = generateIdempotencyKey("User essay content", "127.0.0.1");
    expect(key1).toBe(key2);
  });
});
```
- [ ] **Step 2: Run test to verify it fails**
Run: `npx vitest run tests/queue/`  
Expected: FAIL
- [ ] **Step 3: Implement BullMQ queue, worker processor, and SSE publisher**
- Worker computes word diff per sentence as LLM evaluations complete.
- Emits SSE events `sentence_diff` and `completed`.
- Enforces Redis lock with TTL 30s to prevent duplicate submissions.
- [ ] **Step 4: Run tests to verify they pass**
Run: `npx vitest run tests/queue/`  
Expected: PASS
- [ ] **Step 5: Commit**
```bash
git add src/queue/ src/server/sseHandler.ts tests/queue/
git commit -m "feat(queue): implement bullmq worker with sentence diff streaming via sse"
```

---

### Task 5: Database Schema (Supabase/PostgreSQL), RLS & SM-2 Algorithm
**Files:**
- Create: `src/db/migrations/001_initial_schema.sql`
- Create: `src/core/srs/sm2.ts`
- Test: `tests/core/sm2.test.ts`

**Interfaces:**
- Produces: `calculateSM2(card: SM2Card, grade: number, timezoneOffsetHours?: number): SM2Result`
  where `SM2Card = { repetitions: number, interval: number, efactor: number }` and `grade in [0..5]`.

- [ ] **Step 1: Write failing tests for SM-2 Spaced Repetition logic**
```typescript
// tests/core/sm2.test.ts
import { describe, it, expect } from 'vitest';
import { calculateSM2 } from '../../src/core/srs/sm2';

describe('calculateSM2', () => {
  it('correctly sets initial intervals on first and second successful reviews', () => {
    const initial = { repetitions: 0, interval: 0, efactor: 2.5 };
    const step1 = calculateSM2(initial, 4);
    expect(step1.repetitions).toBe(1);
    expect(step1.interval).toBe(1);

    const step2 = calculateSM2(step1, 4);
    expect(step2.repetitions).toBe(2);
    expect(step2.interval).toBe(6);
  });

  it('resets repetitions on failed review (grade < 3)', () => {
    const card = { repetitions: 4, interval: 30, efactor: 2.4 };
    const failed = calculateSM2(card, 2);
    expect(failed.repetitions).toBe(0);
    expect(failed.interval).toBe(1);
  });
});
```
- [ ] **Step 2: Run test to verify it fails**
Run: `npx vitest run tests/core/sm2.test.ts`  
Expected: FAIL
- [ ] **Step 3: Implement SM-2 algorithm and create DDL migration with RLS**
- Write `src/core/srs/sm2.ts` implementing SuperMemo-2 mathematical formula: `EF' = EF + (0.1 - (5-grade) * (0.08 + (5-grade) * 0.02))`.
- Write `src/db/migrations/001_initial_schema.sql` with `users`, `essays`, `mistakes`, `payments` and enable `ALTER TABLE ... ENABLE ROW LEVEL SECURITY;`.
- [ ] **Step 4: Run test to verify it passes**
Run: `npx vitest run tests/core/sm2.test.ts`  
Expected: PASS
- [ ] **Step 5: Commit**
```bash
git add src/core/srs/sm2.ts src/db/migrations/ tests/core/sm2.test.ts
git commit -m "feat(srs): add sm-2 spaced repetition algorithm and supabase rls migrations"
```

---

### Task 6: Mistake Bank Ingestion & Cloze Test Generator API
**Files:**
- Create: `src/services/mistakeService.ts`
- Create: `src/api/quizController.ts`
- Test: `tests/services/mistakeService.test.ts`

**Interfaces:**
- Consumes: `SentenceFeedback` from Task 3, `calculateSM2` from Task 5
- Produces: `saveMistakesFromFeedback(userId: string | null, anonId: string, essayId: string, feedback: SentenceFeedback[]): Promise<void>`
- Produces: `generateDailyQuiz(userId: string): Promise<ClozeQuestion[]>`
  where `ClozeQuestion = { id: string, masked_sentence: string, target_phrase: string, hint: string }`

- [ ] **Step 1: Write failing test for cloze question masking**
```typescript
// tests/services/mistakeService.test.ts
import { describe, it, expect } from 'vitest';
import { maskContextSentence } from '../../src/services/mistakeService';

describe('maskContextSentence', () => {
  it('masks the target error phrase into a cloze blank with index', () => {
    const sentence = "It is vital to solve the problem about traffic.";
    const phrase = "solve the problem about";
    const masked = maskContextSentence(sentence, phrase);
    expect(masked).toBe("It is vital to [.....] traffic.");
  });
});
```
- [ ] **Step 2: Run test to verify it fails**
Run: `npx vitest run tests/services/mistakeService.test.ts`  
Expected: FAIL
- [ ] **Step 3: Implement `maskContextSentence` and `mistakeService`**
Filter only entries where `due_date <= NOW()`, construct cloze blanks deterministically without calling LLM at quiz time.
- [ ] **Step 4: Run test to verify it passes**
Run: `npx vitest run tests/services/mistakeService.test.ts`  
Expected: PASS
- [ ] **Step 5: Commit**
```bash
git add src/services/mistakeService.ts src/api/quizController.ts tests/services/mistakeService.test.ts
git commit -m "feat(quiz): implement mistake bank ingestion and deterministic cloze test generator"
```

---

### Task 7: Frontend Side-by-Side Diff & Interactive Error Popovers
**Files:**
- Create: `src/components/diff/SideBySideView.tsx`
- Create: `src/components/diff/DiffSentenceRow.tsx`
- Create: `src/components/diff/ErrorPopover.tsx`
- Create: `src/hooks/useEssayStream.ts`
- Test: `tests/components/SideBySideView.test.tsx`

**Interfaces:**
- Consumes: `DiffChunk` and `SentenceFeedback` via `useEssayStream`
- Produces: React UI components displaying original sentence on left, Band 6.5 / Band 7.5+ toggles on right, synchronized scrolling, and red/green word-level highlighting.

- [ ] **Step 1: Write component test verifying diff highlighting render**
```typescript
// tests/components/SideBySideView.test.tsx
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { DiffSentenceRow } from '../../src/components/diff/DiffSentenceRow';

describe('DiffSentenceRow', () => {
  it('renders deleted words with strikethrough red and added words with green', () => {
    const chunks = [
      { type: 'delete' as const, value: 'have' },
      { type: 'insert' as const, value: 'face' }
    ];
    render(<DiffSentenceRow sentenceId={1} original="have" revised="face" diffChunks={chunks} />);
    expect(screen.getByText('have').className).toContain('text-red');
    expect(screen.getByText('face').className).toContain('text-green');
  });
});
```
- [ ] **Step 2: Run test to verify it fails**
Run: `npx vitest run tests/components/`  
Expected: FAIL
- [ ] **Step 3: Implement `DiffSentenceRow`, `SideBySideView`, and `useEssayStream`**
Support mobile responsiveness (tab switcher for `< 768px`), synchronous anchor scroll, and interactive popover.
- [ ] **Step 4: Run test to verify it passes**
Run: `npx vitest run tests/components/`  
Expected: PASS
- [ ] **Step 5: Commit**
```bash
git add src/components/diff/ src/hooks/ tests/components/
git commit -m "feat(ui): create responsive side-by-side diff viewer with sync scroll and popovers"
```

---

### Task 8: Programmatic SEO Engine (`/samples/[slug]`) & PII Masking
**Files:**
- Create: `src/core/security/piiFilter.ts`
- Create: `src/app/samples/[slug]/page.tsx`
- Create: `src/app/sitemap.ts`
- Test: `tests/core/piiFilter.test.ts`

**Interfaces:**
- Produces: `sanitizeAndMaskPII(text: string): { cleanText: string, hasPII: boolean }`
- Produces: Next.js Dynamic Route with OpenGraph meta tags and `Article` Schema.org JSON-LD.

- [ ] **Step 1: Write failing tests for PII masking**
```typescript
// tests/core/piiFilter.test.ts
import { describe, it, expect } from 'vitest';
import { sanitizeAndMaskPII } from '../../src/core/security/piiFilter';

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
});
```
- [ ] **Step 2: Run test to verify it fails**
Run: `npx vitest run tests/core/piiFilter.test.ts`  
Expected: FAIL
- [ ] **Step 3: Implement `sanitizeAndMaskPII` and Next.js `/samples/[slug]` page**
- Generate dynamic slug from essay title (`kebab-case`).
- Include JSON-LD Schema `EducationalWebPage` and canonical tags.
- [ ] **Step 4: Run test to verify it passes**
Run: `npx vitest run tests/core/piiFilter.test.ts`  
Expected: PASS
- [ ] **Step 5: Commit**
```bash
git add src/core/security/piiFilter.ts src/app/samples/ tests/core/piiFilter.test.ts
git commit -m "feat(seo): implement programmatic sample pages with pii filter and xss escaping"
```

---

### Task 9: PayOS VietQR Micro-Payment & HMAC Webhook Verification
**Files:**
- Create: `src/payment/payosService.ts`
- Create: `src/api/webhookController.ts`
- Test: `tests/payment/payosService.test.ts`

**Interfaces:**
- Produces: `createPaymentLink(userId: string, amount: number, returnUrl: string): Promise<PaymentLinkResult>`
- Produces: `verifyAndHandleWebhook(payload: PayOSWebhookPayload, signature: string): Promise<WebhookResult>`

- [ ] **Step 1: Write failing tests for HMAC signature verification and replay prevention**
```typescript
// tests/payment/payosService.test.ts
import { describe, it, expect } from 'vitest';
import { verifyPayOSWebhook } from '../../src/payment/payosService';

describe('verifyPayOSWebhook', () => {
  it('verifies valid HMAC-SHA256 signature', () => {
    const payload = { orderCode: 123456, amount: 49000, description: "PRO 30D" };
    const secret = "test-checksum-key";
    // signature computed via HMAC SHA256
    const signature = "valid-sig"; 
    expect(verifyPayOSWebhook(payload, signature, secret)).toBe(true);
  });

  it('rejects tampered amount or fake signature', () => {
    const payload = { orderCode: 123456, amount: 1000, description: "PRO 30D" };
    expect(verifyPayOSWebhook(payload, "invalid-sig", "secret")).toBe(false);
  });
});
```
- [ ] **Step 2: Run test to verify it fails**
Run: `npx vitest run tests/payment/payosService.test.ts`  
Expected: FAIL
- [ ] **Step 3: Implement `verifyPayOSWebhook` and `createPaymentLink`**
Extend user `pro_expires_at` by 30 days upon successful payment and record order in `payments` table.
- [ ] **Step 4: Run test to verify it passes**
Run: `npx vitest run tests/payment/payosService.test.ts`  
Expected: PASS
- [ ] **Step 5: Commit**
```bash
git add src/payment/ src/api/webhookController.ts tests/payment/
git commit -m "feat(payment): integrate payos vietqr with hmac signature verification and 30-day pass"
```

---

### Task 10: 20-Point Pre-Launch Security Audit & Automated Test Suite Verification
**Files:**
- Create: `scripts/security-audit.ts`
- Create: `src/middleware/securityHeaders.ts`
- Test: `tests/security/audit.test.ts`

**Interfaces:**
- Produces: Full regression test passing 100%, automated scan validating all 20 security rules from the Pre-launch Security Checklist.

- [ ] **Step 1: Write security checklist verification tests**
Test:
1. Helmet security headers (CSP, X-Frame-Options, HSTS).
2. Rate limiting behavior on `/api/essays/submit`.
3. Absence of leaked secrets in codebase files via regex.
4. RLS policy enforcement verification.
- [ ] **Step 2: Run test to verify failure on any missing header or policy**
Run: `npx vitest run tests/security/`
- [ ] **Step 3: Implement `securityHeaders.ts` and automated audit script**
Apply Helmet middleware, CORS whitelist, and strict cookie attributes (`HttpOnly`, `SameSite=Lax`, `Secure`).
- [ ] **Step 4: Run full project test suite**
Run: `npx vitest run`  
Expected: All 10 test suites PASS.
- [ ] **Step 5: Commit**
```bash
git add scripts/security-audit.ts src/middleware/securityHeaders.ts tests/security/
git commit -m "chore(security): complete 20-point pre-launch security hardening and full test suite"
```

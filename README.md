# IELTS Academic Feedback Engine

> **Production-grade, high-concurrency academic feedback engine for IELTS Writing Task 2.**  
> Features sentence-by-sentence word-level Myers Diff, real-time SSE streaming via Redis BullMQ, automated Spaced Repetition (SM-2) Mistake Bank with deterministic Cloze Tests, Programmatic SEO sample pages with PII masking, and strict Pre-launch Security hardening.

---

## 🚀 Key Highlights & Architectural Features

1. **Interactive Side-by-Side Myers Diff (DSA in Production):**
   - Implements Eugene Myers' $O(ND)$ Shortest Edit Script (SES) algorithm in pure TypeScript with flat typed arrays (`Int32Array`).
   - Word-level diffing per sentence preserving whitespace and punctuation with bidirectional reconstruction invariants:
     $$\sum (\text{equal} + \text{delete}) \equiv \text{original} \quad \text{and} \quad \sum (\text{equal} + \text{insert}) \equiv \text{revised}$$
   - Contrastive dual-band revisions: **Band 6.5 (Safe, natural)** vs. **Band 7.5+ (Sophisticated academic tone & C1/C2 vocabulary)**.
   - **Zero full-essay rewrites:** Preserves 100% of the student's original voice, sentence structure, and intent.

2. **Asynchronous Queue & Real-Time SSE Streaming:**
   - Decoupled ingestion gateway and background worker pool powered by **Redis + BullMQ**.
   - Server-Sent Events (SSE) stream evaluation chunks and Myers diffs per sentence in real-time as they finish, dropping perceived latency to $<2\text{s}$.
   - Idempotent request lock via Redis atomic `SET NX EX 30` to prevent duplicate submissions and API cost spikes.

3. **Automated Mistake Bank & Spaced Repetition (SM-2):**
   - Automatically tags grammar, collocation, and vocabulary errors into a PostgreSQL database.
   - Implements the **SuperMemo-2 (SM-2)** algorithm with calendar timezone boundary normalization (GMT+7 vs UTC) to eliminate review day-shift discrepancies.
   - **Zero-LLM Cost at Review Time:** Deterministically synthesizes Cloze Tests (`[.....]`) using pattern matching at runtime in $<1\text{ms}$ without invoking AI.

4. **Programmatic SEO Engine & Privacy:**
   - Free anonymous evaluations are automatically published to dynamic sample routes (`/samples/[slug]`) linked via XML sitemaps.
   - Built-in **Two-Tier PII Masking Filter** stripping Vietnamese/international phone numbers, emails, and self-identifying student names to protect privacy.
   - Enriches pages with Schema.org JSON-LD structured data (`EducationalWebPage` + `Article`) with XSS script breakout prevention (`replace(/</g, '\\u003c')`).

5. **20-Point Pre-Launch Security Standard:**
   - Row-Level Security (RLS) enabled on all PostgreSQL / Supabase tables (`users`, `payments`, `essays`, `mistakes`).
   - Strict Zod schema validation across all inputs, query parameters, and environment configs.
   - Cryptographic constant-time signature comparison (`crypto.timingSafeEqual`) on webhook gateways to prevent timing attacks.

---

## 🛠️ Tech Stack

- **Frontend:** Next.js 15 (App Router, Turbopack), React 19, Tailwind CSS, Lucide React
- **Backend / Engine:** Node.js (TypeScript), Fastify
- **Queue & Cache:** Redis, BullMQ, ioredis
- **Database & Auth:** PostgreSQL (Supabase) + Row-Level Security (RLS)
- **Validation & AI:** Zod, OpenAI SDK (Structured JSON Output with 3,500 token ceiling)
- **Testing:** Vitest, Testing Library, jsdom (140+ unit/integration tests passing)

---

## 📦 Project Structure

```
.
├── src/
│   ├── app/                    # Next.js App Router (Home, /samples/[slug], sitemap)
│   ├── components/diff/        # Side-by-Side Diff UI, DiffSentenceRow, ErrorPopover
│   ├── core/
│   │   ├── diff/               # Myers Diff algorithm & Sentence boundary splitter
│   │   ├── llm/                # Structured output schemas, prompts & evaluator
│   │   ├── security/           # PII masking, HTML sanitization, slug generator
│   │   └── srs/                # SuperMemo-2 (SM-2) spaced repetition logic
│   ├── db/migrations/          # PostgreSQL initial DDL with full RLS policies
│   ├── payment/                # Payment service, signature verification & webhook logic
│   ├── queue/                  # BullMQ queue, worker, idempotency lock
│   ├── server/                 # Server-Sent Events (SSE) streaming handler
│   └── services/               # Mistake Bank ingestion & Cloze test synthesis
├── tests/                      # 13 Vitest suites covering algorithms, UI, and security
└── docs/                       # Architectural specs and implementation plans
```

---

## ⚡ Quick Start

### 1. Prerequisites
- Node.js >= 20.x
- Redis instance (optional for unit tests, required for live queueing)
- PostgreSQL / Supabase instance

### 2. Installation
```bash
git clone https://github.com/nguyenhoangtuantu/ielts-academic-engine.git
cd ielts-academic-engine
npm install
```

### 3. Environment Configuration
Copy the template and fill in your keys:
```bash
cp .env.example .env
```
Ensure `.env` contains your `DATABASE_URL`, `REDIS_URL`, and `OPENAI_API_KEY`.  
*(Note: `.env` is strictly gitignored to protect sensitive credentials).*

### 4. Running the Development Server
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) in your browser.

### 5. Running Tests & Typechecks
```bash
# Run all unit and integration test suites
npm test

# Run TypeScript static type checking
npm run typecheck

# Production build verification
npm run build
```

---

## 📜 License
MIT License. Built for academic research and portfolio showcase.

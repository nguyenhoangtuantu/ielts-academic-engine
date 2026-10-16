# Design Document: Academic Feedback Engine (IELTS Writing & Mistake Bank MVP)
**Date:** 2026-10-16  
**Status:** In Review (Brainstorming Phase)  
**Author:** Nguyen Hoang Tuan Tu (iamnhtt) & Hermes Agent  

---

## 1. Intent & The Why
Người học IELTS Writing và tài liệu học thuật thường gặp "đứt gãy vòng lặp phản hồi" (broken feedback loop): biết mình sai nhưng không biết sửa sao cho tự nhiên, mang bài lên ChatGPT thì bị viết lại hoa mỹ/mất giọng văn gốc, và thường lặp lại các lỗi cũ do thiếu hệ thống theo dõi.  
Dự án được xây dựng với mục tiêu kép:
- **Thực dụng (60%):** Hút traffic tự nhiên (Programmatic SEO), tạo dòng tiền tự động qua mô hình Freemium + VietQR/PayOS micro-payment (49k/tháng), hỗ trợ người học cải thiện điểm số thực chất.
- **Kỹ thuật sâu (40% - Showcase tuyển dụng):** Tự cài đặt thuật toán so khớp chuỗi Myers Diff / LCS (Quy hoạch động), xử lý hàng đợi bất đồng bộ (Redis BullMQ + SSE streaming), tối ưu chi phí qua Semantic Caching (pgvector), và tự cài đặt thuật toán Spaced Repetition (SM-2/FSRS) cho ngân hàng lỗi sai.

---

## 2. Goals, Non-Goals, and Anti-Goals

### Goals
1. **Interactive Side-by-Side Diff:** So sánh từng câu giữa bản gốc và bản sửa (gợi ý 2 biến thể: Band 6.5 an toàn và Band 7.5+ học thuật).
2. **Automated Mistake Bank & Quiz:** Tự động gắn tag lỗi (ngữ pháp, collocation, từ vựng Việt hóa), lưu vào database kèm `context_sentence` và áp dụng SM-2 để sinh quiz 5 phút lặp lại ngắt quãng.
3. **High-Concurrency Queue & Streaming:** Chịu tải nộp bài đồng thời qua Redis BullMQ, stream kết quả về client dạng SSE mượt mà.
4. **Programmatic SEO Engine & Upsell Hook:** Tự động ẩn danh hóa các bài nộp miễn phí để xuất bản trang mẫu chuẩn SEO (`/samples/[slug]`). Giao diện có checkbox mặc định tích chọn: *"☑️ Đóng góp bài viết (đã ẩn danh hoàn toàn) vào Thư viện học thuật cộng đồng để sử dụng lượt chấm Miễn phí. [🔒 Chế độ Riêng tư - Chỉ dành cho gói Pro 49k]"*.
5. **Zero-Friction Onboarding & Data Merging:** Cho phép khách vãng lai chấm thử 1 bài miễn phí/ngày (bảo vệ bằng Redis IP Rate Limit + Cloudflare Turnstile + `anonymous_session_id` cookie). Tự động gộp dữ liệu (`UPDATE essays/mistakes SET user_id = ...`) ngay khi đăng nhập Google.
6. **Pre-launch Security Standard:** Tuân thủ 100% Bộ 20 Tiêu chuẩn Vàng Bảo mật (Secrets, RLS, Input validation, Rate limit, Security headers...).

### Non-Goals (MVP)
1. Chưa hỗ trợ file PDF Reading hay tài liệu STEM phức tạp ở Giai đoạn 1 (để dành sang Giai đoạn 2 sau khi luồng Writing đã vận hành ổn định).
2. Không xây dựng tính năng mạng xã hội hoặc chat trực tiếp giữa các học viên.
3. Không tự train mô hình LLM riêng từ đầu (sử dụng OpenAI / Claude API qua adapter pattern).

### Anti-Goals (Điều tối kỵ)
1. **Tuyệt đối không rewrite toàn bài:** Không biến bài viết của học sinh thành một bài văn hoàn toàn mới của AI khiến học sinh không thể ghi nhớ hay áp dụng lúc thi thật.
2. **Không để rò rỉ dữ liệu cá nhân (PII):** Tuyệt đối không để lộ tên, email hoặc thông tin cá nhân của người nộp bài lên các trang public SEO.
3. **Không xử lý đồng bộ (Sync API call):** Không chặn HTTP connection khi gọi LLM, tránh tình trạng treo server hoặc timeout gateway.

---

## 3. Architecture & Tech Stack

```
[Client (Next.js 15 App Router)] 
       │ 
       ├─ (POST /api/essays/submit) ──► [API Gateway (Node.js/Fastify)]
       │                                     │
       │                                ┌────┴──────────────────────────┐
       │                                ▼                               ▼
       │                       [Rate Limiter (Redis)]        [Idempotency Check (Redis)]
       │                                │
       │                                ▼
       │                       [Redis BullMQ Queue]
       │                                │
       │                                ▼
       │                       [Worker Service]
       │                                ├─► Check Phrase Semantic Cache (pgvector)
       │                                ├─► Call LLM (max_tokens: 3500, Structured JSON)
       │                                ├─► Run Myers Diff Algorithm (Word-level per sentence)
       │                                └─► Extract Error Tags & Calculate SM-2
       │                                        │
       ├─ (SSE: /api/essays/stream/:jobId) ◄────┘
       │
       ▼
[PostgreSQL Database (Supabase with RLS)]
  ├── users (id, email, tier: free|pro, pro_expires_at, created_at)
  ├── payments (id, user_id, order_code, amount, status, signature, created_at)
  ├── essays (id, user_id: NULLABLE, anonymous_session_id: TEXT, title, original_text, is_public: BOOLEAN, slug, created_at)
  └── mistakes (id, user_id: NULLABLE, essay_id, context_sentence, blank_phrase, corrected_phrase, error_tag, interval, efactor, repetitions, due_date)
```

- **Frontend:** Next.js 15, Tailwind CSS, Lucide React, Custom Side-by-Side Diff Component.
- **Backend:** Node.js TypeScript (Fastify/Express), Redis BullMQ, SSE.
- **Database:** PostgreSQL (Supabase) + `pgvector`.
- **Payment:** PayOS SDK (VietQR động, webhook xác thực chữ ký HMAC-SHA256).

---

## 4. Tích hợp 20 Tiêu chuẩn Vàng Bảo mật (Pre-launch Security Standard)

Hệ thống bắt buộc tuân thủ 20 hạng mục bảo mật tại 4 tầng:
1. **Auth & Secrets:**
   - Ẩn toàn bộ API Key, Redis URI, DB URI vào `.env` (không commit vào Git, dùng `.gitignore`).
   - Quét secret bằng Gitleaks trước mọi commit.
   - Băm mật khẩu bằng Argon2id/bcrypt; JWT ký bằng secret mạnh, lưu trong HttpOnly Cookie (`Secure`, `SameSite=Lax`).
   - Xác thực server-side cho toàn bộ API routes; Client-side chỉ đóng vai trò hiển thị.
2. **Database & Data Integrity:**
   - Supabase connection qua pooling (PgBouncer), không mở direct port 5432 ra public Internet.
   - Bật **Row-Level Security (RLS)** trên các bảng `essays`, `mistakes` (User chỉ xem/sửa data của chính mình).
   - 100% Parameterized queries qua Drizzle ORM hoặc Prisma.
   - Mass Assignment Protection: Validate DTO chặt chẽ, không cho phép client ghi đè trường `tier`, `balance`, `role`.
   - Lọc bỏ thông tin nhạy cảm (PII masking) trước khi lưu các bài viết public SEO.
3. **Input Validation & Attack Defense:**
   - Dùng Zod schema ép kiểu cho toàn bộ request body, query params.
   - Sanitize/escape HTML chống XSS trên các trang public SEO.
   - Rate limiting: 3 bài/ngày cho IP vô danh; tối đa 10 requests/phút cho các API tốn tài nguyên.
   - Chặn bot: Cloudflare Turnstile hoặc rate-limit token bucket trên form submit.
4. **Hạ tầng, AI & Vận hành:**
   - Enforce HTTPS + HSTS.
   - Security headers: Helmet (CSP, X-Frame-Options, X-Content-Type-Options).
   - CI/CD quét dependency (`npm audit`).
   - Kiểm soát LLM: Bắt buộc Structured JSON Schema, giới hạn `max_tokens: 1500`, timeout 30s.

---

## 5. Timeline & Task Breakdown

- **Phase 1 (Ngày 1-4):** Core Myers Diff Algorithm & Zod LLM Parser.
- **Phase 2 (Ngày 5-9):** Redis BullMQ, Worker, SSE Stream, Rate Limiter.
- **Phase 3 (Ngày 10-14):** Supabase DB Schema + RLS, Thuật toán SM-2, Mistake Bank API.
- **Phase 4 (Ngày 15-19):** Frontend Next.js Side-by-Side Diff, Mobile Responsive, Quiz Component.
- **Phase 5 (Ngày 20-24):** Programmatic SEO Engine (`/samples/[slug]`), PayOS VietQR Webhook, Security Audit 20 điểm & Deploy.

---

## 6. Tiêu chuẩn Review Code từng Task (Automated Gate)
Mỗi task sau khi hoàn thành phải xuất bản báo cáo:
1. Verification: Kết quả chạy Unit/Integration Test thực tế (PASS/FAIL, số lượng test cases).
2. Security Check: Rà soát các mục liên quan trong 20 Tiêu chuẩn Vàng.
3. Code Cleanliness: TypeScript strict, không biến `any`, không memory leak.
4. Interview Highlight: Ghi chú thuật toán/kiến trúc để trả lời phỏng vấn.

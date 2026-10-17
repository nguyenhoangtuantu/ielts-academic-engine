import { describe, it, expect, beforeEach } from 'vitest';
import Fastify, { FastifyInstance } from 'fastify';
import crypto from 'crypto';
import {
  computePayOSSignature,
  verifyPayOSWebhook,
  createPaymentLink,
  handlePaymentSuccess,
  verifyAndHandleWebhook,
  createInMemoryPaymentRepository,
  PaymentRepository,
} from '../../src/payment/payosService';
import { webhookRoutes } from '../../src/api/webhookController';

describe('PayOS Cryptographic Signature Verification', () => {
  const secret = 'test-checksum-key-12345';

  it('verifies valid HMAC-SHA256 signature', () => {
    const payload = { orderCode: 123456, amount: 49000, description: 'PRO 30D' };
    // Sorted keys: amount=49000&description=PRO 30D&orderCode=123456
    const expectedSig = crypto
      .createHmac('sha256', secret)
      .update('amount=49000&description=PRO 30D&orderCode=123456')
      .digest('hex');

    expect(computePayOSSignature(payload, secret)).toBe(expectedSig);
    expect(verifyPayOSWebhook(payload, expectedSig, secret)).toBe(true);
  });

  it('sorts keys alphabetically regardless of insertion order', () => {
    const payload1 = { zKey: 'last', aKey: 'first', mKey: 'middle' };
    const payload2 = { aKey: 'first', mKey: 'middle', zKey: 'last' };

    const sig1 = computePayOSSignature(payload1, secret);
    const sig2 = computePayOSSignature(payload2, secret);

    expect(sig1).toBe(sig2);
    expect(sig1).toBe(
      crypto
        .createHmac('sha256', secret)
        .update('aKey=first&mKey=middle&zKey=last')
        .digest('hex')
    );
  });

  it('excludes signature field from signature calculation if present in data', () => {
    const payload = {
      orderCode: 999,
      amount: 50000,
      description: 'TEST',
      signature: 'some-previous-sig',
    };
    const cleanPayload = { orderCode: 999, amount: 50000, description: 'TEST' };

    expect(computePayOSSignature(payload, secret)).toBe(
      computePayOSSignature(cleanPayload, secret)
    );
  });

  it('rejects tampered amount or fake signature', () => {
    const payload = { orderCode: 123456, amount: 1000, description: 'PRO 30D' };
    expect(verifyPayOSWebhook(payload, 'invalid-sig', secret)).toBe(false);

    // Tampered amount against valid signature of original amount
    const originalPayload = { orderCode: 123456, amount: 49000, description: 'PRO 30D' };
    const validSig = computePayOSSignature(originalPayload, secret);
    expect(verifyPayOSWebhook(payload, validSig, secret)).toBe(false);
  });

  it('handles nested PayOS webhook payload structure', () => {
    const innerData = { orderCode: 123456, amount: 49000, description: 'PRO 30D' };
    const validSig = computePayOSSignature(innerData, secret);
    const webhookEnvelope = {
      code: '00',
      desc: 'success',
      data: innerData,
      signature: validSig,
    };

    expect(verifyPayOSWebhook(webhookEnvelope, validSig, secret)).toBe(true);
  });

  it('returns false for empty or mismatched signature lengths without crashing timingSafeEqual', () => {
    const payload = { orderCode: 123456, amount: 49000 };
    expect(verifyPayOSWebhook(payload, '', secret)).toBe(false);
    expect(verifyPayOSWebhook(payload, 'short', secret)).toBe(false);
    expect(verifyPayOSWebhook(payload, 'non-hex-sig-that-is-short', secret)).toBe(false);
  });
});

describe('PayOS createPaymentLink', () => {
  let db: PaymentRepository;

  beforeEach(() => {
    db = createInMemoryPaymentRepository();
  });

  it('creates payment link with object parameters and records pending payment in db', async () => {
    const mockClient = {
      createPaymentLink: async (data: any) => ({
        bin: '970407',
        accountNumber: '123456789',
        accountName: 'IELTS ACADEMIC ENGINE',
        amount: data.amount,
        description: data.description,
        orderCode: data.orderCode,
        qrCode: 'vietqr://image-data-mock',
        checkoutUrl: `https://pay.payos.vn/web/${data.orderCode}`,
      }),
    };

    const result = await createPaymentLink(
      {
        userId: 'user-std-1',
        amount: 49000,
        description: 'PRO 30D ACCESS',
        returnUrl: 'https://ielts-academic.vn/payment/success',
        cancelUrl: 'https://ielts-academic.vn/payment/cancel',
        orderCode: 777888,
      },
      { client: mockClient, db }
    );

    expect(result.orderCode).toBe(777888);
    expect(result.amount).toBe(49000);
    expect(result.checkoutUrl).toBe('https://pay.payos.vn/web/777888');

    // Verify database record
    const payment = await db.getPaymentByOrderCode(777888);
    expect(payment).not.toBeNull();
    expect(payment?.user_id).toBe('user-std-1');
    expect(payment?.amount).toBe(49000);
    expect(payment?.status).toBe('pending');
  });

  it('supports positional arguments createPaymentLink(userId, amount, returnUrl)', async () => {
    const mockClient = {
      createPaymentLink: async (data: any) => ({
        bin: '970407',
        accountNumber: '123456789',
        accountName: 'IELTS ACADEMIC ENGINE',
        amount: data.amount,
        description: data.description,
        orderCode: data.orderCode,
        qrCode: 'vietqr://mock',
        checkoutUrl: `https://pay.payos.vn/web/${data.orderCode}`,
      }),
    };

    const result = await createPaymentLink(
      'user-pos-2',
      49000,
      'https://ielts-academic.vn/payment/success',
      { client: mockClient, db }
    );

    expect(result.amount).toBe(49000);
    expect(typeof result.orderCode).toBe('number');
    const payment = await db.getPaymentByOrderCode(result.orderCode);
    expect(payment?.user_id).toBe('user-pos-2');
  });
});

describe('PayOS handlePaymentSuccess and 30-day Pro extension', () => {
  let db: PaymentRepository;
  const now = new Date('2026-10-17T10:00:00.000Z');
  const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

  beforeEach(async () => {
    db = createInMemoryPaymentRepository();
    // Seed users
    await db.createUser({
      id: 'fresh-user-1',
      email: 'fresh@example.com',
      tier: 'free',
      pro_expires_at: null,
    });

    await db.createUser({
      id: 'active-pro-user-2',
      email: 'active@example.com',
      tier: 'pro',
      pro_expires_at: new Date(now.getTime() + 10 * 24 * 60 * 60 * 1000), // 10 days left
    });

    await db.createUser({
      id: 'expired-pro-user-3',
      email: 'expired@example.com',
      tier: 'free',
      pro_expires_at: new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000), // expired 5 days ago
    });

    // Seed pending payment
    await db.createPayment({
      user_id: 'fresh-user-1',
      order_code: 10001,
      amount: 49000,
      status: 'pending',
    });

    await db.createPayment({
      user_id: 'active-pro-user-2',
      order_code: 10002,
      amount: 49000,
      status: 'pending',
    });
  });

  it('extends fresh user pro_expires_at by 30 days from now', async () => {
    const result = await handlePaymentSuccess(
      { orderCode: 10001, amount: 49000 },
      { db, now }
    );

    expect(result.success).toBe(true);
    expect(result.isReplay).toBe(false);

    const expectedExpiry = new Date(now.getTime() + THIRTY_DAYS_MS);
    expect(result.proExpiresAt.toISOString()).toBe(expectedExpiry.toISOString());

    const user = await db.getUserById('fresh-user-1');
    expect(user?.tier).toBe('pro');
    expect(user?.pro_expires_at?.toISOString()).toBe(expectedExpiry.toISOString());

    const payment = await db.getPaymentByOrderCode(10001);
    expect(payment?.status).toBe('paid');
  });

  it('extends active pro user pro_expires_at by 30 days from existing expiration date', async () => {
    const currentProExpiresAt = new Date(now.getTime() + 10 * 24 * 60 * 60 * 1000);
    const expectedExpiry = new Date(currentProExpiresAt.getTime() + THIRTY_DAYS_MS);

    const result = await handlePaymentSuccess(
      { orderCode: 10002, amount: 49000 },
      { db, now }
    );

    expect(result.success).toBe(true);
    expect(result.isReplay).toBe(false);
    expect(result.proExpiresAt.toISOString()).toBe(expectedExpiry.toISOString());

    const user = await db.getUserById('active-pro-user-2');
    expect(user?.tier).toBe('pro');
    expect(user?.pro_expires_at?.toISOString()).toBe(expectedExpiry.toISOString());
  });

  it('extends expired pro user from now instead of past expiration date', async () => {
    await db.createPayment({
      user_id: 'expired-pro-user-3',
      order_code: 10003,
      amount: 49000,
      status: 'pending',
    });

    const result = await handlePaymentSuccess(
      { orderCode: 10003, amount: 49000 },
      { db, now }
    );

    expect(result.success).toBe(true);
    expect(result.isReplay).toBe(false);
    const expectedExpiry = new Date(now.getTime() + THIRTY_DAYS_MS);
    expect(result.proExpiresAt.toISOString()).toBe(expectedExpiry.toISOString());

    const user = await db.getUserById('expired-pro-user-3');
    expect(user?.tier).toBe('pro');
    expect(user?.pro_expires_at?.toISOString()).toBe(expectedExpiry.toISOString());
  });

  it('enforces Replay Attack Prevention (Review Focus Item 5): does not grant double time', async () => {
    // First payment processing
    const firstAttempt = await handlePaymentSuccess(
      { orderCode: 10001, amount: 49000 },
      { db, now }
    );
    expect(firstAttempt.isReplay).toBe(false);
    const expectedFirstExpiry = new Date(now.getTime() + THIRTY_DAYS_MS);
    expect(firstAttempt.proExpiresAt.toISOString()).toBe(expectedFirstExpiry.toISOString());

    // Second payment attempt with same orderCode (replay attack)
    const secondAttempt = await handlePaymentSuccess(
      { orderCode: 10001, amount: 49000 },
      { db, now }
    );

    expect(secondAttempt.success).toBe(true);
    expect(secondAttempt.isReplay).toBe(true);
    // proExpiresAt is NOT extended further
    expect(secondAttempt.proExpiresAt.toISOString()).toBe(expectedFirstExpiry.toISOString());

    // User in DB still has the single 30-day extension, not 60 days
    const user = await db.getUserById('fresh-user-1');
    expect(user?.pro_expires_at?.toISOString()).toBe(expectedFirstExpiry.toISOString());
  });
});

describe('verifyAndHandleWebhook unified helper', () => {
  let db: PaymentRepository;
  const secret = 'webhook-secret-key';
  const now = new Date('2026-10-17T12:00:00.000Z');

  beforeEach(async () => {
    db = createInMemoryPaymentRepository();
    await db.createUser({
      id: 'helper-user',
      email: 'helper@example.com',
      tier: 'free',
      pro_expires_at: null,
    });
    await db.createPayment({
      user_id: 'helper-user',
      order_code: 55555,
      amount: 49000,
      status: 'pending',
    });
  });

  it('verifies signature and processes payment successfully', async () => {
    const payload = { orderCode: 55555, amount: 49000, description: 'PRO 30D' };
    const signature = computePayOSSignature(payload, secret);

    const result = await verifyAndHandleWebhook(payload, signature, {
      checksumKey: secret,
      db,
      now,
    });

    expect(result.success).toBe(true);
    expect(result.isReplay).toBe(false);
    expect(result.proExpiresAt).toBeDefined();
  });

  it('rejects tampered webhook payload with error', async () => {
    const payload = { orderCode: 55555, amount: 1000, description: 'PRO 30D' };
    await expect(
      verifyAndHandleWebhook(payload, 'bad-sig', { checksumKey: secret, db, now })
    ).rejects.toThrow(/invalid.*signature/i);
  });
});

describe('Webhook Controller Fastify Route POST /api/webhooks/payos', () => {
  let app: FastifyInstance;
  let db: PaymentRepository;
  const secret = 'ctrl-checksum-key-777';
  const now = new Date('2026-10-17T12:00:00.000Z');

  beforeEach(async () => {
    db = createInMemoryPaymentRepository();
    await db.createUser({
      id: 'ctrl-user-1',
      email: 'ctrl@example.com',
      tier: 'free',
      pro_expires_at: null,
    });
    await db.createPayment({
      user_id: 'ctrl-user-1',
      order_code: 88888,
      amount: 49000,
      status: 'pending',
    });

    app = Fastify();
    await app.register(webhookRoutes, {
      db,
      checksumKey: secret,
      now,
    });
    await app.ready();
  });

  it('returns 400 Bad Request when signature is missing', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/webhooks/payos',
      payload: { orderCode: 88888, amount: 49000 },
    });

    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(false);
    expect(body.error).toMatch(/signature/i);
  });

  it('returns 400 Bad Request when signature is invalid', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/webhooks/payos',
      headers: {
        'x-payos-signature': 'invalid-hex-signature',
      },
      payload: { orderCode: 88888, amount: 49000 },
    });

    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(false);
    expect(body.error).toMatch(/invalid.*signature/i);
  });

  it('returns 200 OK and processes valid webhook via x-payos-signature header', async () => {
    const payload = { orderCode: 88888, amount: 49000, description: 'PRO 30D' };
    const signature = computePayOSSignature(payload, secret);

    const res = await app.inject({
      method: 'POST',
      url: '/api/webhooks/payos',
      headers: {
        'x-payos-signature': signature,
      },
      payload,
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(body.isReplay).toBe(false);
    expect(body.message).toContain('Payment processed');
    expect(body.proExpiresAt).toBeDefined();

    const user = await db.getUserById('ctrl-user-1');
    expect(user?.tier).toBe('pro');
  });

  it('returns 200 OK and handles PayOS standard payload envelope with signature inside body', async () => {
    const data = { orderCode: 88888, amount: 49000, description: 'PRO 30D' };
    const signature = computePayOSSignature(data, secret);

    const res = await app.inject({
      method: 'POST',
      url: '/api/webhooks/payos',
      payload: {
        code: '00',
        desc: 'success',
        data,
        signature,
      },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(body.proExpiresAt).toBeDefined();
  });

  it('handles replay attack gracefully on webhook controller: returns 200 with isReplay=true', async () => {
    const payload = { orderCode: 88888, amount: 49000, description: 'PRO 30D' };
    const signature = computePayOSSignature(payload, secret);

    // First call
    const res1 = await app.inject({
      method: 'POST',
      url: '/api/webhooks/payos',
      headers: { 'x-payos-signature': signature },
      payload,
    });
    expect(res1.statusCode).toBe(200);
    expect(JSON.parse(res1.body).isReplay).toBe(false);

    // Second call (replay)
    const res2 = await app.inject({
      method: 'POST',
      url: '/api/webhooks/payos',
      headers: { 'x-payos-signature': signature },
      payload,
    });
    expect(res2.statusCode).toBe(200);
    const body2 = JSON.parse(res2.body);
    expect(body2.success).toBe(true);
    expect(body2.isReplay).toBe(true);
    expect(body2.message).toMatch(/already processed/i);
  });
});

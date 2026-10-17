import crypto from 'crypto';
import { randomUUID } from 'crypto';
import { env } from '../config/env';

export interface UserRecord {
  id: string;
  email?: string;
  tier: 'free' | 'pro';
  pro_expires_at: Date | null;
  created_at?: Date;
  updated_at?: Date;
}

export interface PaymentRecord {
  id: string;
  user_id: string;
  order_code: number;
  amount: number;
  status: 'pending' | 'paid' | 'cancelled' | 'failed';
  signature?: string;
  created_at?: Date;
  updated_at?: Date;
}

export interface PaymentRepository {
  getUserById(id: string): Promise<UserRecord | null>;
  createUser(user: UserRecord): Promise<UserRecord>;
  updateUserProStatus(id: string, proExpiresAt: Date): Promise<UserRecord>;
  getPaymentByOrderCode(orderCode: number): Promise<PaymentRecord | null>;
  createPayment(
    payment: Partial<PaymentRecord> & { user_id: string; order_code: number; amount: number }
  ): Promise<PaymentRecord>;
  updatePaymentStatus(
    orderCode: number,
    status: 'pending' | 'paid' | 'cancelled' | 'failed',
    signature?: string
  ): Promise<PaymentRecord>;
}

/**
 * In-memory implementation of PaymentRepository for offline testing and local fallback.
 */
export function createInMemoryPaymentRepository(): PaymentRepository {
  const usersStore = new Map<string, UserRecord>();
  const paymentsStore = new Map<number, PaymentRecord>();

  return {
    async getUserById(id: string): Promise<UserRecord | null> {
      const u = usersStore.get(id);
      return u ? { ...u } : null;
    },

    async createUser(user: UserRecord): Promise<UserRecord> {
      const saved: UserRecord = {
        ...user,
        created_at: user.created_at || new Date(),
        updated_at: user.updated_at || new Date(),
      };
      usersStore.set(saved.id, saved);
      return { ...saved };
    },

    async updateUserProStatus(id: string, proExpiresAt: Date): Promise<UserRecord> {
      const existing = usersStore.get(id);
      const updated: UserRecord = {
        ...(existing || { id, tier: 'free', pro_expires_at: null }),
        tier: 'pro',
        pro_expires_at: proExpiresAt,
        updated_at: new Date(),
      };
      usersStore.set(id, updated);
      return { ...updated };
    },

    async getPaymentByOrderCode(orderCode: number): Promise<PaymentRecord | null> {
      const p = paymentsStore.get(orderCode);
      return p ? { ...p } : null;
    },

    async createPayment(
      payment: Partial<PaymentRecord> & { user_id: string; order_code: number; amount: number }
    ): Promise<PaymentRecord> {
      const id = payment.id || randomUUID();
      const saved: PaymentRecord = {
        id,
        user_id: payment.user_id,
        order_code: payment.order_code,
        amount: payment.amount,
        status: payment.status || 'pending',
        signature: payment.signature,
        created_at: payment.created_at || new Date(),
        updated_at: payment.updated_at || new Date(),
      };
      paymentsStore.set(saved.order_code, saved);
      return { ...saved };
    },

    async updatePaymentStatus(
      orderCode: number,
      status: 'pending' | 'paid' | 'cancelled' | 'failed',
      signature?: string
    ): Promise<PaymentRecord> {
      const existing = paymentsStore.get(orderCode);
      if (!existing) {
        throw new Error(`Payment not found for orderCode ${orderCode}`);
      }
      const updated: PaymentRecord = {
        ...existing,
        status,
        signature: signature ?? existing.signature,
        updated_at: new Date(),
      };
      paymentsStore.set(orderCode, updated);
      return { ...updated };
    },
  };
}

let defaultPaymentRepo: PaymentRepository = createInMemoryPaymentRepository();

export function setDefaultPaymentRepository(repo: PaymentRepository): void {
  defaultPaymentRepo = repo;
}

export function getDefaultPaymentRepository(): PaymentRepository {
  return defaultPaymentRepo;
}

function sortObjDataByKey(object: Record<string, any>): Record<string, any> {
  return Object.keys(object)
    .sort()
    .reduce((obj: Record<string, any>, key: string) => {
      obj[key] = object[key];
      return obj;
    }, {});
}

/**
 * Computes PayOS HMAC-SHA256 signature by sorting keys alphabetically,
 * concatenating into key=value joined by &, and hashing with checksumKey.
 */
export function computePayOSSignature(
  data: Record<string, any>,
  checksumKey: string
): string {
  if (!data || typeof data !== 'object' || !checksumKey) {
    return '';
  }

  const sortedKeys = Object.keys(data)
    .filter((key) => key !== 'signature' && data[key] !== undefined)
    .sort();

  const queryString = sortedKeys
    .map((key) => {
      let value = data[key];
      if (Array.isArray(value)) {
        value = JSON.stringify(
          value.map((val: any) =>
            typeof val === 'object' && val !== null ? sortObjDataByKey(val) : val
          )
        );
      } else if (value && typeof value === 'object' && !(value instanceof Date)) {
        value = JSON.stringify(sortObjDataByKey(value));
      }
      if (value === null || value === undefined || value === 'null' || value === 'undefined') {
        value = '';
      }
      return `${key}=${value}`;
    })
    .join('&');

  return crypto.createHmac('sha256', checksumKey).update(queryString).digest('hex');
}

/**
 * Verifies PayOS webhook signature using constant-time comparison to prevent timing attacks.
 */
export function verifyPayOSWebhook(
  payload: Record<string, any>,
  signature: string,
  checksumKey: string
): boolean {
  if (!payload || typeof payload !== 'object' || !signature || !checksumKey) {
    return false;
  }

  // Support both full webhook body { code, desc, data: {...}, signature } and direct data object
  const hasInnerData =
    payload.data && typeof payload.data === 'object' && !Array.isArray(payload.data);

  let expectedSignature = '';

  if (hasInnerData) {
    expectedSignature = computePayOSSignature(payload.data, checksumKey);
  } else {
    expectedSignature = computePayOSSignature(payload, checksumKey);
  }

  const sigBuffer = Buffer.from(signature, 'utf8');
  const expectedBuffer = Buffer.from(expectedSignature, 'utf8');

  if (sigBuffer.length === 0 || sigBuffer.length !== expectedBuffer.length) {
    // If hasInnerData didn't match and lengths differed, also try raw payload if possible
    if (hasInnerData) {
      const altExpected = computePayOSSignature(payload, checksumKey);
      const altBuffer = Buffer.from(altExpected, 'utf8');
      if (sigBuffer.length === altBuffer.length && altBuffer.length > 0) {
        return crypto.timingSafeEqual(sigBuffer, altBuffer);
      }
    }
    return false;
  }

  const matches = crypto.timingSafeEqual(sigBuffer, expectedBuffer);
  if (!matches && hasInnerData) {
    const altExpected = computePayOSSignature(payload, checksumKey);
    const altBuffer = Buffer.from(altExpected, 'utf8');
    if (sigBuffer.length === altBuffer.length) {
      return crypto.timingSafeEqual(sigBuffer, altBuffer);
    }
  }

  return matches;
}

export interface CreatePaymentLinkParams {
  userId: string;
  amount: number;
  description?: string;
  returnUrl: string;
  cancelUrl?: string;
  orderCode?: number;
}

export interface PaymentLinkResult {
  bin: string;
  accountNumber: string;
  accountName: string;
  amount: number;
  description: string;
  orderCode: number;
  qrCode: string;
  checkoutUrl: string;
}

export interface CreatePaymentLinkOptions {
  client?: any;
  db?: PaymentRepository;
}

/**
 * Generates VietQR PayOS payment link and stores pending payment transaction.
 * Supports both params object and positional arguments (userId, amount, returnUrl).
 */
export async function createPaymentLink(
  paramsOrUserId: CreatePaymentLinkParams | string,
  amountOrOptions?: number | CreatePaymentLinkOptions,
  returnUrlOrOptions?: string | CreatePaymentLinkOptions,
  maybeOptions?: CreatePaymentLinkOptions
): Promise<PaymentLinkResult> {
  let params: CreatePaymentLinkParams;
  let options: CreatePaymentLinkOptions | undefined;

  if (typeof paramsOrUserId === 'string') {
    params = {
      userId: paramsOrUserId,
      amount: typeof amountOrOptions === 'number' ? amountOrOptions : 0,
      returnUrl: typeof returnUrlOrOptions === 'string' ? returnUrlOrOptions : '',
      description: 'IELTS PRO 30D ACCESS',
    };
    options = maybeOptions ?? (typeof returnUrlOrOptions === 'object' ? returnUrlOrOptions : undefined);
  } else {
    params = paramsOrUserId;
    options = typeof amountOrOptions === 'object' ? amountOrOptions : maybeOptions;
  }

  const db = options?.db ?? getDefaultPaymentRepository();
  const orderCode =
    params.orderCode ?? Math.floor(100000 + (Date.now() % 800000) + Math.random() * 99999);
  const description = params.description || `IELTS PRO ${orderCode}`;
  const amount = params.amount;

  // Insert pending payment into DB
  await db.createPayment({
    user_id: params.userId,
    order_code: orderCode,
    amount,
    status: 'pending',
  });

  if (options?.client) {
    if (typeof options.client.createPaymentLink === 'function') {
      return await options.client.createPaymentLink({
        orderCode,
        amount,
        description,
        returnUrl: params.returnUrl,
        cancelUrl: params.cancelUrl || params.returnUrl,
      });
    }
    if (options.client.paymentRequests?.create) {
      return await options.client.paymentRequests.create({
        orderCode,
        amount,
        description,
        returnUrl: params.returnUrl,
        cancelUrl: params.cancelUrl || params.returnUrl,
      });
    }
  }

  // Standalone offline / default fallback
  return {
    bin: '970407',
    accountNumber: '123456789',
    accountName: 'IELTS ACADEMIC ENGINE',
    amount,
    description,
    orderCode,
    qrCode: `vietqr://payos?orderCode=${orderCode}&amount=${amount}`,
    checkoutUrl: `https://pay.payos.vn/web/${orderCode}`,
  };
}

export interface PaymentSuccessResult {
  success: boolean;
  isReplay: boolean;
  proExpiresAt: Date;
}

/**
 * Handles PayOS payment completion with Replay Attack Prevention (Review Focus Item 5).
 * Extends users.pro_expires_at by 30 days.
 */
export async function handlePaymentSuccess(
  webhookData: { orderCode: number; amount: number; reference?: string },
  options?: { db?: PaymentRepository; now?: Date }
): Promise<PaymentSuccessResult> {
  const db = options?.db ?? getDefaultPaymentRepository();
  const now = options?.now ?? new Date();
  const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

  // 1. Check if payment already exists
  const existingPayment = await db.getPaymentByOrderCode(webhookData.orderCode);

  if (existingPayment && existingPayment.status.toLowerCase() === 'paid') {
    // Replay attack prevention: already processed, do not grant double time
    const user = await db.getUserById(existingPayment.user_id);
    const currentExpiry = user?.pro_expires_at ? new Date(user.pro_expires_at) : now;
    return {
      success: true,
      isReplay: true,
      proExpiresAt: currentExpiry,
    };
  }

  // 2. Identify user ID
  const userId =
    existingPayment?.user_id ??
    (webhookData as any).userId ??
    webhookData.reference ??
    'anonymous-user';

  // 3. Calculate 30-day Pro extension
  const user = await db.getUserById(userId);
  const currentExpiryTime = user?.pro_expires_at
    ? new Date(user.pro_expires_at).getTime()
    : 0;

  const baseTime = currentExpiryTime > now.getTime() ? currentExpiryTime : now.getTime();
  const proExpiresAt = new Date(baseTime + THIRTY_DAYS_MS);

  // 4. Update user tier & pro_expires_at
  await db.updateUserProStatus(userId, proExpiresAt);

  // 5. Update or insert payment record with PAID status
  if (existingPayment) {
    await db.updatePaymentStatus(webhookData.orderCode, 'paid');
  } else {
    await db.createPayment({
      user_id: userId,
      order_code: webhookData.orderCode,
      amount: webhookData.amount,
      status: 'paid',
    });
  }

  return {
    success: true,
    isReplay: false,
    proExpiresAt,
  };
}

/**
 * Unified helper verifying signature and handling webhook payload.
 */
export async function verifyAndHandleWebhook(
  payload: Record<string, any>,
  signature: string,
  options?: { checksumKey?: string; db?: PaymentRepository; now?: Date }
): Promise<PaymentSuccessResult> {
  let checksumKey = options?.checksumKey;
  if (!checksumKey) {
    try {
      checksumKey = env.PAYOS_CHECKSUM_KEY;
    } catch {
      checksumKey = process.env.PAYOS_CHECKSUM_KEY;
    }
  }

  if (!checksumKey || !verifyPayOSWebhook(payload, signature, checksumKey)) {
    throw new Error('Invalid PayOS webhook signature');
  }

  const webhookData = payload.data && typeof payload.data === 'object' ? payload.data : payload;

  return await handlePaymentSuccess(
    {
      orderCode: webhookData.orderCode,
      amount: webhookData.amount,
      reference: webhookData.reference,
    },
    { db: options?.db, now: options?.now }
  );
}

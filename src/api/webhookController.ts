import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { env } from '../config/env';
import {
  verifyPayOSWebhook,
  handlePaymentSuccess,
  PaymentRepository,
  getDefaultPaymentRepository,
} from '../payment/payosService';

export interface WebhookRouteOptions {
  db?: PaymentRepository;
  checksumKey?: string;
  now?: Date;
}

/**
 * Fastify plugin registering PayOS Webhook endpoint: POST /api/webhooks/payos.
 * Verifies HMAC-SHA256 signature using timingSafeEqual and prevents replay attacks.
 */
export async function webhookRoutes(
  fastify: FastifyInstance,
  options: WebhookRouteOptions = {}
): Promise<void> {
  const getRepo = () => options.db ?? getDefaultPaymentRepository();

  fastify.post('/api/webhooks/payos', async (request: FastifyRequest, reply: FastifyReply) => {
    const body = request.body as Record<string, any> | undefined;

    if (!body || typeof body !== 'object') {
      return reply.status(400).send({
        success: false,
        error: 'Invalid or missing request body',
      });
    }

    // Extract signature from headers or body payload
    const signature =
      (request.headers['x-payos-signature'] as string | undefined) ||
      (request.headers['signature'] as string | undefined) ||
      (body.signature as string | undefined);

    if (!signature) {
      return reply.status(400).send({
        success: false,
        error: 'Missing webhook signature in header or body',
      });
    }

    // Resolve checksum key
    let checksumKey = options.checksumKey;
    if (!checksumKey) {
      try {
        checksumKey = env.PAYOS_CHECKSUM_KEY;
      } catch {
        checksumKey = process.env.PAYOS_CHECKSUM_KEY;
      }
    }

    if (!checksumKey) {
      return reply.status(500).send({
        success: false,
        error: 'PAYOS_CHECKSUM_KEY configuration missing',
      });
    }

    // Verify HMAC-SHA256 signature
    const isValid = verifyPayOSWebhook(body, signature, checksumKey);
    if (!isValid) {
      return reply.status(400).send({
        success: false,
        error: 'Invalid webhook signature',
      });
    }

    // Extract payment data from envelope or direct payload
    const webhookData = body.data && typeof body.data === 'object' ? body.data : body;

    const orderCode = Number(webhookData.orderCode);
    const amount = Number(webhookData.amount);

    if (isNaN(orderCode) || isNaN(amount)) {
      return reply.status(400).send({
        success: false,
        error: 'Payload missing orderCode or amount',
      });
    }

    try {
      const result = await handlePaymentSuccess(
        {
          orderCode,
          amount,
          reference: webhookData.reference,
        },
        { db: getRepo(), now: options.now }
      );

      if (result.isReplay) {
        return reply.status(200).send({
          success: true,
          isReplay: true,
          message: 'Payment already processed (replay ignored)',
          proExpiresAt: result.proExpiresAt,
        });
      }

      return reply.status(200).send({
        success: true,
        isReplay: false,
        message: 'Payment processed',
        proExpiresAt: result.proExpiresAt,
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Internal error processing payment';
      return reply.status(500).send({
        success: false,
        error: message,
      });
    }
  });
}

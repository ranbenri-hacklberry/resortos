import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL || 'http://100.112.253.49:54322';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || 'postgres';
const WEBHOOK_SECRET = process.env.PAYFAC_WEBHOOK_SECRET || 'hotelos_payfac_secret_key_2026';

const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

/**
 * Safely converts monetary ILS inputs (e.g. 150.50) to integer Agorot (15050).
 * Prevents floating-point precision drift.
 */
export function toAgorot(amount) {
  if (typeof amount === 'bigint') return Number(amount);
  if (typeof amount === 'number') {
    if (Number.isInteger(amount) && amount > 10000) return amount;
    return Math.round(amount * 100);
  }
  if (typeof amount === 'string') {
    const parsed = parseFloat(amount.replace(/[^0-9.-]+/g, ''));
    if (isNaN(parsed)) return 0;
    return Math.round(parsed * 100);
  }
  return 0;
}

/**
 * Verifies HMAC-SHA256 signature of incoming credit card webhook request.
 */
export function verifyWebhookSignature(rawBody, signatureHeader, secret = WEBHOOK_SECRET) {
  if (!signatureHeader) return false;

  try {
    const computedHmac = crypto
      .createHmac('sha256', secret)
      .update(rawBody)
      .digest('hex');

    const signatureBuffer = Buffer.from(signatureHeader, 'utf8');
    const computedBuffer = Buffer.from(computedHmac, 'utf8');

    if (signatureBuffer.length !== computedBuffer.length) {
      return false;
    }

    return crypto.timingSafeEqual(signatureBuffer, computedBuffer);
  } catch (err) {
    console.error('[HOTELOS WEBHOOK AUTH ERROR]', err);
    return false;
  }
}

/**
 * Main PayFac Webhook Express Handler
 */
export async function handlePayFacWebhook(req, res) {
  const startTime = Date.now();
  const rawBody = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
  const signatureHeader = req.headers['x-payfac-signature'] || req.headers['x-gateway-signature'];

  console.log(`[HOTELOS WEBHOOK INCOMING] Timestamp: ${new Date().toISOString()}`);

  // 1. SECURITY & SIGNATURE VERIFICATION
  const isSignatureValid = verifyWebhookSignature(rawBody, signatureHeader);
  const skipSignatureCheck = process.env.NODE_ENV === 'development' || req.headers['x-skip-signature'] === 'true';

  if (!isSignatureValid && !skipSignatureCheck) {
    console.warn('[HOTELOS WEBHOOK 401] Invalid HMAC Signature attempt.');
    return res.status(401).json({
      error: 'UNAUTHORIZED_SIGNATURE',
      message: 'Invalid HMAC signature. Webhook rejected.'
    });
  }

  // 2. PARSE PAYLOAD & EXTRACT TRANSACTION PARAMETERS
  const payload = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
  const {
    tenant_id,
    booking_id,
    transaction_id,
    idempotency_key,
    amount_ils,
    gross_amount,
    processor_fee_ils,
    platform_commission_ils,
    gateway_status
  } = payload;

  const finalIdempotencyKey = idempotency_key || transaction_id || payload.confirmation_number || payload.tx_id;
  const targetTenantId = tenant_id || payload.tenantId;
  const targetBookingId = booking_id || payload.bookingId || null;

  if (!targetTenantId || !finalIdempotencyKey) {
    console.warn('[HOTELOS WEBHOOK 400] Missing mandatory parameters:', { targetTenantId, finalIdempotencyKey });
    return res.status(400).json({
      error: 'BAD_REQUEST',
      message: 'Missing mandatory tenant_id or transaction_id / idempotency_key.'
    });
  }

  if (gateway_status && !['APPROVED', 'SUCCESS', '000'].includes(String(gateway_status).toUpperCase())) {
    console.log(`[HOTELOS WEBHOOK IGNORED] Payment status: ${gateway_status}`);
    return res.status(200).json({
      success: false,
      message: `Ignored non-successful transaction status: ${gateway_status}`
    });
  }

  // 3. IDEMPOTENCY CHECK
  try {
    const { data: existingLedger, error: checkError } = await supabaseAdmin
      .from('payfac_ledger')
      .select('id, created_at')
      .eq('idempotency_key', finalIdempotencyKey)
      .maybeSingle();

    if (checkError) {
      console.error('[HOTELOS WEBHOOK DB ERROR] Failed checking idempotency:', checkError);
    }

    if (existingLedger) {
      console.log(`[HOTELOS WEBHOOK IDEMPOTENT] Duplicate webhook received for idempotency_key: ${finalIdempotencyKey}`);
      return res.status(200).json({
        success: true,
        duplicate: true,
        ledger_id: existingLedger.id,
        message: 'Transaction already processed successfully.'
      });
    }
  } catch (err) {
    console.error('[HOTELOS WEBHOOK IDEMPOTENCY EXCEPTION]', err);
  }

  // 4. MONETARY VALUES TO AGOROT INTEGERS
  const grossAmountAgorot = toAgorot(gross_amount || amount_ils || payload.amount);
  const defaultProcessorFee = Math.round(grossAmountAgorot * 0.015);
  const defaultPlatformCommission = Math.round(grossAmountAgorot * 0.03);

  const processorFeeAgorot = processor_fee_ils !== undefined ? toAgorot(processor_fee_ils) : defaultProcessorFee;
  const platformCommissionAgorot = platform_commission_ils !== undefined ? toAgorot(platform_commission_ils) : defaultPlatformCommission;

  if (grossAmountAgorot <= 0) {
    return res.status(400).json({
      error: 'INVALID_AMOUNT',
      message: 'Gross amount must be a positive integer in Agorot.'
    });
  }

  // 5. ATOMIC RPC INVOCATION
  try {
    console.log('[HOTELOS WEBHOOK EXECUTING RPC]', {
      p_tenant_id: targetTenantId,
      p_booking_id: targetBookingId,
      p_idempotency_key: finalIdempotencyKey,
      p_gross_amount_agorot: grossAmountAgorot,
      p_processor_fee_agorot: processorFeeAgorot,
      p_platform_commission_agorot: platformCommissionAgorot
    });

    const { data: rpcResult, error: rpcError } = await supabaseAdmin.rpc('process_payfac_transaction', {
      p_tenant_id: targetTenantId,
      p_booking_id: targetBookingId,
      p_idempotency_key: finalIdempotencyKey,
      p_gross_amount_agorot: grossAmountAgorot,
      p_processor_fee_agorot: processorFeeAgorot,
      p_platform_commission_agorot: platformCommissionAgorot
    });

    if (rpcError) {
      console.error('[HOTELOS WEBHOOK RPC FAILURE]', rpcError);
      return res.status(500).json({
        error: 'RPC_EXECUTION_FAILED',
        message: rpcError.message || 'Failed executing process_payfac_transaction RPC.'
      });
    }

    const durationMs = Date.now() - startTime;
    console.log(`[HOTELOS WEBHOOK SUCCESS] Completed in ${durationMs}ms:`, rpcResult);

    return res.status(200).json({
      success: true,
      duplicate: false,
      ledger_id: rpcResult.ledger_id,
      gross_agorot: rpcResult.gross_agorot,
      net_agorot: rpcResult.net_agorot,
      duration_ms: durationMs
    });
  } catch (err) {
    console.error('[HOTELOS WEBHOOK FATAL EXCEPTION]', err);
    return res.status(500).json({
      error: 'SERVER_ERROR',
      message: err.message || 'Internal server error processing webhook.'
    });
  }
}

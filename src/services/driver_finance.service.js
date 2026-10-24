/**
 * Driver finance — commission ledger and settlement lifecycle.
 *
 * Settlement lifecycle (money is only "paid" after the provider confirms it):
 *
 *   pending     record created, nothing charged yet
 *   processing  a mobile-money charge was accepted by the provider; waiting for
 *               the signed provider webhook
 *   paid        provider webhook confirmed a successful payment (or an admin
 *               recorded an off-platform payment) -> commission_owed is reduced
 *   failed      provider rejected / cancelled / expired the charge
 *
 * IMPORTANT (db helper): `db.query()` returns rows, but a connection handed out
 * by `db.transaction()` returns `[rows, fields]`. Every query in this file goes
 * through `q()` so both behave the same way.
 */
const db = require('../config/db');
const ApiError = require('../utils/ApiError');
const config = require('../config/env');
const payment = require('./payment.provider');

const THRESHOLD = Number(process.env.DRIVER_SETTLEMENT_THRESHOLD_TZS || 60000);
const RATE = Number(process.env.DRIVER_COMMISSION_PERCENT || 20);
const NEAR_RADIUS = Number(process.env.CANCEL_NEAR_PICKUP_KM || 1);
const CANCEL_PERCENT = Number(process.env.CANCEL_NEAR_PICKUP_PERCENT || 20);
// A charge that has been "processing" this long without a webhook is treated as expired.
const PROCESSING_TIMEOUT_MIN = Number(process.env.SETTLEMENT_PROCESSING_TIMEOUT_MIN || 15);

const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

function haversine(a, b, c, d) {
  const R = 6371, rad = Math.PI / 180;
  const dLat = (c - a) * rad, dLon = (d - b) * rad;
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(a * rad) * Math.cos(c * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}

/** Run a query on either the pool (`db`) or a transaction connection and always return rows / ResultSetHeader. */
async function q(conn, sql, params = []) {
  if (!conn || conn === db) return db.query(sql, params);
  const [rows] = await conn.query(sql, params);
  return rows;
}

/** Run `fn(conn)` inside the caller's transaction, or open a new one. */
function withTx(conn, fn) {
  return conn ? fn(conn) : db.transaction(fn);
}

async function ensure(conn, driverId) {
  await q(conn, 'INSERT INTO driver_financials(driver_id) VALUES(?) ON DUPLICATE KEY UPDATE driver_id=VALUES(driver_id)', [driverId]);
}

async function state(driverId, conn = null, lock = false) {
  await ensure(conn, driverId);
  const rows = await q(conn, `SELECT * FROM driver_financials WHERE driver_id=?${lock ? ' FOR UPDATE' : ''}`, [driverId]);
  return rows[0];
}

/** Commission still owed for a given gross-since-settlement figure (whole cycles only). */
function commissionFor(gross) {
  const cycles = Math.floor((Number(gross) + 1e-9) / THRESHOLD);
  return { cycles, owed: round2(cycles * THRESHOLD * RATE / 100) };
}

async function getStatus(driverId, conn = null) {
  const f = await state(driverId, conn);
  const gross = Number(f.gross_since_settlement || 0);
  const owed = Number(f.commission_owed || 0);
  const active = await q(
    conn,
    `SELECT id,status,commission_amount,external_reference,created_at FROM driver_settlements
      WHERE driver_id=? AND status IN ('pending','processing') ORDER BY id DESC LIMIT 1`,
    [driverId]
  );
  return {
    driverId: Number(driverId),
    grossSinceSettlement: gross,
    commissionOwed: owed,
    lifetimeGross: Number(f.lifetime_gross || 0),
    lifetimeCommission: Number(f.lifetime_commission || 0),
    blocked: Boolean(Number(f.blocked) === 1 || gross >= THRESHOLD),
    autopayEnabled: Boolean(Number(f.autopay_enabled) === 1),
    autopayProvider: f.autopay_provider || null,
    threshold: THRESHOLD,
    commissionRate: RATE,
    thresholdRemaining: Math.max(0, THRESHOLD - gross),
    settlementRequired: gross >= THRESHOLD || owed > 0,
    activeSettlement: active.length
      ? { id: active[0].id, status: active[0].status, amount: Number(active[0].commission_amount), reference: active[0].external_reference || null }
      : null
  };
}

async function isBlocked(driverId) { return (await getStatus(driverId)).blocked; }

async function assertUsable(driverId, action = 'use the driver app') {
  const s = await getStatus(driverId);
  if (s.blocked || s.commissionOwed > 0) {
    throw ApiError.forbidden(`ZenjiGO settlement required. Outstanding commission: TZS ${s.commissionOwed.toLocaleString()}. Settle the balance before you can ${action}.`);
  }
  return s;
}

/** Record a completed ride in the earnings ledger and update the driver's commission position. */
async function recordRideEarning(conn, driverId, grossFare, rideId) {
  const gross = Math.max(0, Number(grossFare || 0));
  const commission = Math.round(gross * RATE) / 100;
  const driverShare = Math.max(0, gross - commission);
  await ensure(conn, driverId);

  if (rideId) {
    const existing = await q(conn, 'SELECT id FROM driver_earning_ledger WHERE driver_id=? AND ride_id=? LIMIT 1', [driverId, rideId]);
    if (existing.length) return getStatus(driverId, conn);
  }

  await q(
    conn,
    `INSERT INTO driver_earning_ledger(driver_id,ride_id,gross_amount,commission_rate,commission_amount,driver_amount)
     VALUES(?,?,?,?,?,?)`,
    [driverId, rideId || null, gross, RATE, commission, driverShare]
  );

  const f = (await q(conn, 'SELECT gross_since_settlement FROM driver_financials WHERE driver_id=? FOR UPDATE', [driverId]))[0];
  const newGross = round2(Number(f.gross_since_settlement || 0) + gross);
  const { owed } = commissionFor(newGross);
  await q(
    conn,
    `UPDATE driver_financials
        SET gross_since_settlement=?, commission_owed=?, blocked=?,
            lifetime_gross=lifetime_gross+?, lifetime_commission=lifetime_commission+?
      WHERE driver_id=?`,
    [newGross, owed, owed > 0 ? 1 : 0, gross, commission, driverId]
  );
  await q(conn, 'UPDATE driver_profiles SET total_earnings=total_earnings+?,total_rides=total_rides+1 WHERE user_id=?', [driverShare, driverId]);

  const s = await getStatus(driverId, conn);
  if (s.blocked) await q(conn, 'UPDATE driver_profiles SET online=0 WHERE user_id=?', [driverId]);
  return { ...s, gross, commission, driverShare };
}

/**
 * Near-pickup cancellation compensation for the driver.
 * Platform fronts 100% of the fee (0% commission). Recovered from the rider
 * on their next ride via cash / wallet / PayGrid collect.
 */
async function recordCancellationCredit(conn, driverId, feeAmount, rideId) {
  const amount = Math.max(0, Math.round(Number(feeAmount || 0)));
  if (!amount || !driverId) return null;
  await ensure(conn, driverId);

  if (rideId) {
    const existing = await q(
      conn,
      `SELECT id FROM driver_earning_ledger WHERE driver_id=? AND ride_id=? AND commission_rate=0 LIMIT 1`,
      [driverId, rideId]
    );
    if (existing.length) return getStatus(driverId, conn);
  }

  await q(
    conn,
    `INSERT INTO driver_earning_ledger(driver_id,ride_id,gross_amount,commission_rate,commission_amount,driver_amount)
     VALUES(?,?,?,?,?,?)`,
    [driverId, rideId || null, amount, 0, 0, amount]
  );
  // Do not increase gross_since_settlement / commission_owed — platform-funded compensation.
  await q(
    conn,
    `UPDATE driver_financials SET lifetime_gross=lifetime_gross+? WHERE driver_id=?`,
    [amount, driverId]
  );
  await q(
    conn,
    'UPDATE driver_profiles SET total_earnings=total_earnings+? WHERE user_id=?',
    [amount, driverId]
  );
  return { driverId, amount, rideId, type: 'cancellation_credit' };
}

/* ------------------------------------------------------------------ */
/* Settlement records                                                  */
/* ------------------------------------------------------------------ */

async function getSettlement(settlementId, conn = null, lock = false) {
  const rows = await q(conn, `SELECT * FROM driver_settlements WHERE id=?${lock ? ' FOR UPDATE' : ''}`, [settlementId]);
  return rows[0] || null;
}

function publicSettlement(s) {
  if (!s) return null;
  return {
    id: s.id,
    status: s.status,
    amount: Number(s.commission_amount),
    paidAmount: Number(s.paid_amount || 0),
    provider: s.provider || null,
    reference: s.external_reference || null,
    failureReason: s.failure_reason || null,
    createdAt: s.created_at,
    paidAt: s.paid_at || null
  };
}

async function listSettlements(driverId, limit = 20) {
  const n = Math.min(100, Math.max(1, Number(limit) || 20));
  const rows = await db.query(`SELECT * FROM driver_settlements WHERE driver_id=? ORDER BY id DESC LIMIT ${n}`, [driverId]);
  return rows.map(publicSettlement);
}

async function getOwnSettlement(driverId, settlementId) {
  const s = await getSettlement(settlementId);
  if (!s || Number(s.driver_id) !== Number(driverId)) throw ApiError.notFound('Settlement not found.');
  return publicSettlement(s);
}

/**
 * Create (or reuse) the pending settlement for the commission currently owed.
 * Creating a record does NOT mean any money was received.
 */
async function createSettlement(driverId, provider = 'paygrid', metadata = {}, conn = null) {
  return withTx(conn, async (c) => {
    const f = await state(driverId, c, true);
    const owed = Number(f.commission_owed || 0);
    if (owed <= 0) return { status: 'already_settled', amount: 0 };

    const existing = await q(
      c,
      `SELECT id,status,commission_amount FROM driver_settlements
        WHERE driver_id=? AND status IN ('pending','processing') ORDER BY id DESC LIMIT 1 FOR UPDATE`,
      [driverId]
    );
    if (existing.length) {
      const row = existing[0];
      // A pending (not yet charged) record follows the amount currently owed.
      if (row.status === 'pending' && Number(row.commission_amount) !== owed) {
        await q(c, 'UPDATE driver_settlements SET commission_amount=?,gross_earnings=? WHERE id=?', [owed, round2(owed * 100 / RATE), row.id]);
      }
      return {
        id: row.id,
        status: row.status,
        amount: row.status === 'pending' ? owed : Number(row.commission_amount),
        reused: true
      };
    }

    // 7 columns, 7 values (status is the literal 'pending').
    const r = await q(
      c,
      `INSERT INTO driver_settlements
         (driver_id,gross_earnings,commission_rate,commission_amount,status,provider,metadata)
       VALUES (?,?,?,?,'pending',?,?)`,
      [driverId, round2(owed * 100 / RATE), RATE, owed, provider || null, JSON.stringify(metadata || {})]
    );
    return { id: r.insertId, status: 'pending', amount: owed };
  });
}

async function setSettlementMeta(conn, settlementId, patch) {
  await q(
    conn,
    `UPDATE driver_settlements SET metadata=JSON_MERGE_PATCH(COALESCE(metadata,'{}'),?) WHERE id=?`,
    [JSON.stringify(patch), settlementId]
  );
}

async function failSettlement(settlementId, reason) {
  const text = String(reason || 'failed').slice(0, 250);
  await q(
    null,
    `UPDATE driver_settlements
        SET status='failed', failure_reason=?,
            metadata=JSON_MERGE_PATCH(COALESCE(metadata,'{}'),?)
      WHERE id=? AND status IN ('pending','processing')`,
    [text, JSON.stringify({ failReason: text }), settlementId]
  );
  return getSettlement(settlementId);
}

/** Apply a verified payment to the financial position. Must run inside a transaction with the settlement row locked. */
async function applyPayment(conn, settlement, externalReference, extraMeta = {}) {
  const driverId = settlement.driver_id;
  const f = await state(driverId, conn, true);
  const owed = Number(f.commission_owed || 0);
  const gross = Number(f.gross_since_settlement || 0);

  const paid = Math.min(Number(settlement.commission_amount), owed);
  const paidGross = RATE > 0 ? round2(paid * 100 / RATE) : 0;
  const remainingGross = Math.max(0, round2(gross - paidGross));
  const { owed: remainingOwed } = commissionFor(remainingGross);

  await q(
    conn,
    `UPDATE driver_settlements
        SET paid_amount=?, status='paid', failure_reason=NULL,
            external_reference=COALESCE(external_reference,?), paid_at=UTC_TIMESTAMP(),
            metadata=JSON_MERGE_PATCH(COALESCE(metadata,'{}'),?)
      WHERE id=?`,
    [paid, externalReference || null, JSON.stringify({ confirmed: true, ...extraMeta }), settlement.id]
  );
  await q(
    conn,
    'UPDATE driver_financials SET commission_owed=?,gross_since_settlement=?,blocked=? WHERE driver_id=?',
    [remainingOwed, remainingGross, remainingOwed > 0 ? 1 : 0, driverId]
  );
  return getSettlement(settlement.id, conn);
}

/**
 * Called ONLY after the payment provider has confirmed success (signed webhook)
 * or by an admin recording an off-platform payment. Idempotent.
 *
 * `confirmation.amount` (when supplied) must cover the settlement amount, otherwise
 * the settlement stays open and the shortfall is recorded for follow-up.
 */
async function confirmSettlementPaid(settlementId, confirmation = {}) {
  return db.transaction(async (conn) => {
    const s = await getSettlement(settlementId, conn, true);
    if (!s) throw ApiError.notFound('Settlement not found.');
    if (s.status === 'paid') return { status: 'paid', settlement: publicSettlement(s), alreadyPaid: true };

    const amount = confirmation.amount;
    if (amount != null && Number.isFinite(Number(amount)) && Number(amount) + 0.009 < Number(s.commission_amount)) {
      await setSettlementMeta(conn, s.id, { underpaid: { received: Number(amount), expected: Number(s.commission_amount), eventId: confirmation.eventId || null } });
      return { status: 'underpaid', settlement: publicSettlement(s) };
    }
    if (confirmation.currency && String(confirmation.currency).toUpperCase() !== String(config.ride.currency || 'TZS').toUpperCase()) {
      await setSettlementMeta(conn, s.id, { currencyMismatch: confirmation.currency });
      return { status: 'currency_mismatch', settlement: publicSettlement(s) };
    }

    const updated = await applyPayment(conn, s, confirmation.externalReference, {
      providerReference: confirmation.providerReference || confirmation.externalReference || null,
      eventId: confirmation.eventId || null,
      confirmedBy: confirmation.confirmedBy || 'provider_webhook'
    });
    return { status: 'paid', settlement: publicSettlement(updated) };
  });
}

/** Backwards-compatible name. Internal/admin use only — never expose to drivers. */
async function markPaid(driverId, settlementId, externalReference) {
  const s = await getSettlement(settlementId);
  if (!s || Number(s.driver_id) !== Number(driverId)) throw ApiError.notFound('Settlement not found.');
  const r = await confirmSettlementPaid(settlementId, { externalReference, confirmedBy: 'admin' });
  return r.settlement;
}

/** Find the settlement a provider webhook refers to. */
async function findSettlementFromWebhook(event) {
  if (event.settlementId) {
    const s = await getSettlement(event.settlementId);
    if (s) return s;
  }
  for (const ref of [event.merchantReference, event.externalReference]) {
    if (!ref) continue;
    let rows = await db.query('SELECT * FROM driver_settlements WHERE external_reference=? ORDER BY id DESC LIMIT 1', [ref]);
    if (rows.length) return rows[0];
    rows = await db.query(
      `SELECT * FROM driver_settlements WHERE JSON_UNQUOTE(JSON_EXTRACT(metadata,'$.providerReference'))=? ORDER BY id DESC LIMIT 1`,
      [ref]
    );
    if (rows.length) return rows[0];
  }
  return null;
}

/* ------------------------------------------------------------------ */
/* Charging                                                            */
/* ------------------------------------------------------------------ */

async function resolveMethod(driverId, paymentMethodId) {
  const rows = paymentMethodId
    ? await db.query('SELECT * FROM driver_payment_methods WHERE id=? AND driver_id=? AND active=1', [paymentMethodId, driverId])
    : await db.query(
        'SELECT * FROM driver_payment_methods WHERE driver_id=? AND active=1 ORDER BY is_autopay_default DESC, id DESC LIMIT 1',
        [driverId]
      );
  return rows[0] || null;
}

async function resolvePhone(driverId, method, override) {
  if (override) return override;
  if (method && method.phone) return method.phone;
  const u = await db.query('SELECT phone FROM users WHERE id=? LIMIT 1', [driverId]);
  return (u[0] && u[0].phone) || null;
}

/**
 * Start a mobile-money charge for the commission owed.
 * The settlement ends up `processing`; it becomes `paid` only when the provider
 * webhook confirms it (see payments webhook -> confirmSettlementPaid).
 */
async function initiateSettlementPayment(driverId, opts = {}) {
  const { paymentMethodId = null, phone = null, auto = false } = opts;

  const s0 = await getStatus(driverId);
  if (s0.commissionOwed <= 0) return { status: 'already_settled', commission: s0 };

  // Expire charges that never got a webhook so the driver can retry.
  await db.query(
    `UPDATE driver_settlements
        SET status='failed', failure_reason='expired_no_confirmation'
      WHERE driver_id=? AND status='processing'
        AND COALESCE(updated_at,created_at) < (UTC_TIMESTAMP() - INTERVAL ? MINUTE)`,
    [driverId, PROCESSING_TIMEOUT_MIN]
  );

  const method = await resolveMethod(driverId, paymentMethodId);
  if (paymentMethodId && !method) throw ApiError.badRequest('Payment method not found.');
  const chargePhone = await resolvePhone(driverId, method, phone);
  if (!chargePhone) throw ApiError.badRequest('A mobile-money phone number is required to settle.');

  const settlement = await createSettlement(driverId, 'paygrid', { auto: Boolean(auto), paymentMethodId: method ? method.id : null });
  if (settlement.status === 'already_settled') return { status: 'already_settled', commission: await getStatus(driverId) };
  if (settlement.status === 'processing') {
    // A charge is already awaiting confirmation: never charge the driver twice.
    return {
      status: 'processing',
      settlement: publicSettlement(await getSettlement(settlement.id)),
      commission: await getStatus(driverId),
      message: 'A payment is already in progress. Confirm the prompt on your phone.'
    };
  }

  const reference = `ZENJIGO-COM-${driverId}-${settlement.id}-${Date.now()}`;
  // Mark processing + store our reference BEFORE calling the provider, so a fast webhook can find it.
  await db.query(
    `UPDATE driver_settlements SET status='processing',external_reference=?,payment_method_id=?,provider='paygrid' WHERE id=? AND status='pending'`,
    [reference, method ? method.id : null, settlement.id]
  );

  try {
    const result = await payment.chargeDriverCommission({
      amount: settlement.amount,
      currency: config.ride.currency || 'TZS',
      driverId,
      settlementId: settlement.id,
      reference,
      paymentMethod: { ...(method || {}), phone: chargePhone }
    });
    if (result.externalReference && result.externalReference !== reference) {
      await setSettlementMeta(null, settlement.id, { providerReference: String(result.externalReference) });
    }
    // Some providers answer "completed" synchronously — still require the signed webhook as proof.
  } catch (err) {
    await failSettlement(settlement.id, err.message);
    throw ApiError.badRequest(err.message || 'Settlement payment could not be started.');
  }

  return {
    status: 'processing',
    settlement: publicSettlement(await getSettlement(settlement.id)),
    commission: await getStatus(driverId),
    message: 'Confirm the payment prompt on your phone. Your account is unlocked once the payment is confirmed.'
  };
}

/** Kept for compatibility. Starts the charge; it no longer marks anything paid by itself. */
async function settleNow(driverId, paymentMethodId = null, auto = false) {
  return initiateSettlementPayment(driverId, { paymentMethodId, auto });
}

/**
 * Admin recorded an off-platform payment (cash / bank). Requires commission to be owed.
 * Refuses while a mobile-money charge is still awaiting confirmation unless `force` is true.
 */
async function adminSettle(driverId, adminId, { reference = null, note = null, force = false } = {}) {
  const s = await getStatus(driverId);
  if (s.commissionOwed <= 0) throw ApiError.badRequest('This driver has no outstanding commission to settle.');
  if (s.activeSettlement && s.activeSettlement.status === 'processing' && !force) {
    throw ApiError.conflict('A mobile-money payment is still awaiting confirmation for this driver. Wait for it, or retry with force=true.');
  }
  const settlement = await createSettlement(driverId, 'admin_manual', { adminId, note: note || null });
  const ref = reference || `ADMIN-${adminId}-${settlement.id}-${Date.now()}`;
  const r = await confirmSettlementPaid(settlement.id, { externalReference: ref, confirmedBy: `admin:${adminId}` });
  return { ...r, commission: await getStatus(driverId) };
}

async function configureAutopay(driverId, enabled, provider, providerToken, metadata = {}) {
  if (enabled && !providerToken) throw ApiError.badRequest('A provider token/mandate is required for autopay. Never store raw payment credentials.');
  await db.transaction(async (conn) => {
    await q(
      conn,
      `INSERT INTO driver_financials(driver_id,autopay_enabled,autopay_provider,autopay_reference,autopay_metadata) VALUES(?,?,?,?,?)
       ON DUPLICATE KEY UPDATE autopay_enabled=VALUES(autopay_enabled),autopay_provider=VALUES(autopay_provider),autopay_reference=VALUES(autopay_reference),autopay_metadata=VALUES(autopay_metadata)`,
      [driverId, enabled ? 1 : 0, enabled ? (provider || config.payment.provider) : null, enabled ? providerToken : null, enabled ? JSON.stringify(metadata) : null]
    );
    if (enabled) {
      await q(conn, 'UPDATE driver_payment_methods SET is_autopay_default=0 WHERE driver_id=?', [driverId]);
      await q(
        conn,
        `INSERT INTO driver_payment_methods(driver_id,provider,token,masked_account,phone,is_autopay_default,active,is_default)
         VALUES(?,?,?,?,?,1,1,1)`,
        [driverId, provider || config.payment.provider, providerToken, metadata.maskedAccount || null, metadata.phone || null]
      );
    } else {
      await q(conn, 'UPDATE driver_payment_methods SET is_autopay_default=0 WHERE driver_id=?', [driverId]);
    }
  });
  return getStatus(driverId);
}

async function tryAutopay(driverId) {
  const s = await getStatus(driverId);
  if (!s.autopayEnabled || s.commissionOwed <= 0) return { status: 'not_due' };
  try {
    const f = await state(driverId);
    const methodRows = await db.query(
      'SELECT * FROM driver_payment_methods WHERE driver_id=? AND active=1 AND token=? ORDER BY id DESC LIMIT 1',
      [driverId, f.autopay_reference]
    );
    if (!methodRows.length) return { status: 'pending', reason: 'No matching autopay payment method' };
    return await initiateSettlementPayment(driverId, { paymentMethodId: methodRows[0].id, auto: true });
  } catch (error) {
    return { status: 'failed', message: error.message };
  }
}

async function addPaymentMethod(driverId, b) {
  const provider = b.provider || 'momo';
  const token = b.providerToken || b.token;
  if (!token) throw ApiError.badRequest('providerToken (mandate reference) is required.');
  const phone = b.phone || null;
  const masked = b.maskedAccount || (phone && phone.length > 4 ? ('****' + phone.slice(-4)) : null);
  if (b.isAutopayDefault) {
    await db.query('UPDATE driver_payment_methods SET is_autopay_default=0, is_default=0 WHERE driver_id=?', [driverId]);
  }
  const r = await db.query(
    `INSERT INTO driver_payment_methods(driver_id,provider,token,masked_account,phone,is_autopay_default,active,is_default)
     VALUES(?,?,?,?,?,?,1,?)`,
    [driverId, provider, token, masked, phone, b.isAutopayDefault ? 1 : 0, b.isAutopayDefault ? 1 : 0]
  );
  return (await db.query(
    'SELECT id,driver_id,provider,token,masked_account,phone,is_autopay_default,is_default,active,created_at FROM driver_payment_methods WHERE id=?',
    [r.insertId]
  ))[0];
}

module.exports = {
  THRESHOLD, RATE, NEAR_RADIUS, CANCEL_PERCENT, haversine,
  state, getStatus, isBlocked, assertUsable,
  assertCanOperate: assertUsable, // used by middleware/driverSettlementGate.js
  recordRideEarning,
  recordCancellationCredit,
  createSettlement, initiateSettlementPayment, confirmSettlementPaid, failSettlement,
  findSettlementFromWebhook, listSettlements, getOwnSettlement, getSettlement,
  adminSettle, markPaid, settleNow,
  configureAutopay, addPaymentMethod, tryAutopay
};

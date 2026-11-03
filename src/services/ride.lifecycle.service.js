/**
 * Ride lifecycle engine.
 *
 * Goal: no ride can ever get permanently stuck, and no rider / driver can ever be locked out of the app because
 * of a ride nobody is working on. Every non-terminal ride is either progressing, or is automatically
 * re-dispatched / closed here, or surfaces in the admin "needs attention" queue.
 */
const db = require('../config/db');
const ApiError = require('../utils/ApiError');
const rides = require('./ride.service');

const { ACTIVE_STATUSES, LIFE, minutesSince, cancelSystem, redispatchRide, pushUser } = rides;

/* ------------------------------------------------------------------ *
 * Schema self-heal (so a forgotten `npm run migrate` can never crash the API)
 * ------------------------------------------------------------------ */
async function ensureLifecycleSchema() {
  const wanted = [
    ['searching_since', 'DATETIME NULL'],
    ['redispatch_count', 'TINYINT UNSIGNED NOT NULL DEFAULT 0'],
    ['needs_attention', 'TINYINT(1) NOT NULL DEFAULT 0'],
    ['attention_reason', 'VARCHAR(255) NULL']
  ];
  const have = await db.query(
    `SELECT COLUMN_NAME c FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'rides'`
  );
  const names = new Set(have.map((r) => r.c));
  for (const [col, ddl] of wanted) {
    if (!names.has(col)) {
      await db.query(`ALTER TABLE rides ADD COLUMN ${col} ${ddl}`);
      console.log(`[schema] added rides.${col}`);
    }
  }
  try { await db.query('CREATE INDEX idx_ride_attention ON rides(needs_attention,status)'); } catch (_) { /* exists */ }
}

/* ------------------------------------------------------------------ *
 * Active ride (for app restore after restart / reinstall / second device)
 * ------------------------------------------------------------------ */
async function getActiveRide(userId, role) {
  if (role === 'rider') { try { await healRiderRides(userId); } catch (e) { console.warn('[active heal]', e.message); } }
  const col = role === 'driver' ? 'driver_id' : 'rider_id';
  const rows = await db.query(
    `SELECT id FROM rides WHERE ${col}=? AND status IN ('searching','accepted','arriving','arrived','started') ORDER BY id DESC LIMIT 1`,
    [userId]
  );
  if (!rows.length) return null;
  return rides.getById(rows[0].id, userId);
}

/** A completed ride the rider has not rated yet (so the rating prompt survives an app restart). */
async function getUnratedCompleted(riderId) {
  const rows = await db.query(
    `SELECT r.id FROM rides r
     WHERE r.rider_id=? AND r.status='completed' AND r.driver_id IS NOT NULL
       AND r.completed_at >= DATE_SUB(UTC_TIMESTAMP(), INTERVAL 24 HOUR)
       AND NOT EXISTS (SELECT 1 FROM ratings x WHERE x.ride_id=r.id AND x.from_user_id=r.rider_id)
     ORDER BY r.id DESC LIMIT 1`,
    [riderId]
  );
  return rows.length ? rides.getById(rows[0].id, riderId) : null;
}

/* ------------------------------------------------------------------ *
 * Per-ride resolution rules
 * ------------------------------------------------------------------ */
async function loadCandidates(where, params) {
  return db.query(
    `SELECT r.*, d.online driver_online, d.location_updated_at driver_pinged_at, du.status driver_user_status,
            dp.application_status driver_application_status
       FROM rides r
       LEFT JOIN driver_profiles d ON d.user_id = r.driver_id
       LEFT JOIN driver_profiles dp ON dp.user_id = r.driver_id
       LEFT JOIN users du ON du.id = r.driver_id
      WHERE r.status IN ('accepted','arriving','arrived','started') ${where}
      ORDER BY r.id ASC LIMIT 500`,
    params
  );
}

async function rideEvents(rideId) {
  const ev = await db.query(
    `SELECT event_type, created_at FROM ride_events WHERE ride_id=? AND event_type IN ('reached_destination','rider_cash_selected','payment_confirmed','payment_overdue_flagged')`,
    [rideId]
  );
  const by = {};
  for (const e of ev) by[e.event_type] = e;
  return by;
}

/** Applies the lifecycle rules to one active (non-searching) ride. Returns a short action label or null. */
async function resolveRide(r) {
  const pingAge = minutesSince(r.driver_pinged_at);
  const driverSilent = !r.driver_online || pingAge == null || pingAge >= LIFE.driverStaleMin();
  const driverGone = !r.driver_id
    || ['suspended', 'rejected'].includes(r.driver_user_status)
    || (r.driver_application_status && r.driver_application_status !== 'active');

  // ---- Before the trip starts -------------------------------------------------------------------------------
  if (['accepted', 'arriving', 'arrived'].includes(r.status)) {
    const sinceAccepted = minutesSince(r.accepted_at || r.requested_at || r.created_at) ?? 0;

    if (driverGone) {
      await redispatchRide(r.id, { reason: 'driver_unavailable' });
      return 'redispatched:driver_unavailable';
    }
    if (r.status === 'arrived') {
      const waited = minutesSince(r.arrived_at) ?? 0;
      if (waited >= LIFE.noShowMin()) {
        if (driverSilent) {
          // The driver left too — nobody is at fault, no fee.
          await cancelSystem(r.id, { reason: 'The driver became unreachable while waiting at pickup.', event: 'auto_cancelled' });
          return 'cancelled:driver_left';
        }
        // Rider no-show: same policy as a late rider cancellation (fee applied silently, driver compensated).
        await rides.cancelRider(r.rider_id, r.id, 'No-show: rider did not meet the driver');
        return 'cancelled:no_show';
      }
      return null;
    }
    if (driverSilent && sinceAccepted >= LIFE.driverStaleMin()) {
      await redispatchRide(r.id, { reason: 'driver_unresponsive' });
      return 'redispatched:driver_unresponsive';
    }
    if (sinceAccepted >= LIFE.acceptedMaxMin()) {
      await redispatchRide(r.id, { reason: 'driver_never_arrived' });
      return 'redispatched:driver_never_arrived';
    }
    return null;
  }

  // ---- Trip running ----------------------------------------------------------------------------------------
  if (r.status === 'started') {
    const ev = await rideEvents(r.id);
    const sinceStart = minutesSince(r.started_at) ?? 0;

    if (!ev.reached_destination) {
      if (sinceStart >= LIFE.tripMaxHours() * 60) {
        await cancelSystem(r.id, { reason: 'This trip ran far longer than expected and was closed automatically. Support will review it.', event: 'auto_closed', flag: true });
        return 'closed:trip_too_long';
      }
      if ((driverGone || driverSilent) && sinceStart >= LIFE.tripStaleMin() && (pingAge == null || pingAge >= LIFE.tripStaleMin())) {
        await cancelSystem(r.id, { reason: 'The driver lost contact during the trip, so it was closed automatically. Support will review it.', event: 'auto_closed', flag: true });
        return 'closed:driver_lost_contact';
      }
      return null;
    }

    // Reached destination but the money side is not finished.
    if (!ev.payment_confirmed) {
      const sinceReached = minutesSince(ev.reached_destination.created_at) ?? 0;
      const cashish = r.payment_method === 'cash' || !!ev.rider_cash_selected;
      if (cashish && sinceReached >= LIFE.cashAutoMin()) {
        await rides.confirmPaymentAndComplete(r.id, { source: 'auto_cash_timeout', method: 'cash' });
        return 'completed:auto_cash';
      }
      if (sinceReached >= LIFE.payOverdueMin() && !ev.payment_overdue_flagged) {
        await db.query('INSERT INTO ride_events(ride_id,actor_id,event_type,payload) VALUES(?,?,?,?)', [r.id, null, 'payment_overdue_flagged', JSON.stringify({ sinceReachedMin: Math.round(sinceReached) })]);
        await db.query('UPDATE rides SET needs_attention=1, attention_reason=? WHERE id=?', ['Destination reached but payment not completed', r.id]);
        await pushUser(r.rider_id, 'Payment still due', 'Please pay for your trip to finish it. Open the app to complete payment.', { type: 'ride_payment_due', rideId: String(r.id), status: 'started' });
        return 'flagged:payment_overdue';
      }
    }
  }
  return null;
}

/** Runs the rules for every active ride (called each minute). */
async function runReaper() {
  const out = [];
  const cands = await loadCandidates('', []);
  for (const r of cands) {
    try {
      const a = await resolveRide(r);
      if (a) out.push({ rideId: r.id, action: a });
    } catch (e) {
      console.warn(`[reaper] ride ${r.id} failed:`, e.message);
    }
  }
  // A ride left in `accepted` with its driver deleted (FK SET NULL) is handled above via driverGone.
  const expired = await rides.expireStaleSearching();
  if (expired) out.push({ action: `expired:${expired}` });
  return out;
}

/** Same rules, but only for one rider (called before booking and when the app asks for the active ride). */
async function healRiderRides(riderId) {
  const cands = await loadCandidates('AND r.rider_id = ?', [riderId]);
  for (const r of cands) {
    try { await resolveRide(r); } catch (e) { console.warn(`[heal] ride ${r.id}:`, e.message); }
  }
  const stale = await db.query(
    `SELECT id FROM rides WHERE rider_id=? AND status='searching' AND COALESCE(searching_since, created_at) < DATE_SUB(UTC_TIMESTAMP(), INTERVAL ? SECOND)`,
    [riderId, LIFE.searchWindowSec()]
  );
  for (const s of stale) {
    await cancelSystem(s.id, { reason: 'No drivers available', event: 'expired' });
  }
}

/* ------------------------------------------------------------------ *
 * When an account is suspended / archived, its live rides must not be orphaned
 * ------------------------------------------------------------------ */
async function releaseUserRides(userId, role, reason = 'Account unavailable') {
  const col = role === 'driver' ? 'driver_id' : 'rider_id';
  const rows = await db.query(`SELECT id,status FROM rides WHERE ${col}=? AND status IN ('searching','accepted','arriving','arrived','started')`, [userId]);
  let n = 0;
  for (const r of rows) {
    if (role === 'driver' && ['accepted', 'arriving', 'arrived'].includes(r.status)) {
      await redispatchRide(r.id, { reason: 'driver_account_unavailable' });
    } else {
      await cancelSystem(r.id, {
        reason: role === 'driver' ? 'The driver account became unavailable during the trip. Support will review it.' : 'The rider account was closed.',
        event: 'auto_closed', flag: role === 'driver' && r.status === 'started'
      });
    }
    n++;
  }
  return n;
}

/* ------------------------------------------------------------------ *
 * Admin interventions
 * ------------------------------------------------------------------ */
async function adminCancel(adminId, rideId, reason) {
  const prev = await cancelSystem(rideId, { reason: reason || 'Cancelled by ZenjiGO support', actorId: adminId, event: 'admin_cancelled' });
  if (!prev) throw ApiError.conflict('This ride is already finished.');
  await db.query('UPDATE rides SET needs_attention=0 WHERE id=?', [rideId]);
  return { id: Number(rideId), status: 'cancelled' };
}

async function adminComplete(adminId, rideId, { method, note } = {}) {
  const rows = await db.query('SELECT status,driver_id FROM rides WHERE id=?', [rideId]);
  if (!rows.length) throw ApiError.notFound('Ride not found');
  const r = rows[0];
  if (r.status === 'completed') throw ApiError.conflict('This ride is already completed.');
  if (r.status !== 'started') throw ApiError.conflict(`Only a started trip can be completed manually (this ride is ${r.status}). Cancel it or return it to search instead.`);
  if (!r.driver_id) throw ApiError.conflict('This ride has no driver, so it cannot be completed.');
  const m = ['cash', 'wallet', 'momo', 'bank', 'card'].includes(method) ? method : 'cash';
  await db.query('INSERT INTO ride_events(ride_id,actor_id,event_type,payload) VALUES(?,?,?,?)', [rideId, adminId, 'admin_override', JSON.stringify({ action: 'complete', method: m, note: note || null })]);
  await rides.confirmPaymentAndComplete(rideId, { source: 'admin', method: m });
  await db.query('UPDATE rides SET needs_attention=0 WHERE id=?', [rideId]);
  return { id: Number(rideId), status: 'completed' };
}

async function adminRedispatch(adminId, rideId) {
  const res = await redispatchRide(rideId, { reason: 'admin_redispatch', actorId: adminId, message: 'Support is finding you another driver.' });
  if (res.outcome === 'noop') throw ApiError.conflict('Only rides that were accepted but not yet started can be returned to search.');
  await db.query('UPDATE rides SET needs_attention=0 WHERE id=?', [rideId]);
  return { id: Number(rideId), status: res.outcome === 'searching' ? 'searching' : 'cancelled' };
}

async function adminDismissFlag(rideId) {
  await db.query('UPDATE rides SET needs_attention=0 WHERE id=?', [rideId]);
  return { id: Number(rideId) };
}

/** Rides that need a human: flagged by the engine, or active for suspiciously long. */
async function listAttention() {
  const rows = await db.query(
    `SELECT r.id, r.ride_code, r.status, r.ride_type, r.payment_method, r.estimated_fare, r.pickup_address, r.destination_address,
            r.rider_id, r.driver_id, r.created_at, r.accepted_at, r.arrived_at, r.started_at, r.cancelled_at, r.updated_at,
            r.needs_attention, r.attention_reason, r.cancel_reason, r.redispatch_count,
            ru.full_name riderName, ru.phone riderPhone, du.full_name driverName, du.phone driverPhone,
            d.online driverOnline, d.location_updated_at driverPingedAt
       FROM rides r
       JOIN users ru ON ru.id = r.rider_id
       LEFT JOIN users du ON du.id = r.driver_id
       LEFT JOIN driver_profiles d ON d.user_id = r.driver_id
      WHERE (r.needs_attention = 1 AND r.updated_at >= DATE_SUB(UTC_TIMESTAMP(), INTERVAL 14 DAY))
         OR (r.status IN ('accepted','arriving','arrived') AND COALESCE(r.accepted_at, r.created_at) < DATE_SUB(UTC_TIMESTAMP(), INTERVAL ? MINUTE))
         OR (r.status = 'started' AND COALESCE(r.started_at, r.created_at) < DATE_SUB(UTC_TIMESTAMP(), INTERVAL ? MINUTE))
         OR (r.status = 'searching' AND COALESCE(r.searching_since, r.created_at) < DATE_SUB(UTC_TIMESTAMP(), INTERVAL ? SECOND))
      ORDER BY r.updated_at DESC LIMIT 200`,
    [LIFE.driverStaleMin() * 2, LIFE.tripStaleMin(), LIFE.searchWindowSec() * 2]
  );
  return rows.map((r) => {
    const pingAge = minutesSince(r.driverPingedAt);
    let reason = r.attention_reason || null;
    if (!reason && ACTIVE_STATUSES.includes(r.status)) {
      if (r.driver_id && (!r.driverOnline || pingAge == null || pingAge >= LIFE.driverStaleMin())) reason = 'Driver is offline or silent';
      else reason = `Ride has been ${r.status} for an unusually long time`;
    }
    return { ...r, reason, pingAgeMin: pingAge == null ? null : Math.round(pingAge) };
  });
}

async function attentionCount() {
  const rows = await listAttention();
  return rows.filter((r) => ACTIVE_STATUSES.includes(r.status) || r.needs_attention).length;
}

module.exports = {
  ensureLifecycleSchema,
  getActiveRide,
  getUnratedCompleted,
  runReaper,
  healRiderRides,
  releaseUserRides,
  resolveRide,
  adminCancel,
  adminComplete,
  adminRedispatch,
  adminDismissFlag,
  listAttention,
  attentionCount
};

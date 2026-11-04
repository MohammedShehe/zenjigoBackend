const db = require('../config/db');
const ApiError = require('../utils/ApiError');
const { ok } = require('../utils/response');
const asyncHandler = require('../utils/asyncHandler');
const finance = require('../services/driver_finance.service');

const code = (p) =>
  `${p}${Date.now().toString(36).toUpperCase().slice(-8)}${Math.floor(Math.random() * 99)
    .toString()
    .padStart(2, '0')}`;

exports.parcels = asyncHandler(async (req, res) =>
  ok(res, await db.query('SELECT * FROM parcels WHERE rider_id=? ORDER BY id DESC', [req.user.sub]))
);

exports.createParcel = asyncHandler(async (req, res) => {
  const b = req.body;
  if (!b.pickupAddress || !b.deliveryAddress || !b.description) {
    throw ApiError.badRequest('pickupAddress, deliveryAddress and description are required');
  }
  const parcelCode = code('PZ');
  const r = await db.query(
    `INSERT INTO parcels(parcel_code,rider_id,pickup_address,pickup_lat,pickup_lng,delivery_address,delivery_lat,delivery_lng,description,weight_kg,pickup_at,estimated_fare)
     VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`,
    [
      parcelCode,
      req.user.sub,
      b.pickupAddress,
      b.pickupLat || null,
      b.pickupLng || null,
      b.deliveryAddress,
      b.deliveryLat || null,
      b.deliveryLng || null,
      b.description,
      b.weightKg || null,
      b.pickupAt || null,
      b.estimatedFare || null,
    ]
  );
  ok(res, { id: r.insertId, code: parcelCode }, 'Parcel created', 201);
});

exports.parcel = asyncHandler(async (req, res) => {
  const r = await db.query('SELECT * FROM parcels WHERE id=? AND rider_id=?', [req.params.id, req.user.sub]);
  if (!r.length) throw ApiError.notFound('Parcel not found');
  ok(res, r[0]);
});

exports.tourPackages = asyncHandler(async (req, res) =>
  ok(res, await db.query('SELECT * FROM tour_packages WHERE is_active=1 ORDER BY id'))
);

exports.tours = asyncHandler(async (req, res) =>
  ok(
    res,
    await db.query(
      `SELECT b.*, p.name package_name, p.description package_description, p.base_price, p.duration_hours
       FROM tour_bookings b
       JOIN tour_packages p ON p.id = b.package_id
       WHERE b.rider_id=? ORDER BY b.id DESC`,
      [req.user.sub]
    )
  )
);

/** Book a single tour package — tolerant of missing optional fields from mobile apps */
exports.createTour = asyncHandler(async (req, res) => {
  const b = req.body || {};
  const packageId = b.packageId || b.tourPackageId || b.tourId || b.id;
  if (!packageId) throw ApiError.badRequest('packageId is required');

  const p = await db.query('SELECT * FROM tour_packages WHERE id=? AND is_active=1', [packageId]);
  if (!p.length) throw ApiError.notFound('Tour package not found');

  const maxTourists = Number(p[0].max_tourists) || 4;
  let tourists = Number(b.tourists);
  if (!Number.isFinite(tourists) || tourists < 1) tourists = 1;
  if (tourists > maxTourists) throw ApiError.badRequest(`Maximum ${maxTourists} tourists for this package`);

  const pickupLocation =
    b.pickupLocation || b.pickup || b.location || p[0].pickup_notes || 'To be confirmed';
  let pickupAt = b.pickupAt || b.date || b.scheduledAt;
  if (!pickupAt) {
    // Default: tomorrow noon UTC
    const d = new Date();
    d.setUTCDate(d.getUTCDate() + 1);
    d.setUTCHours(12, 0, 0, 0);
    pickupAt = d.toISOString().slice(0, 19).replace('T', ' ');
  }

  const total = Number(p[0].base_price) * tourists;
  const r = await db.query(
    `INSERT INTO tour_bookings(booking_code,package_id,rider_id,pickup_location,pickup_at,tourists,total_amount)
     VALUES(?,?,?,?,?,?,?)`,
    [code('TZ'), packageId, req.user.sub, pickupLocation, pickupAt, tourists, total]
  );
  ok(res, { id: r.insertId, totalAmount: total, bookingCode: code('TZ') }, 'Tour booked', 201);
});

/** Public-ish app metadata for version checks */
exports.appVersion = asyncHandler(async (req, res) => {
  const pkg = require('../../package.json');
  let remote = null;
  try {
    const rows = await db.query(`SELECT value_json FROM app_settings WHERE setting_key='app_version' LIMIT 1`);
    if (rows.length) {
      remote = typeof rows[0].value_json === 'string' ? JSON.parse(rows[0].value_json) : rows[0].value_json;
    }
  } catch (_) {}
  ok(res, {
    version: (remote && remote.version) || pkg.version || '1.0.0',
    build: (remote && remote.build) || 1,
    minVersion: (remote && remote.minVersion) || '1.0.0',
    supportEmail: 'support@zenjigo.online',
    supportPhone: '+255 676 891 227',
  });
});


/** True when the driver owes settlement (same rule as GET /driver/ride-requests and accept). */
async function isRestricted(driverId) {
  const f = await finance.getStatus(driverId);
  return !!(f.blocked || f.commissionOwed > 0);
}

/** Only an admin-approved, active driver may take on work. */
async function assertActiveDriver(driverId) {
  const r = await db.query(
    `SELECT 1 FROM driver_profiles d JOIN users u ON u.id=d.user_id
     WHERE d.user_id=? AND d.application_status='active' AND u.status='active' LIMIT 1`, [driverId]);
  if (!r.length) throw ApiError.forbidden('Your driver account is not approved to accept work.');
}

/** Pending parcels. Drivers who owe settlement get map-pin data only (no addresses, parties or fares). */
exports.pendingParcels = asyncHandler(async (req, res) => {
  if (await isRestricted(req.user.sub)) {
    const rows = await db.query(
      `SELECT id, parcel_code, pickup_lat, pickup_lng, created_at FROM parcels WHERE status='pending' AND driver_id IS NULL ORDER BY id DESC LIMIT 50`);
    // Explicit whitelist: nothing else can leak even if the query is later widened.
    return ok(res, rows.map((r) => ({ id: r.id, parcel_code: r.parcel_code, pickup_lat: r.pickup_lat, pickup_lng: r.pickup_lng, created_at: r.created_at, masked: true, settlementRequired: true })));
  }
  const rows = await db.query(
    `SELECT * FROM parcels WHERE status='pending' AND driver_id IS NULL ORDER BY pickup_at IS NULL, pickup_at ASC, id DESC LIMIT 50`
  );
  ok(res, rows);
});

exports.acceptParcel = asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) throw ApiError.badRequest('Invalid parcel.');
  await finance.assertUsable(req.user.sub, 'accept parcels');
  await assertActiveDriver(req.user.sub);
  // Single atomic claim: only one driver can flip pending -> assigned.
  const r = await db.query(`UPDATE parcels SET driver_id=?, status='assigned' WHERE id=? AND status='pending' AND driver_id IS NULL`, [req.user.sub, id]);
  if (!r.affectedRows) throw ApiError.conflict('Parcel is no longer available.');
  ok(res, { id }, 'Parcel accepted');
});

exports.pendingTours = asyncHandler(async (req, res) => {
  if (await isRestricted(req.user.sub)) {
    // Tour bookings carry no coordinates, so a restricted driver gets nothing to act on.
    return ok(res, []);
  }
  const rows = await db.query(
    `SELECT b.*, p.name package_name, p.description package_description, p.duration_hours
     FROM tour_bookings b
     JOIN tour_packages p ON p.id = b.package_id
     WHERE b.status='pending' AND b.driver_id IS NULL
     ORDER BY b.pickup_at ASC, b.id DESC LIMIT 50`
  );
  ok(res, rows);
});

exports.acceptTour = asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) throw ApiError.badRequest('Invalid booking.');
  await finance.assertUsable(req.user.sub, 'accept tours');
  await assertActiveDriver(req.user.sub);
  const r = await db.query(`UPDATE tour_bookings SET driver_id=?, status='assigned' WHERE id=? AND status='pending' AND driver_id IS NULL`, [req.user.sub, id]);
  if (!r.affectedRows) throw ApiError.conflict('Tour booking is no longer available.');
  ok(res, { id }, 'Tour accepted');
});

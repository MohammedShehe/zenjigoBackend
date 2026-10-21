const db = require('../config/db');
const config = require('../config/env');
const { hashPassword } = require('../utils/hash');
const ApiError = require('../utils/ApiError');
const archiveService = require('../services/archive.service');
const { ok } = require('../utils/response');
const asyncHandler = require('../utils/asyncHandler');
const { notifyUser } = require('../services/notification.service');

function audit(adminId, action, entityType, entityId, meta = null) {
  return db.query(
    'INSERT INTO admin_audit_logs(admin_id,action,entity_type,entity_id,details) VALUES(?,?,?,?,?)',
    [adminId, action, entityType, entityId || null, meta ? JSON.stringify(meta) : null]
  ).catch(() => {});
}

/* -------------------- Dashboard -------------------- */
exports.dashboard = asyncHandler(async (req, res) => {
  const [[users]] = await db.pool.query('SELECT COUNT(*) n FROM users');
  const [[riders]] = await db.pool.query(`SELECT COUNT(*) n FROM users WHERE role='rider'`);
  const [[drivers]] = await db.pool.query(`SELECT COUNT(*) n FROM users WHERE role='driver'`);
  const [[admins]] = await db.pool.query(`SELECT COUNT(*) n FROM users WHERE role='admin'`);
  const [[ridesToday]] = await db.pool.query(`SELECT COUNT(*) n FROM rides WHERE DATE(created_at)=UTC_DATE()`);
  const [[pending]] = await db.pool.query(`SELECT COUNT(*) n FROM driver_profiles WHERE application_status IN ('pending','under_review')`);
  const [[activeRides]] = await db.pool.query(`SELECT COUNT(*) n FROM rides WHERE status IN ('assigned','arriving','arrived','started')`);
  const [[revenue]] = await db.pool.query(`SELECT COALESCE(SUM(final_fare),0) n FROM rides WHERE status='completed' AND DATE(created_at)=UTC_DATE()`);
  ok(res, {
    users: users.n, riders: riders.n, drivers: drivers.n, admins: admins.n,
    todayRides: ridesToday.n, pendingDriverApplications: pending.n,
    activeRides: activeRides.n, todayRevenue: Number(revenue.n)
  });
});

/* -------------------- Riders -------------------- */
exports.riders = asyncHandler(async (req, res) => {
  const rows = await db.query(`
    SELECT u.id, u.full_name fullName, u.phone, u.email, u.status, u.island, u.region, u.district, u.ward,
           u.created_at createdAt, COALESCE(w.balance,0) walletBalance,
           COALESCE(r.total_rides,0) totalRides, COALESCE(r.rating,0) rating
    FROM users u
    LEFT JOIN wallets w ON w.user_id=u.id
    LEFT JOIN rider_profiles r ON r.user_id=u.id
    WHERE u.role='rider'
    ORDER BY u.id DESC LIMIT 1000`);
  ok(res, rows);
});

exports.createRider = asyncHandler(async (req, res) => {
  const b = req.body;
  if (!b.fullName || !b.phone) throw ApiError.badRequest('fullName and phone are required');
  const id = await db.transaction(async (conn) => {
    const [u] = await conn.query(
      'INSERT INTO users(role,full_name,phone,email,island,region,district,ward,status) VALUES(?,?,?,?,?,?,?,?,?)',
      ['rider', b.fullName, b.phone, b.email || null, b.island || null, b.region || null, b.district || b.area || null, b.ward || null, b.status || 'active']
    );
    await conn.query('INSERT INTO rider_profiles(user_id,referral_code) VALUES(?,?)', [u.insertId, `ZG${String(u.insertId).padStart(6, '0')}`]);
    await conn.query('INSERT INTO wallets(user_id) VALUES(?)', [u.insertId]);
    return u.insertId;
  });
  await audit(req.user.sub, 'create_rider', 'user', id, { fullName: b.fullName, phone: b.phone });
  ok(res, { id }, 'Rider created', 201);
});

exports.updateRider = asyncHandler(async (req, res) => {
  const b = req.body;
  const id = req.params.id;
  const existing = await db.query(`SELECT id FROM users WHERE id=? AND role='rider'`, [id]);
  if (!existing.length) throw ApiError.notFound('Rider not found');
  await db.query(
    `UPDATE users SET full_name=COALESCE(?,full_name), phone=COALESCE(?,phone), email=COALESCE(?,email),
     island=COALESCE(?,island), region=COALESCE(?,region), district=COALESCE(?,district), ward=COALESCE(?,ward),
     status=COALESCE(?,status) WHERE id=?`,
    [b.fullName || null, b.phone || null, b.email || null, b.island || null, b.region || null,
     b.district || b.area || null, b.ward || null, b.status || null, id]
  );
  await audit(req.user.sub, 'update_rider', 'user', id, b);
  ok(res, null, 'Rider updated');
});

exports.riderStatus = asyncHandler(async (req, res) => {
  const status = req.body.status;
  if (!['active', 'suspended', 'pending', 'rejected'].includes(status)) throw ApiError.badRequest('Invalid status');
  const r = await db.query(`UPDATE users SET status=? WHERE id=? AND role='rider'`, [status, req.params.id]);
  if (r.affectedRows === 0) throw ApiError.notFound('Rider not found');
  await audit(req.user.sub, 'rider_status', 'user', req.params.id, { status });
  ok(res, null, 'Rider status updated');
});

exports.deleteRider = asyncHandler(async (req, res) => {
  const id = req.params.id;
  const existing = await db.query(`SELECT id FROM users WHERE id=? AND role='rider'`, [id]);
  if (!existing.length) throw ApiError.notFound('Rider not found');
  const reason = (req.body && (req.body.reason || req.body.archiveReason)) || 'Archived by admin';
  const result = await archiveService.archiveUser(id, req.user.sub, reason);
  await audit(req.user.sub, 'archive_rider', 'user', id, { archiveId: result.archiveId, reason });
  ok(res, result, 'Rider archived');
});

/* -------------------- Drivers -------------------- */
exports.drivers = asyncHandler(async (req, res) => {
  const rows = await db.query(`
    SELECT u.id, u.full_name fullName, u.phone, u.email, u.status, u.created_at createdAt,
           d.driver_code driverCode, d.application_status applicationStatus, d.rejection_reason rejectionReason,
           d.online, d.rating, d.total_rides totalRides, d.total_earnings totalEarnings, d.approved_at approvedAt,
           d.national_id nationalId, d.home_address homeAddress,
           v.type vehicleType, v.plate_number plateNumber, v.make, v.model, v.color, v.model_year year
    FROM users u
    JOIN driver_profiles d ON d.user_id=u.id
    LEFT JOIN vehicles v ON v.id = (
      SELECT id FROM vehicles WHERE driver_id = u.id
      ORDER BY (status = 'active') DESC, id DESC LIMIT 1
    )
    WHERE u.role='driver'
    ORDER BY u.id DESC LIMIT 1000`);
  ok(res, rows);
});

exports.driver = asyncHandler(async (req, res) => {
  const u = await db.query(`
    SELECT u.id, u.full_name, u.phone, u.email, u.status, u.photo_url, u.created_at, u.updated_at,
           d.driver_code, d.national_id, d.home_address, d.application_status, d.rejection_reason,
           d.online, d.approved_at, d.rating, d.total_rides, d.total_earnings,
           v.id vehicle_id, v.type vehicleType, v.plate_number plateNumber,
           v.make, v.model, v.color, v.model_year year, v.status vehicleStatus
    FROM users u
    JOIN driver_profiles d ON d.user_id=u.id
    LEFT JOIN vehicles v ON v.id = (
      SELECT id FROM vehicles WHERE driver_id = u.id
      ORDER BY (status = 'active') DESC, id DESC LIMIT 1
    )
    WHERE u.id=? AND u.role='driver'`, [req.params.id]);
  if (!u.length) throw ApiError.notFound('Driver not found');
  const docs = await db.query('SELECT * FROM driver_documents WHERE driver_id=? ORDER BY id DESC', [req.params.id]);
  const vehicles = await db.query(
    'SELECT id, type, plate_number plateNumber, make, model, color, model_year year, status FROM vehicles WHERE driver_id=? ORDER BY id DESC',
    [req.params.id]
  );
  ok(res, { profile: u[0], documents: docs, vehicles });
});

exports.createDriver = asyncHandler(async (req, res) => {
  const b = req.body;
  if (!b.fullName || !b.phone) throw ApiError.badRequest('fullName and phone are required');
  const id = await db.transaction(async (conn) => {
    const userStatus = (b.status === 'active' || b.applicationStatus === 'active') ? 'active' : 'pending';
    const [u] = await conn.query(
      'INSERT INTO users(role,full_name,phone,email,status) VALUES(?,?,?,?,?)',
      ['driver', b.fullName, b.phone, b.email || null, userStatus]
    );
    const code = `ZG-DRV-${String(u.insertId).padStart(6, '0')}`;
    const appStatus = b.status === 'active' || b.applicationStatus === 'active'
      ? 'active'
      : (b.applicationStatus || b.status || 'under_review');
    await conn.query(
      'INSERT INTO driver_profiles(user_id,driver_code,national_id,home_address,application_status) VALUES(?,?,?,?,?)',
      [
        u.insertId,
        code,
        b.nationalId || null,
        b.homeAddress || null,
        appStatus
      ]
    );
    // Always create a vehicle row when admin adds a driver (matches registration fields)
    const plate = b.plateNumber || b.plate || `TMP-${u.insertId}`;
    const make = b.make || b.vehicleMake || b.vehicle || null;
    const model = b.model || b.vehicleModel || null;
    const color = b.color || b.vehicleColor || null;
    const yearRaw = b.year != null ? b.year : b.modelYear;
    const year = yearRaw !== undefined && yearRaw !== null && yearRaw !== '' ? Number(yearRaw) : null;
    await conn.query(
      'INSERT INTO vehicles(driver_id,type,plate_number,make,model,color,model_year,status) VALUES(?,?,?,?,?,?,?,?)',
      [
        u.insertId,
        (b.vehicleType || b.type || 'taxi').toLowerCase(),
        plate,
        make,
        model,
        color,
        Number.isFinite(year) ? year : null,
        'active'
      ]
    );
    return u.insertId;
  });
  await audit(req.user.sub, 'create_driver', 'user', id, { fullName: b.fullName, phone: b.phone });
  ok(res, { id }, 'Driver created', 201);
});

exports.updateDriver = asyncHandler(async (req, res) => {
  const b = req.body;
  const id = req.params.id;
  const existing = await db.query(`SELECT id FROM users WHERE id=? AND role='driver'`, [id]);
  if (!existing.length) throw ApiError.notFound('Driver not found');
  await db.transaction(async (conn) => {
    await conn.query(
      `UPDATE users SET full_name=COALESCE(?,full_name), phone=COALESCE(?,phone), email=COALESCE(?,email),
       status=COALESCE(?,status) WHERE id=?`,
      [b.fullName || null, b.phone || null, b.email || null, b.status || null, id]
    );
    // Profile fields from registration
    if (b.applicationStatus || b.nationalId || b.homeAddress !== undefined) {
      await conn.query(
        `UPDATE driver_profiles SET
           application_status=COALESCE(?,application_status),
           national_id=COALESCE(?,national_id),
           home_address=COALESCE(?,home_address)
         WHERE user_id=?`,
        [b.applicationStatus || null, b.nationalId || null, b.homeAddress !== undefined ? (b.homeAddress || null) : null, id]
      );
    }
    if (b.vehicleType || b.plateNumber || b.plate || b.make || b.vehicleMake || b.vehicle || b.model || b.vehicleModel || b.color || b.vehicleColor || b.year || b.modelYear) {
      const [veh] = await conn.query(
        `SELECT id FROM vehicles WHERE driver_id=? ORDER BY (status='active') DESC, id DESC LIMIT 1`,
        [id]
      );
      const type = (b.vehicleType || b.type || null) ? String(b.vehicleType || b.type).toLowerCase() : null;
      const plate = b.plateNumber || b.plate || null;
      const make = b.make || b.vehicleMake || b.vehicle || null;
      const model = b.model || b.vehicleModel || null;
      const color = b.color || b.vehicleColor || null;
      const year = b.year != null ? b.year : (b.modelYear != null ? b.modelYear : null);
      if (veh.length) {
        await conn.query(
          `UPDATE vehicles SET
             type=COALESCE(?,type), plate_number=COALESCE(?,plate_number),
             make=COALESCE(?,make), model=COALESCE(?,model), color=COALESCE(?,color),
             model_year=COALESCE(?,model_year)
           WHERE id=?`,
          [type, plate, make, model, color, year, veh[0].id]
        );
      } else {
        await conn.query(
          'INSERT INTO vehicles(driver_id,type,plate_number,make,model,color,model_year,status) VALUES(?,?,?,?,?,?,?,?)',
          [id, type || 'taxi', plate || `TMP-${id}`, make, model, color, year, 'active']
        );
      }
    }
  });
  await audit(req.user.sub, 'update_driver', 'user', id, b);
  ok(res, null, 'Driver updated');
});

exports.driverStatus = asyncHandler(async (req, res) => {
  const status = req.body.status;
  const reason = (req.body.reason || req.body.rejectionReason || '').trim();
  const allowed = ['under_review', 'approved', 'active', 'rejected', 'suspended'];
  if (!allowed.includes(status)) throw ApiError.badRequest('Invalid status');
  const id = req.params.id;
  const existing = await db.query(`SELECT id FROM users WHERE id=? AND role='driver'`, [id]);
  if (!existing.length) throw ApiError.notFound('Driver not found');

  if ((status === 'rejected' || status === 'suspended') && !reason) {
    throw ApiError.badRequest('A rejection/suspension reason is required.');
  }

  let appStatus = status;
  let userStatus = 'active';
  if (status === 'rejected' || status === 'suspended') userStatus = 'suspended';
  if (status === 'approved') appStatus = 'active';
  if (status === 'under_review') userStatus = 'pending';
  if (appStatus === 'suspended') appStatus = 'rejected';

  // Persist rejection_reason so the driver can see why they were rejected/suspended.
  // Clear the reason when approving/activating.
  const rejectionReason = (status === 'rejected' || status === 'suspended') ? reason : null;
  const approvedAt = (appStatus === 'active') ? new Date() : null;

  await db.query(
    `UPDATE driver_profiles
     SET application_status=?,
         rejection_reason=?,
         approved_at=COALESCE(?, approved_at),
         online=CASE WHEN ? IN ('rejected','suspended') THEN 0 ELSE online END
     WHERE user_id=?`,
    [appStatus, rejectionReason, approvedAt, status, id]
  );
  await db.query(`UPDATE users SET status=? WHERE id=?`, [userStatus, id]);
  await audit(req.user.sub, 'driver_status', 'user', id, { status, reason: rejectionReason });

  const msg = status === 'rejected' || status === 'suspended'
    ? `Your application was ${status}. Reason: ${reason}`
    : `Your application status is now: ${appStatus}`;
  try { await notifyUser(id, 'Driver application update', msg, { type: 'driver_status', status: appStatus, reason: rejectionReason }); } catch (_) {}
  ok(res, { applicationStatus: appStatus, rejectionReason }, 'Driver status updated');
});

exports.deleteDriver = asyncHandler(async (req, res) => {
  const id = req.params.id;
  const existing = await db.query(`SELECT id FROM users WHERE id=? AND role='driver'`, [id]);
  if (!existing.length) throw ApiError.notFound('Driver not found');
  const reason = (req.body && (req.body.reason || req.body.archiveReason)) || 'Archived by admin';
  const result = await archiveService.archiveUser(id, req.user.sub, reason);
  await audit(req.user.sub, 'archive_driver', 'user', id, { archiveId: result.archiveId, reason });
  ok(res, result, 'Driver archived');
});

exports.documentStatus = asyncHandler(async (req, res) => {
  const status = req.body.status;
  const reason = (req.body.reason || req.body.rejectionReason || '').trim();
  if (!['approved', 'rejected', 'pending'].includes(status)) throw ApiError.badRequest('Invalid status');
  if (status === 'rejected' && !reason) {
    throw ApiError.badRequest('A rejection reason is required when rejecting a document.');
  }
  const rejectionReason = status === 'rejected' ? reason : null;
  const r = await db.query(
    `UPDATE driver_documents
     SET status=?, rejection_reason=?, reviewed_at=UTC_TIMESTAMP(), reviewed_by=?
     WHERE id=?`,
    [status, rejectionReason, req.user.sub, req.params.id]
  );
  if (r.affectedRows === 0) throw ApiError.notFound('Document not found');
  await audit(req.user.sub, 'document_status', 'driver_document', req.params.id, { status, reason: rejectionReason });
  ok(res, { status, rejectionReason }, 'Document status updated');
});

/* -------------------- Admins / Sub-admins -------------------- */
exports.admins = asyncHandler(async (req, res) => {
  const rows = await db.query(`
    SELECT id, full_name fullName, phone, email, status, created_at createdAt, last_login_at lastLoginAt
    FROM users WHERE role='admin' ORDER BY id ASC`);
  ok(res, rows);
});

exports.createAdmin = asyncHandler(async (req, res) => {
  const b = req.body;
  if (!b.fullName || !b.email || !b.password) throw ApiError.badRequest('fullName, email and password are required');
  if (String(b.password).length < 8) throw ApiError.badRequest('Password must be at least 8 characters');
  const hash = await hashPassword(b.password);
  try {
    const [u] = await db.pool.query(
      'INSERT INTO users(role,full_name,phone,email,password_hash,status) VALUES(?,?,?,?,?,?)',
      ['admin', b.fullName, b.phone || null, b.email, hash, b.status || 'active']
    );
    await audit(req.user.sub, 'create_admin', 'user', u.insertId, { email: b.email });
    ok(res, { id: u.insertId }, 'Admin created', 201);
  } catch (e) {
    if (e.code === 'ER_DUP_ENTRY') throw ApiError.conflict('This email or phone is already used by an account with the same role.');
    throw e;
  }
});

exports.updateAdmin = asyncHandler(async (req, res) => {
  const b = req.body;
  const id = req.params.id;
  if (Number(id) === Number(req.user.sub) && b.status && b.status !== 'active') {
    throw ApiError.badRequest('You cannot deactivate your own account');
  }
  const existing = await db.query(`SELECT id FROM users WHERE id=? AND role='admin'`, [id]);
  if (!existing.length) throw ApiError.notFound('Admin not found');
  const fields = [];
  const params = [];
  if (b.fullName) { fields.push('full_name=?'); params.push(b.fullName); }
  if (b.phone !== undefined) { fields.push('phone=?'); params.push(b.phone || null); }
  if (b.email) { fields.push('email=?'); params.push(b.email); }
  if (b.status) { fields.push('status=?'); params.push(b.status); }
  if (b.password && String(b.password).length >= 8) {
    fields.push('password_hash=?');
    params.push(await hashPassword(b.password));
  }
  if (!fields.length) throw ApiError.badRequest('Nothing to update');
  params.push(id);
  await db.query(`UPDATE users SET ${fields.join(',')} WHERE id=?`, params);
  await audit(req.user.sub, 'update_admin', 'user', id, b);
  ok(res, null, 'Admin updated');
});

exports.deleteAdmin = asyncHandler(async (req, res) => {
  const id = req.params.id;
  if (String(id) === String(req.user.sub)) throw ApiError.badRequest('You cannot archive your own admin account.');
  const existing = await db.query(`SELECT id FROM users WHERE id=? AND role='admin'`, [id]);
  if (!existing.length) throw ApiError.notFound('Admin not found');
  const reason = (req.body && (req.body.reason || req.body.archiveReason)) || 'Archived by admin';
  const result = await archiveService.archiveUser(id, req.user.sub, reason);
  await audit(req.user.sub, 'archive_admin', 'user', id, { archiveId: result.archiveId, reason });
  ok(res, result, 'Admin archived');
});

/* -------------------- Rides -------------------- */
exports.rides = asyncHandler(async (req, res) => {
  const rows = await db.query(`
    SELECT r.*, ru.full_name riderName, du.full_name driverName
    FROM rides r
    JOIN users ru ON ru.id=r.rider_id
    LEFT JOIN users du ON du.id=r.driver_id
    ORDER BY r.id DESC LIMIT 1000`);
  ok(res, rows);
});

exports.ride = asyncHandler(async (req, res) => {
  const rows = await db.query(`
    SELECT r.*, ru.full_name riderName, ru.phone riderPhone, du.full_name driverName, du.phone driverPhone
    FROM rides r
    JOIN users ru ON ru.id=r.rider_id
    LEFT JOIN users du ON du.id=r.driver_id
    WHERE r.id=?`, [req.params.id]);
  if (!rows.length) throw ApiError.notFound('Ride not found');
  const events = await db.query('SELECT * FROM ride_events WHERE ride_id=? ORDER BY id', [req.params.id]);
  ok(res, { ride: rows[0], events });
});

/* -------------------- Finance -------------------- */
exports.payments = asyncHandler(async (req, res) => {
  const rows = await db.query(`
    SELECT p.*, u.full_name userName
    FROM payment_transactions p
    JOIN users u ON u.id=p.user_id
    ORDER BY p.id DESC LIMIT 1000`);
  ok(res, rows);
});

exports.completePayment = asyncHandler(async (req, res) => {
  const id = req.params.id;
  const rows = await db.query(`SELECT * FROM payment_transactions WHERE id=?`, [id]);
  if (!rows.length) throw ApiError.notFound('Payment not found');
  if (rows[0].status !== 'pending') throw ApiError.badRequest('Payment is not pending');
  await db.transaction(async (conn) => {
    await conn.query(`UPDATE payment_transactions SET status='success' WHERE id=?`, [id]);
    const [w] = await conn.query(`SELECT balance FROM wallets WHERE user_id=? FOR UPDATE`, [rows[0].user_id]);
    const bal = w.length ? Number(w[0].balance) : 0;
    const after = bal + Number(rows[0].amount);
    if (w.length) await conn.query(`UPDATE wallets SET balance=? WHERE user_id=?`, [after, rows[0].user_id]);
    else await conn.query(`INSERT INTO wallets(user_id,balance) VALUES(?,?)`, [rows[0].user_id, after]);
    await conn.query(
      `INSERT INTO wallet_transactions(user_id,type,amount,balance_before,balance_after,reference_type,reference_id,status,description)
       VALUES(?,?,?,?,?,?,?,?,?)`,
      [rows[0].user_id, 'topup', rows[0].amount, bal, after, 'payment', id, 'success', 'Admin completed payment']
    );
  });
  await audit(req.user.sub, 'complete_payment', 'payment', id);
  ok(res, null, 'Payment completed');
});

exports.payouts = asyncHandler(async (req, res) => {
  const rows = await db.query(`
    SELECT p.*, u.full_name driverName
    FROM payout_requests p
    JOIN users u ON u.id=p.driver_id
    ORDER BY p.id DESC LIMIT 1000`);
  ok(res, rows);
});

exports.payoutStatus = asyncHandler(async (req, res) => {
  const status = req.body.status;
  if (!['approved', 'paid', 'rejected'].includes(status)) throw ApiError.badRequest('Invalid status');
  const r = await db.query(`UPDATE payout_requests SET status=?, processed_at=UTC_TIMESTAMP() WHERE id=?`, [status, req.params.id]);
  if (r.affectedRows === 0) throw ApiError.notFound('Payout not found');
  await audit(req.user.sub, 'payout_status', 'payout', req.params.id, { status });
  ok(res, null, 'Payout status updated');
});

exports.driverFinance = asyncHandler(async (req, res) => {
  const rows = await db.query(`
    SELECT f.*, u.full_name driverName, u.phone
    FROM driver_financials f
    JOIN users u ON u.id=f.driver_id
    ORDER BY f.driver_id`);
  ok(res, rows);
});

exports.settleDriver = asyncHandler(async (req, res) => {
  const id = req.params.id;
  const amount = Number(req.body.amount || 0);
  const rate = Number(req.body.commissionRate || process.env.DRIVER_COMMISSION_PERCENT || 20);
  const commission = +(amount * rate / 100).toFixed(2);
  const paid = +(amount - commission).toFixed(2);
  await db.query(
    `INSERT INTO driver_settlements(driver_id,gross_earnings,commission_rate,commission_amount,paid_amount,status,paid_at)
     VALUES(?,?,?,?,?,'paid',UTC_TIMESTAMP())`,
    [id, amount, rate, commission, paid]
  );
  await audit(req.user.sub, 'settle_driver', 'user', id, { amount, rate, commission, paid });
  ok(res, null, 'Driver settlement recorded');
});

exports.commissions = asyncHandler(async (req, res) => {
  const rows = await db.query(`
    SELECT e.id, e.driver_id driverId, u.full_name driverName, e.ride_id rideId,
           e.gross_amount grossAmount, e.commission_rate commissionRate,
           e.commission_amount commissionAmount, e.driver_amount driverAmount, e.created_at createdAt
    FROM driver_earning_ledger e
    JOIN users u ON u.id=e.driver_id
    ORDER BY e.id DESC LIMIT 1000`);
  ok(res, rows);
});

exports.commissionSettings = asyncHandler(async (req, res) => {
  const settings = await db.query(`SELECT setting_key, setting_value FROM app_settings WHERE setting_key IN ('driver_commission_cycle','driver_commission_percent')`);
  const map = Object.fromEntries(settings.map(s => [s.setting_key, JSON.parse(s.setting_value)]));
  ok(res, {
    cycleLimit: Number(map.driver_commission_cycle || process.env.DRIVER_SETTLEMENT_THRESHOLD_TZS || 60000),
    percent: Number(map.driver_commission_percent || process.env.DRIVER_COMMISSION_PERCENT || 20),
    currency: config.ride?.currency || 'TZS'
  });
});

exports.updateCommissionSettings = asyncHandler(async (req, res) => {
  const cycle = Number(req.body.cycleLimit);
  const percent = Number(req.body.percent);
  if (!Number.isFinite(cycle) || cycle <= 0 || !Number.isFinite(percent) || percent < 0 || percent > 100) {
    throw ApiError.badRequest('Invalid commission settings');
  }
  await db.query(
    `INSERT INTO app_settings(setting_key,setting_value,updated_by) VALUES(?,?,?)
     ON DUPLICATE KEY UPDATE setting_value=VALUES(setting_value),updated_by=VALUES(updated_by),updated_at=UTC_TIMESTAMP()`,
    ['driver_commission_cycle', JSON.stringify(cycle), req.user.sub]
  );
  await db.query(
    `INSERT INTO app_settings(setting_key,setting_value,updated_by) VALUES(?,?,?)
     ON DUPLICATE KEY UPDATE setting_value=VALUES(setting_value),updated_by=VALUES(updated_by),updated_at=UTC_TIMESTAMP()`,
    ['driver_commission_percent', JSON.stringify(percent), req.user.sub]
  );
  await audit(req.user.sub, 'update_commission_settings', 'settings', null, { cycle, percent });
  ok(res, { cycleLimit: cycle, percent }, 'Commission settings saved');
});

/* -------------------- Promos -------------------- */
exports.promos = asyncHandler(async (req, res) => {
  const rows = await db.query(`SELECT * FROM promos ORDER BY id DESC LIMIT 500`);
  ok(res, rows);
});

exports.createPromo = asyncHandler(async (req, res) => {
  const b = req.body;
  if (!b.code) throw ApiError.badRequest('code is required');
  const [r] = await db.pool.query(
    `INSERT INTO promos(code,title,description,discount_type,discount_value,usage_limit,per_user_limit,valid_from,valid_until,applies_to,is_active)
     VALUES(?,?,?,?,?,?,?,?,?,?,?)`,
    [
      b.code, b.title || b.code, b.description || null,
      b.discountType || b.discount_type || 'percent',
      Number(b.discountValue || b.discount_value || 0),
      b.usageLimit || b.usage_limit || null,
      b.perUserLimit || b.per_user_limit || 1,
      b.validFrom || b.valid_from || new Date().toISOString().slice(0, 19).replace('T', ' '),
      b.validUntil || b.valid_until || null,
      b.appliesTo || b.applies_to || 'all',
      b.isActive !== undefined ? (b.isActive ? 1 : 0) : 1
    ]
  );
  await audit(req.user.sub, 'create_promo', 'promo', r.insertId, { code: b.code });
  ok(res, { id: r.insertId }, 'Promotion created', 201);
});

exports.updatePromo = asyncHandler(async (req, res) => {
  const b = req.body;
  const id = req.params.id;
  const existing = await db.query('SELECT id FROM promos WHERE id=?', [id]);
  if (!existing.length) throw ApiError.notFound('Promo not found');
  await db.query(
    `UPDATE promos SET
      code=COALESCE(?,code), title=COALESCE(?,title), description=COALESCE(?,description),
      discount_type=COALESCE(?,discount_type), discount_value=COALESCE(?,discount_value),
      usage_limit=COALESCE(?,usage_limit), valid_from=COALESCE(?,valid_from), valid_until=COALESCE(?,valid_until),
      applies_to=COALESCE(?,applies_to), is_active=COALESCE(?,is_active)
     WHERE id=?`,
    [
      b.code || null, b.title || null, b.description || null,
      b.discountType || b.discount_type || null,
      b.discountValue != null ? Number(b.discountValue) : null,
      b.usageLimit != null ? b.usageLimit : null,
      b.validFrom || b.valid_from || null,
      b.validUntil || b.valid_until || null,
      b.appliesTo || b.applies_to || null,
      b.isActive !== undefined ? (b.isActive ? 1 : 0) : null,
      id
    ]
  );
  await audit(req.user.sub, 'update_promo', 'promo', id, b);
  ok(res, null, 'Promotion updated');
});

exports.deletePromo = asyncHandler(async (req, res) => {
  const r = await db.query('UPDATE promos SET is_active=0 WHERE id=?', [req.params.id]);
  if (r.affectedRows === 0) throw ApiError.notFound('Promo not found');
  await audit(req.user.sub, 'delete_promo', 'promo', req.params.id);
  ok(res, null, 'Promotion deactivated');
});

/* -------------------- Tours -------------------- */
exports.tours = asyncHandler(async (req, res) => {
  const rows = await db.query(`SELECT * FROM tour_packages ORDER BY id DESC LIMIT 500`);
  ok(res, rows);
});

exports.createTour = asyncHandler(async (req, res) => {
  const b = req.body;
  if (!b.name && !b.package) throw ApiError.badRequest('name is required');
  const [r] = await db.pool.query(
    `INSERT INTO tour_packages(name,description,base_price,duration_hours,max_tourists,is_active)
     VALUES(?,?,?,?,?,?)`,
    [
      b.name || b.package, b.description || null,
      Number(b.base_price || b.price || 0),
      Number(b.duration_hours || b.duration || 4),
      Number(b.max_tourists || b.max || 6),
      b.is_active !== undefined ? (b.is_active ? 1 : 0) : 1
    ]
  );
  await audit(req.user.sub, 'create_tour', 'tour_package', r.insertId);
  ok(res, { id: r.insertId }, 'Tour package created', 201);
});

exports.updateTour = asyncHandler(async (req, res) => {
  const b = req.body;
  const id = req.params.id;
  const existing = await db.query('SELECT id FROM tour_packages WHERE id=?', [id]);
  if (!existing.length) throw ApiError.notFound('Tour package not found');
  await db.query(
    `UPDATE tour_packages SET
      name=COALESCE(?,name), description=COALESCE(?,description),
      base_price=COALESCE(?,base_price), duration_hours=COALESCE(?,duration_hours),
      max_tourists=COALESCE(?,max_tourists), is_active=COALESCE(?,is_active)
     WHERE id=?`,
    [
      b.name || b.package || null, b.description || null,
      b.base_price != null || b.price != null ? Number(b.base_price || b.price) : null,
      b.duration_hours != null || b.duration != null ? Number(b.duration_hours || b.duration) : null,
      b.max_tourists != null || b.max != null ? Number(b.max_tourists || b.max) : null,
      b.is_active !== undefined ? (b.is_active ? 1 : 0) : (b.status === 'Active' ? 1 : b.status === 'Paused' ? 0 : null),
      id
    ]
  );
  await audit(req.user.sub, 'update_tour', 'tour_package', id, b);
  ok(res, null, 'Tour package updated');
});

exports.deleteTour = asyncHandler(async (req, res) => {
  const r = await db.query('UPDATE tour_packages SET is_active=0 WHERE id=?', [req.params.id]);
  if (r.affectedRows === 0) throw ApiError.notFound('Tour package not found');
  await audit(req.user.sub, 'delete_tour', 'tour_package', req.params.id);
  ok(res, null, 'Tour package deactivated');
});

/* -------------------- Parcels -------------------- */
exports.parcels = asyncHandler(async (req, res) => {
  const rows = await db.query(`
    SELECT p.*, ru.full_name riderName, du.full_name driverName
    FROM parcels p
    JOIN users ru ON ru.id=p.rider_id
    LEFT JOIN users du ON du.id=p.driver_id
    ORDER BY p.id DESC LIMIT 1000`);
  ok(res, rows);
});

/* -------------------- Notifications -------------------- */
exports.notifications = asyncHandler(async (req, res) => {
  const rows = await db.query(`
    SELECT n.*, u.full_name userName
    FROM notifications n
    LEFT JOIN users u ON u.id=n.user_id
    ORDER BY n.id DESC LIMIT 500`);
  ok(res, rows);
});

exports.markNotificationRead = asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) throw ApiError.badRequest('Invalid notification id');
  await db.query('UPDATE notifications SET read_at=COALESCE(read_at, UTC_TIMESTAMP()) WHERE id=?', [id]);
  await audit(req.user.sub, 'mark_notification_read', 'notification', id);
  ok(res, { id, readAt: new Date().toISOString() }, 'Notification marked as read');
});

exports.sendNotification = asyncHandler(async (req, res) => {
  const b = req.body;
  if (!b.title || !b.body) throw ApiError.badRequest('title and body are required');
  if (!b.userId) throw ApiError.badRequest('userId is required');
  const [r] = await db.pool.query(
    `INSERT INTO notifications(user_id,type,title,body,data) VALUES(?,?,?,?,?)`,
    [b.userId, b.type || 'admin', b.title, b.body, b.data ? JSON.stringify(b.data) : null]
  );
  try { await notifyUser(b.userId, b.title, b.body, { type: b.type || 'admin' }); } catch (_) {}
  await audit(req.user.sub, 'send_notification', 'notification', r.insertId);
  ok(res, { id: r.insertId }, 'Notification sent', 201);
});

/* -------------------- Conversations -------------------- */
exports.conversations = asyncHandler(async (req, res) => {
  const rows = await db.query(`
    SELECT c.*, COUNT(cm.id) messageCount
    FROM conversations c
    LEFT JOIN messages cm ON cm.conversation_id=c.id
    GROUP BY c.id
    ORDER BY c.updated_at DESC LIMIT 500`);
  ok(res, rows);
});

/* -------------------- Settings & Audit -------------------- */
exports.settings = asyncHandler(async (req, res) => {
  const rows = await db.query('SELECT setting_key, setting_value, updated_at FROM app_settings ORDER BY setting_key');
  const map = {};
  for (const r of rows) {
    try { map[r.setting_key] = JSON.parse(r.setting_value); } catch { map[r.setting_key] = r.setting_value; }
  }
  ok(res, map);
});

exports.updateSetting = asyncHandler(async (req, res) => {
  const key = req.params.key;
  const value = req.body.value !== undefined ? req.body.value : req.body;
  await db.query(
    `INSERT INTO app_settings(setting_key,setting_value,updated_by) VALUES(?,?,?)
     ON DUPLICATE KEY UPDATE setting_value=VALUES(setting_value),updated_by=VALUES(updated_by),updated_at=UTC_TIMESTAMP()`,
    [key, JSON.stringify(value), req.user.sub]
  );
  await audit(req.user.sub, 'update_setting', 'settings', null, { key, value });
  ok(res, null, 'Setting updated');
});

exports.audit = asyncHandler(async (req, res) => {
  const rows = await db.query(`
    SELECT a.*, u.full_name adminName
    FROM admin_audit_logs a
    LEFT JOIN users u ON u.id=a.admin_id
    ORDER BY a.id DESC LIMIT 1000`);
  ok(res, rows);
});


/* -------------------- Archive -------------------- */
exports.archives = asyncHandler(async (req, res) => {
  const rows = await archiveService.listArchives({ role: req.query.role || null, limit: req.query.limit });
  ok(res, rows);
});

exports.archive = asyncHandler(async (req, res) => {
  const row = await archiveService.getArchive(req.params.id);
  // Do not dump full snapshot to list clients unless detail requested
  ok(res, row);
});

exports.restoreArchive = asyncHandler(async (req, res) => {
  const result = await archiveService.restoreUser(req.params.id);
  await audit(req.user.sub, 'restore_user', 'user_archive', req.params.id, result);
  ok(res, result, 'User restored from archive');
});

exports.permanentDeleteArchive = asyncHandler(async (req, res) => {
  const result = await archiveService.permanentDelete(req.params.id);
  await audit(req.user.sub, 'permanent_delete_user', 'user_archive', req.params.id, result);
  ok(res, result, 'Archived user permanently deleted');
});

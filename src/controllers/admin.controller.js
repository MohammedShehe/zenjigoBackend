const db = require('../config/db');
const config = require('../config/env');
const { hashPassword } = require('../utils/hash');
const ApiError = require('../utils/ApiError');
const archiveService = require('../services/archive.service');
const { normalizePhone } = require('../utils/phone');
const { ok } = require('../utils/response');
const asyncHandler = require('../utils/asyncHandler');
const { notifyUser } = require('../services/notification.service');
const chatService = require('../services/chat.service');

function audit(adminId, action, entityType, entityId, meta = null) {
  return db.query(
    'INSERT INTO admin_audit_logs(admin_id,action,entity_type,entity_id,details) VALUES(?,?,?,?,?)',
    [adminId, action, entityType, entityId || null, meta ? JSON.stringify(meta) : null]
  ).catch(() => {});
}

function assertStrongPassword(p) {
  const v = String(p || '');
  if (v.length < 10 || !/[a-z]/.test(v) || !/[A-Z]/.test(v) || !/\d/.test(v)) {
    throw ApiError.badRequest('Password must be at least 10 characters and include upper and lower case letters and a number.');
  }
}

async function withDup(promise) {
  try { return await promise; } catch (e) {
    if (e && e.code === 'ER_DUP_ENTRY') {
      const m = /for key '([^']+)'/.exec(e.sqlMessage || '') || [];
      const what = /plate/.test(m[1] || '') ? 'plate number' : /email/.test(m[1] || '') ? 'email address' : /phone/.test(m[1] || '') ? 'phone number' : 'value';
      throw ApiError.conflict(`That ${what} is already registered.`);
    }
    throw e;
  }
}

/* -------------------- Dashboard -------------------- */
exports.dashboard = asyncHandler(async (req, res) => {
  const one = async (sql, params = []) => { const [[r]] = await db.pool.query(sql, params); return r || {}; };
  const safe = async (fn, fallback) => { try { return await fn(); } catch (_) { return fallback; } };

  const users = await one('SELECT COUNT(*) n FROM users');
  const riders = await one(`SELECT COUNT(*) n FROM users WHERE role='rider'`);
  const drivers = await one(`SELECT COUNT(*) n FROM users WHERE role='driver'`);
  const admins = await one(`SELECT COUNT(*) n FROM users WHERE role='admin'`);
  const ridesToday = await one(`SELECT COUNT(*) n FROM rides WHERE DATE(created_at)=UTC_DATE()`);
  const pending = await one(`SELECT COUNT(*) n FROM driver_profiles WHERE application_status IN ('pending','under_review')`);
  const activeRides = await one(`SELECT COUNT(*) n FROM rides WHERE status IN ('searching','accepted','arriving','arrived','started')`);
  const revenue = await one(`SELECT COALESCE(SUM(final_fare),0) n FROM rides WHERE status='completed' AND DATE(created_at)=UTC_DATE()`);
  const onlineDrivers = await one(`SELECT COUNT(*) n FROM driver_profiles WHERE online=1 AND application_status='active'`);
  const pendingDocuments = await one(`SELECT COUNT(*) n FROM driver_documents WHERE status='pending' AND url NOT LIKE 'pending-upload://%'`);
  const pendingPayouts = await one(`SELECT COUNT(*) n, COALESCE(SUM(amount),0) total FROM payout_requests WHERE status='pending'`);
  const pendingPayments = await one(`SELECT COUNT(*) n FROM payment_transactions WHERE status='pending'`);
  const pendingParcels = await one(`SELECT COUNT(*) n FROM parcels WHERE status='pending'`);
  const pendingTours = await safe(() => one(`SELECT COUNT(*) n FROM tour_bookings WHERE status='pending'`), { n: 0 });
  const pendingChangeRequests = await safe(() => one(`SELECT COUNT(*) n FROM driver_change_requests WHERE status='pending'`), { n: 0 });
  const openReports = await safe(() => one(`SELECT COUNT(*) n FROM driver_reports WHERE status='open'`), { n: 0 });
  const blockedDrivers = await safe(() => one(`SELECT COUNT(*) n FROM driver_financials WHERE blocked=1`), { n: 0 });
  const commissionOwed = await safe(() => one(`SELECT COALESCE(SUM(commission_owed),0) n FROM driver_financials`), { n: 0 });
  const expiringDocs = await one(`
    SELECT COUNT(*) n FROM driver_documents dd
    WHERE dd.expires_at IS NOT NULL AND dd.expires_at <= DATE_ADD(UTC_DATE(), INTERVAL 30 DAY)
      AND dd.status IN ('approved','pending')
      AND NOT EXISTS (SELECT 1 FROM driver_documents n2 WHERE n2.driver_id=dd.driver_id AND n2.document_type=dd.document_type AND n2.id>dd.id AND n2.status IN ('approved','pending'))`);
  const unreadSupport = await safe(async () => {
    const r = await chatService.adminList(req.user.sub);
    return r.filter((c) => c.type === 'support').reduce((a, c) => a + Number(c.unreadCount || 0), 0);
  }, 0);
  const trend = await db.query(`
    SELECT DATE_FORMAT(d.day,'%Y-%m-%d') day,
           COALESCE(x.rides,0) rides, COALESCE(x.completed,0) completed,
           COALESCE(x.cancelled,0) cancelled, COALESCE(x.revenue,0) revenue
    FROM (
      SELECT DATE_SUB(UTC_DATE(), INTERVAL n DAY) day FROM (
        SELECT 0 n UNION SELECT 1 UNION SELECT 2 UNION SELECT 3 UNION SELECT 4 UNION SELECT 5 UNION SELECT 6
        UNION SELECT 7 UNION SELECT 8 UNION SELECT 9 UNION SELECT 10 UNION SELECT 11 UNION SELECT 12 UNION SELECT 13
      ) t
    ) d
    LEFT JOIN (
      SELECT DATE(created_at) day, COUNT(*) rides,
             SUM(status='completed') completed, SUM(status='cancelled') cancelled,
             SUM(CASE WHEN status='completed' THEN COALESCE(final_fare,0) ELSE 0 END) revenue
      FROM rides WHERE created_at >= DATE_SUB(UTC_DATE(), INTERVAL 13 DAY) GROUP BY DATE(created_at)
    ) x ON x.day = d.day
    ORDER BY d.day ASC`);
  const byStatus = await db.query(`SELECT status, COUNT(*) n FROM rides WHERE created_at >= DATE_SUB(UTC_DATE(), INTERVAL 30 DAY) GROUP BY status`);
  const byType = await db.query(`SELECT ride_type type, COUNT(*) n FROM rides WHERE created_at >= DATE_SUB(UTC_DATE(), INTERVAL 30 DAY) GROUP BY ride_type`);
  const monthRevenue = await one(`SELECT COALESCE(SUM(final_fare),0) n FROM rides WHERE status='completed' AND created_at >= DATE_SUB(UTC_DATE(), INTERVAL 30 DAY)`);
  const monthCommission = await safe(() => one(`SELECT COALESCE(SUM(commission_amount),0) n FROM driver_earning_ledger WHERE created_at >= DATE_SUB(UTC_DATE(), INTERVAL 30 DAY)`), { n: 0 });

  ok(res, {
    users: users.n, riders: riders.n, drivers: drivers.n, admins: admins.n,
    todayRides: ridesToday.n, pendingDriverApplications: pending.n,
    activeRides: activeRides.n, todayRevenue: Number(revenue.n),
    onlineDrivers: onlineDrivers.n,
    queues: {
      driverApplications: pending.n,
      documents: pendingDocuments.n,
      changeRequests: pendingChangeRequests.n,
      payouts: pendingPayouts.n,
      payoutsAmount: Number(pendingPayouts.total || 0),
      payments: pendingPayments.n,
      parcels: pendingParcels.n,
      tourBookings: pendingTours.n,
      reports: openReports.n,
      supportUnread: unreadSupport,
      expiringDocuments: expiringDocs.n,
      blockedDrivers: blockedDrivers.n
    },
    finance: {
      revenue30d: Number(monthRevenue.n),
      commission30d: Number(monthCommission.n),
      commissionOutstanding: Number(commissionOwed.n)
    },
    trend: trend.map((t) => ({ day: t.day, rides: Number(t.rides), completed: Number(t.completed), cancelled: Number(t.cancelled), revenue: Number(t.revenue) })),
    ridesByStatus: byStatus.map((r) => ({ status: r.status, count: Number(r.n) })),
    ridesByType: byType.map((r) => ({ type: r.type, count: Number(r.n) }))
  });
});

/* -------------------- Riders -------------------- */
exports.riders = asyncHandler(async (req, res) => {
  const rows = await db.query(`
    SELECT u.id, u.full_name fullName, u.phone, u.email, u.status, u.island, u.region, u.district, u.ward,
           u.created_at createdAt, COALESCE(w.balance,0) walletBalance,
           COALESCE(r.total_rides,0) totalRides, COALESCE(r.rating,0) rating,
           COALESCE(r.cancellation_debt,0) cancellationDebt, r.referral_code referralCode,
           u.photo_url photoUrl, u.last_login_at lastLoginAt
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
  b.phone = normalizePhone(b.phone);
  const id = await withDup(db.transaction(async (conn) => {
    const [u] = await conn.query(
      'INSERT INTO users(role,full_name,phone,email,island,region,district,ward,status) VALUES(?,?,?,?,?,?,?,?,?)',
      ['rider', b.fullName, b.phone, b.email || null, b.island || null, b.region || null, b.district || b.area || null, b.ward || null, b.status || 'active']
    );
    await conn.query('INSERT INTO rider_profiles(user_id,referral_code) VALUES(?,?)', [u.insertId, `ZG${String(u.insertId).padStart(6, '0')}`]);
    await conn.query('INSERT INTO wallets(user_id) VALUES(?)', [u.insertId]);
    return u.insertId;
  }));
  await audit(req.user.sub, 'create_rider', 'user', id, { fullName: b.fullName, phone: b.phone });
  ok(res, { id }, 'Rider created', 201);
});

exports.updateRider = asyncHandler(async (req, res) => {
  const b = req.body;
  const id = req.params.id;
  const existing = await db.query(`SELECT id FROM users WHERE id=? AND role='rider'`, [id]);
  if (!existing.length) throw ApiError.notFound('Rider not found');
  if (b.phone) b.phone = normalizePhone(b.phone);
  await withDup(db.query(
    `UPDATE users SET full_name=COALESCE(?,full_name), phone=COALESCE(?,phone), email=COALESCE(?,email),
     island=COALESCE(?,island), region=COALESCE(?,region), district=COALESCE(?,district), ward=COALESCE(?,ward),
     status=COALESCE(?,status) WHERE id=?`,
    [b.fullName || null, b.phone || null, b.email || null, b.island || null, b.region || null,
     b.district || b.area || null, b.ward || null, b.status || null, id]
  ));
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
           v.type vehicleType, v.plate_number plateNumber, v.make, v.model, v.color, v.model_year year,
           (
             SELECT MIN(dd.expires_at) FROM driver_documents dd
             WHERE dd.driver_id = u.id AND dd.expires_at IS NOT NULL
               AND dd.status IN ('approved','pending')
               AND NOT EXISTS (SELECT 1 FROM driver_documents n2 WHERE n2.driver_id=dd.driver_id AND n2.document_type=dd.document_type AND n2.id>dd.id AND n2.status IN ('approved','pending'))
           ) nearestDocExpiry,
           (
             SELECT COUNT(*) FROM driver_documents dd
             WHERE dd.driver_id = u.id AND dd.expires_at IS NOT NULL
               AND dd.expires_at < UTC_DATE()
               AND dd.status IN ('approved','pending')
               AND NOT EXISTS (SELECT 1 FROM driver_documents n2 WHERE n2.driver_id=dd.driver_id AND n2.document_type=dd.document_type AND n2.id>dd.id AND n2.status IN ('approved','pending'))
           ) expiredDocsCount,
           (
             SELECT COUNT(*) FROM driver_documents dd
             WHERE dd.driver_id = u.id AND dd.expires_at IS NOT NULL
               AND dd.expires_at BETWEEN UTC_DATE() AND DATE_ADD(UTC_DATE(), INTERVAL 30 DAY)
               AND dd.status IN ('approved','pending')
               AND NOT EXISTS (SELECT 1 FROM driver_documents n2 WHERE n2.driver_id=dd.driver_id AND n2.document_type=dd.document_type AND n2.id>dd.id AND n2.status IN ('approved','pending'))
           ) expiringSoonCount,
           (SELECT COUNT(*) FROM driver_documents dd WHERE dd.driver_id=u.id AND dd.status='pending' AND dd.url NOT LIKE 'pending-upload://%') pendingDocsCount,
           COALESCE(f.commission_owed,0) commissionOwed, COALESCE(f.blocked,0) financeBlocked,
           u.photo_url photoUrl
    FROM users u
    JOIN driver_profiles d ON d.user_id=u.id
    LEFT JOIN driver_financials f ON f.driver_id=u.id
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
    SELECT u.id, u.full_name, u.phone, u.email, u.status, u.photo_url, u.created_at, u.updated_at, u.last_login_at,
           d.driver_code, d.national_id, d.home_address, d.application_status, d.rejection_reason,
           d.online, d.approved_at, d.rating, d.total_rides, d.total_earnings,
           d.current_lat, d.current_lng, d.location_updated_at,
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
  const id = req.params.id;
  const docs = await db.query(
    `SELECT dd.*, a.full_name verifiedByName FROM driver_documents dd
     LEFT JOIN users a ON a.id = dd.verified_by
     WHERE dd.driver_id=? ORDER BY dd.id DESC`, [id]);
  const vehicles = await db.query(
    'SELECT id, type, plate_number plateNumber, make, model, color, model_year year, status FROM vehicles WHERE driver_id=? ORDER BY id DESC',
    [id]
  );
  const safe = async (fn, fb) => { try { return await fn(); } catch (_) { return fb; } };
  const financials = await safe(async () => (await db.query('SELECT * FROM driver_financials WHERE driver_id=?', [id]))[0] || null, null);
  const recentRides = await db.query(
    `SELECT r.id, r.ride_code, r.ride_type, r.status, r.pickup_address, r.destination_address, r.final_fare, r.estimated_fare, r.created_at, ru.full_name riderName
     FROM rides r JOIN users ru ON ru.id=r.rider_id WHERE r.driver_id=? ORDER BY r.id DESC LIMIT 15`, [id]);
  const payouts = await db.query('SELECT id, amount, method, status, admin_note, created_at, processed_at FROM payout_requests WHERE driver_id=? ORDER BY id DESC LIMIT 10', [id]);
  const settlements = await safe(() => db.query('SELECT id, gross_earnings, commission_rate, commission_amount, paid_amount, status, provider, external_reference, created_at, paid_at FROM driver_settlements WHERE driver_id=? ORDER BY id DESC LIMIT 10', [id]), []);
  const reviews = await safe(() => db.query(
    `SELECT rt.id, rt.stars, rt.feedback, rt.created_at, fu.full_name riderName FROM ratings rt
     LEFT JOIN users fu ON fu.id=rt.from_user_id WHERE rt.to_user_id=? ORDER BY rt.id DESC LIMIT 10`, [id]), []);
  const changeRequests = await safe(() => db.query('SELECT * FROM driver_change_requests WHERE driver_id=? ORDER BY id DESC LIMIT 20', [id]), []);
  const reports = await safe(() => db.query(
    `SELECT r.id, r.reason, r.details, r.status, r.created_at, rp.full_name reporterName FROM driver_reports r
     LEFT JOIN users rp ON rp.id=r.reporter_id WHERE r.driver_id=? ORDER BY r.id DESC LIMIT 10`, [id]), []);
  const stats = (await db.query(
    `SELECT COUNT(*) total, SUM(status='completed') completed, SUM(status='cancelled') cancelled FROM rides WHERE driver_id=?`, [id]))[0] || {};
  ok(res, { profile: u[0], documents: docs, vehicles, financials, recentRides, payouts, settlements, reviews, changeRequests, reports, stats });
});

exports.createDriver = asyncHandler(async (req, res) => {
  const b = req.body;
  if (!b.fullName || !b.phone) throw ApiError.badRequest('fullName and phone are required');
  b.phone = normalizePhone(b.phone);
  const id = await withDup(db.transaction(async (conn) => {
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

    // Optional document metadata (files uploaded later via driver detail / upload API)
    const docEntries = [];
    if (b.licenseNumber || b.licenseExpiresAt) {
      docEntries.push(['drivers_license', b.licenseNumber || null, b.licenseExpiresAt || null]);
    }
    if (b.nationalId || b.nationalIdExpiresAt) {
      docEntries.push(['national_id', b.nationalId || null, b.nationalIdExpiresAt || null]);
    }
    if (b.insuranceNumber || b.insuranceExpiresAt) {
      docEntries.push(['insurance', b.insuranceNumber || null, b.insuranceExpiresAt || null]);
    }
    for (const [dtype, ref, exp] of docEntries) {
      await conn.query(
        `INSERT INTO driver_documents(driver_id, document_type, url, status, expires_at)
         VALUES(?,?,?,?,?)`,
        [u.insertId, dtype, 'pending-upload://' + (ref || dtype), 'pending', exp || null]
      ).catch(() => {});
    }

    return u.insertId;
  }));
  await audit(req.user.sub, 'create_driver', 'user', id, { fullName: b.fullName, phone: b.phone });
  ok(res, { id }, 'Driver created', 201);
});

exports.updateDriver = asyncHandler(async (req, res) => {
  const b = req.body;
  const id = req.params.id;
  const existing = await db.query(`SELECT id FROM users WHERE id=? AND role='driver'`, [id]);
  if (!existing.length) throw ApiError.notFound('Driver not found');
  if (b.phone) b.phone = normalizePhone(b.phone);
  await withDup(db.transaction(async (conn) => {
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
  }));
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
  try {
    const titles = {
      active: 'You are approved!',
      approved: 'You are approved!',
      rejected: 'Application rejected',
      suspended: 'Account suspended',
      under_review: 'Under review'
    };
    await notifyUser(
      id,
      titles[status] || 'Driver application update',
      msg,
      'driver_status',
      { type: 'driver_status', status: appStatus, reason: rejectionReason || '' }
    );
  } catch (_) {}
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
     SET status=?, rejection_reason=?, verified_at=UTC_TIMESTAMP(), verified_by=?
     WHERE id=?`,
    [status, rejectionReason, req.user.sub, req.params.id]
  );
  if (r.affectedRows === 0) throw ApiError.notFound('Document not found');
  await audit(req.user.sub, 'document_status', 'driver_document', req.params.id, { status, reason: rejectionReason });
  // Notify the driver who owns this document
  try {
    const docs = await db.query('SELECT driver_id, document_type FROM driver_documents WHERE id=?', [req.params.id]);
    if (docs.length) {
      const body = status === 'approved'
        ? `Your ${String(docs[0].document_type || 'document').replace(/_/g, ' ')} was approved.`
        : status === 'rejected'
          ? `Your ${String(docs[0].document_type || 'document').replace(/_/g, ' ')} was rejected. ${rejectionReason || ''}`.trim()
          : `Your ${String(docs[0].document_type || 'document').replace(/_/g, ' ')} is pending review.`;
      await notifyUser(
        docs[0].driver_id,
        status === 'approved' ? 'Document approved' : status === 'rejected' ? 'Document rejected' : 'Document update',
        body,
        'document_status',
        { type: 'document_status', documentId: String(req.params.id), status }
      );
    }
  } catch (_) {}
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
  assertStrongPassword(b.password);
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
  if (b.password) {
    assertStrongPassword(b.password);
    fields.push('password_hash=?');
    params.push(await hashPassword(b.password));
  }
  if (!fields.length) throw ApiError.badRequest('Nothing to update');
  params.push(id);
  await db.query(`UPDATE users SET ${fields.join(',')} WHERE id=?`, params);
  await audit(req.user.sub, 'update_admin', 'user', id, { ...b, password: b.password ? '[changed]' : undefined });
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
  // Same locked, idempotent path the provider webhook uses, so a webhook arriving at the
  // same moment can never credit the wallet twice.
  await require('../services/payment.service').completeWalletTopup(id, null, 'admin');
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
  const note = String(req.body.note || req.body.adminNote || '').trim().slice(0, 500) || null;
  if (!['approved', 'paid', 'rejected'].includes(status)) throw ApiError.badRequest('Invalid status');
  if (status === 'rejected' && !note) throw ApiError.badRequest('A reason is required when rejecting a payout.');
  const rows = await db.query('SELECT id, driver_id, amount, status FROM payout_requests WHERE id=?', [req.params.id]);
  if (!rows.length) throw ApiError.notFound('Payout not found');
  const cur = rows[0].status;
  const allowed = { pending: ['approved', 'rejected', 'paid'], approved: ['paid', 'rejected'], paid: [], rejected: [] };
  if (!(allowed[cur] || []).includes(status)) throw ApiError.badRequest(`A ${cur} payout cannot be changed to ${status}.`);
  await db.query(
    `UPDATE payout_requests SET status=?, admin_note=COALESCE(?,admin_note), processed_by=?, processed_at=UTC_TIMESTAMP() WHERE id=?`,
    [status, note, req.user.sub, req.params.id]
  );
  await audit(req.user.sub, 'payout_status', 'payout', req.params.id, { status, note });
  try {
    const titles = { approved: 'Payout approved', paid: 'Payout sent', rejected: 'Payout rejected' };
    await notifyUser(rows[0].driver_id, titles[status], `Your payout request of TZS ${Number(rows[0].amount).toLocaleString()} was ${status}.${note ? ' ' + note : ''}`, 'payout_status', { type: 'payout_status', payoutId: String(req.params.id), status });
  } catch (_) {}
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

/**
 * Admin records an off-platform (cash/bank) commission payment for a driver.
 * Goes through the same settlement path as provider payments, so commission_owed
 * and the driver's restriction are updated consistently. Only settles commission
 * that is actually owed.
 */
exports.settleDriver = asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  const finance = require('../services/driver_finance.service');
  const result = await finance.adminSettle(id, req.user.sub, {
    reference: req.body.reference || null,
    note: req.body.note || null,
    force: Boolean(req.body.force)
  });
  await audit(req.user.sub, 'settle_driver', 'user', id, {
    settlementId: result.settlement && result.settlement.id,
    amount: result.settlement && result.settlement.paidAmount,
    reference: req.body.reference || null
  });
  ok(res, result, 'Driver settlement recorded');
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

/* -------------------- Ride fare / charges (admin-editable) -------------------- */
exports.fareSettings = asyncHandler(async (req, res) => {
  const rideService = require('../services/ride.service');
  const cfg = await rideService.getFareConfig();
  ok(res, cfg);
});

exports.updateFareSettings = asyncHandler(async (req, res) => {
  const b = req.body || {};
  const baseFare = Number(b.baseFare);
  const perKm = Number(b.perKm);
  const perMinute = Number(b.perMinute);
  const bookingFee = Number(b.bookingFee);
  if (![baseFare, perKm, perMinute, bookingFee].every((n) => Number.isFinite(n) && n >= 0)) {
    throw ApiError.badRequest('baseFare, perKm, perMinute and bookingFee must be non-negative numbers');
  }
  const multipliers = {
    boda: Number(b.multipliers?.boda ?? b.bodaMultiplier ?? 1),
    bajaji: Number(b.multipliers?.bajaji ?? b.bajajiMultiplier ?? 1.15),
    taxi: Number(b.multipliers?.taxi ?? b.taxiMultiplier ?? 1.5)
  };
  if (Object.values(multipliers).some((m) => !Number.isFinite(m) || m <= 0)) {
    throw ApiError.badRequest('Vehicle multipliers must be positive numbers');
  }
  const value = {
    baseFare,
    perKm,
    perMinute,
    bookingFee,
    multipliers,
    currency: (b.currency || config.ride?.currency || 'TZS').toString()
  };
  await db.query(
    `INSERT INTO app_settings(setting_key,setting_value,updated_by) VALUES(?,?,?)
     ON DUPLICATE KEY UPDATE setting_value=VALUES(setting_value),updated_by=VALUES(updated_by),updated_at=UTC_TIMESTAMP()`,
    ['ride_fares', JSON.stringify(value), req.user.sub]
  );
  await audit(req.user.sub, 'update_fare_settings', 'settings', null, value);
  ok(res, value, 'Fare settings saved. New quotes will use these values immediately.');
});

/* -------------------- Rider cancellation policy (admin-editable) -------------------- */
exports.cancelSettings = asyncHandler(async (req, res) => {
  const rideService = require('../services/ride.service');
  const cfg = await rideService.getCancelConfig();
  ok(res, cfg);
});

exports.updateCancelSettings = asyncHandler(async (req, res) => {
  const b = req.body || {};
  const nearPickupKm = Number(b.nearPickupKm);
  const percent = Number(b.percent);
  if (!Number.isFinite(nearPickupKm) || nearPickupKm < 0) {
    throw ApiError.badRequest('nearPickupKm must be a non-negative number');
  }
  if (!Number.isFinite(percent) || percent < 0 || percent > 100) {
    throw ApiError.badRequest('percent must be between 0 and 100');
  }
  const value = { nearPickupKm, percent };
  await db.query(
    `INSERT INTO app_settings(setting_key,setting_value,updated_by) VALUES(?,?,?)
     ON DUPLICATE KEY UPDATE setting_value=VALUES(setting_value),updated_by=VALUES(updated_by),updated_at=UTC_TIMESTAMP()`,
    ['rider_cancellation', JSON.stringify(value), req.user.sub]
  );
  // Remove legacy duplicate key if present
  await db.query(`DELETE FROM app_settings WHERE setting_key = 'rider_cancellation_fee'`);
  await audit(req.user.sub, 'update_cancel_settings', 'settings', null, value);
  ok(res, value, 'Cancellation policy saved. Applies to new cancels immediately.');
});


/* -------------------- Promos -------------------- */
exports.promos = asyncHandler(async (req, res) => {
  const rows = await db.query(`SELECT * FROM promos ORDER BY id DESC LIMIT 500`);
  ok(res, rows);
});

function promoInput(b, partial) {
  const o = {};
  const type = b.discountType || b.discount_type;
  if (type !== undefined && !['percent', 'fixed'].includes(type)) throw ApiError.badRequest('discountType must be percent or fixed');
  const val = b.discountValue ?? b.discount_value;
  if (val !== undefined && val !== null && val !== '') {
    const n = Number(val);
    if (!Number.isFinite(n) || n <= 0) throw ApiError.badRequest('discountValue must be greater than 0');
    if ((type || b.__type) === 'percent' && n > 100) throw ApiError.badRequest('A percentage discount cannot exceed 100');
    o.discountValue = n;
  } else if (!partial) throw ApiError.badRequest('discountValue is required');
  const from = b.validFrom || b.valid_from, until = b.validUntil || b.valid_until;
  if (from && until && new Date(String(until).replace(' ', 'T')) <= new Date(String(from).replace(' ', 'T'))) {
    throw ApiError.badRequest('End date must be after the start date');
  }
  return o;
}

exports.createPromo = asyncHandler(async (req, res) => {
  const b = req.body;
  if (!b.code || !/^[A-Za-z0-9_-]{3,40}$/.test(String(b.code).trim())) throw ApiError.badRequest('Code must be 3-40 letters, numbers, - or _');
  const code = String(b.code).trim().toUpperCase();
  const { discountValue } = promoInput(b, false);
  if (!(b.validUntil || b.valid_until)) throw ApiError.badRequest('validUntil is required');
  let r;
  try {
    [r] = await db.pool.query(
      `INSERT INTO promos(code,title,description,discount_type,discount_value,max_discount,usage_limit,per_user_limit,valid_from,valid_until,applies_to,is_active,created_by)
       VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        code, b.title || code, b.description || null,
        b.discountType || b.discount_type || 'percent',
        discountValue,
        b.maxDiscount != null && b.maxDiscount !== '' ? Number(b.maxDiscount) : null,
        b.usageLimit || b.usage_limit || null,
        b.perUserLimit || b.per_user_limit || 1,
        b.validFrom || b.valid_from || new Date().toISOString().slice(0, 19).replace('T', ' '),
        b.validUntil || b.valid_until,
        b.appliesTo || b.applies_to || 'all',
        b.isActive !== undefined ? (b.isActive ? 1 : 0) : 1,
        req.user.sub
      ]
    );
  } catch (e) {
    if (e.code === 'ER_DUP_ENTRY') throw ApiError.conflict('A promotion with this code already exists.');
    throw e;
  }
  await audit(req.user.sub, 'create_promo', 'promo', r.insertId, { code });
  try {
    if (b.notifyRiders !== false) {
      const { notifyMany, allRiderIds } = require('../services/notification.service');
      const riders = await allRiderIds();
      await notifyMany(
        riders,
        'Special offer',
        b.title || `Promo ${code} is live — save on your next ride.`,
        'promo',
        { type: 'promo', code }
      );
    }
  } catch (_) {}
  ok(res, { id: r.insertId }, 'Promotion created', 201);
});

exports.updatePromo = asyncHandler(async (req, res) => {
  const b = req.body;
  const id = req.params.id;
  const existing = await db.query('SELECT id, discount_type FROM promos WHERE id=?', [id]);
  if (!existing.length) throw ApiError.notFound('Promo not found');
  b.__type = b.discountType || b.discount_type || existing[0].discount_type;
  promoInput(b, true);
  const maxDisc = b.maxDiscount === undefined ? undefined : (b.maxDiscount === null || b.maxDiscount === '' ? 0 : Number(b.maxDiscount));
  try {
    await db.query(
      `UPDATE promos SET
        code=COALESCE(?,code), title=COALESCE(?,title), description=COALESCE(?,description),
        discount_type=COALESCE(?,discount_type), discount_value=COALESCE(?,discount_value),
        usage_limit=COALESCE(?,usage_limit), per_user_limit=COALESCE(?,per_user_limit),
        max_discount=CASE WHEN ? IS NULL THEN max_discount WHEN ?=0 THEN NULL ELSE ? END,
        valid_from=COALESCE(?,valid_from), valid_until=COALESCE(?,valid_until),
        applies_to=COALESCE(?,applies_to), is_active=COALESCE(?,is_active)
       WHERE id=?`,
      [
        b.code ? String(b.code).trim().toUpperCase() : null, b.title || null, b.description || null,
        b.discountType || b.discount_type || null,
        b.discountValue != null ? Number(b.discountValue) : null,
        b.usageLimit != null ? b.usageLimit : null,
        b.perUserLimit != null ? b.perUserLimit : null,
        maxDisc === undefined ? null : maxDisc, maxDisc === undefined ? null : maxDisc, maxDisc === undefined ? null : maxDisc,
        b.validFrom || b.valid_from || null,
        b.validUntil || b.valid_until || null,
        b.appliesTo || b.applies_to || null,
        b.isActive !== undefined ? (b.isActive ? 1 : 0) : null,
        id
      ]
    );
  } catch (e) {
    if (e.code === 'ER_DUP_ENTRY') throw ApiError.conflict('A promotion with this code already exists.');
    throw e;
  }
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
    `INSERT INTO tour_packages(name,description,base_price,duration_hours,max_tourists,pickup_notes,image_url,is_active,created_by)
     VALUES(?,?,?,?,?,?,?,?,?)`,
    [
      b.name || b.package, b.description || null,
      Number(b.base_price || b.price || 0),
      Number(b.duration_hours || b.duration || 4),
      Number(b.max_tourists || b.max || 6),
      b.pickup_notes || b.pickupNotes || null,
      b.image_url || b.imageUrl || null,
      b.is_active !== undefined ? (b.is_active ? 1 : 0) : 1,
      req.user.sub
    ]
  );
  await audit(req.user.sub, 'create_tour', 'tour_package', r.insertId);
  try {
    const { notifyMany, allRiderIds } = require('../services/notification.service');
    const riders = await allRiderIds();
    await notifyMany(riders, 'New tour package', b.name || 'A new ZenjiGO tour is available.', 'tour_new', { type: 'tour_new', tourId: String(r.insertId) });
  } catch (_) {}
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
      max_tourists=COALESCE(?,max_tourists), pickup_notes=COALESCE(?,pickup_notes), image_url=COALESCE(?,image_url),
      is_active=COALESCE(?,is_active)
     WHERE id=?`,
    [
      b.name || b.package || null, b.description || null,
      b.base_price != null || b.price != null ? Number(b.base_price || b.price) : null,
      b.duration_hours != null || b.duration != null ? Number(b.duration_hours || b.duration) : null,
      b.max_tourists != null || b.max != null ? Number(b.max_tourists || b.max) : null,
      b.pickup_notes || b.pickupNotes || null,
      b.image_url || b.imageUrl || null,
      b.is_active !== undefined ? (b.is_active ? 1 : 0) : (b.status === 'Active' ? 1 : b.status === 'Paused' ? 0 : null),
      id
    ]
  );
  await audit(req.user.sub, 'update_tour', 'tour_package', id, b);
  try {
    const { notifyMany, allRiderIds } = require('../services/notification.service');
    const riders = await allRiderIds();
    await notifyMany(riders, 'Tour package updated', b.name || 'A ZenjiGO tour was updated.', 'tour_updated', { type: 'tour_updated', tourId: String(id) });
  } catch (_) {}
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
  const b = req.body || {};
  const title = String(b.title || '').trim();
  const body = String(b.body || '').trim();
  if (!title || !body) throw ApiError.badRequest('title and body are required');
  if (title.length > 150) throw ApiError.badRequest('Title must be 150 characters or fewer');
  if (body.length > 500) throw ApiError.badRequest('Message must be 500 characters or fewer');
  const type = String(b.type || 'admin').slice(0, 50);
  const audience = b.audience || (b.userId ? 'user' : null);
  const { notifyMany } = require('../services/notification.service');
  let ids = [];
  if (audience === 'user') {
    const u = await db.query('SELECT id FROM users WHERE id=?', [Number(b.userId)]);
    if (!u.length) throw ApiError.notFound('Recipient not found');
    ids = [u[0].id];
  } else if (audience === 'all_riders') {
    ids = (await db.query(`SELECT id FROM users WHERE role='rider' AND status='active'`)).map((r) => r.id);
  } else if (audience === 'all_drivers') {
    ids = (await db.query(`SELECT id FROM users WHERE role='driver' AND status='active'`)).map((r) => r.id);
  } else if (audience === 'online_drivers') {
    ids = (await db.query(`SELECT u.id FROM users u JOIN driver_profiles d ON d.user_id=u.id WHERE u.status='active' AND d.online=1`)).map((r) => r.id);
  } else {
    throw ApiError.badRequest('A valid audience or userId is required');
  }
  if (!ids.length) throw ApiError.badRequest('No active recipients match this audience');
  if (ids.length > 5000) throw ApiError.badRequest('Audience too large for a single send');
  await notifyMany(ids, title, body, type, { type, source: 'admin' });
  await audit(req.user.sub, 'send_notification', 'notification', null, { audience, recipients: ids.length, title });
  ok(res, { recipients: ids.length }, `Notification sent to ${ids.length} recipient${ids.length === 1 ? '' : 's'}`, 201);
});

/* -------------------- Conversations / Support chat -------------------- */
exports.conversations = asyncHandler(async (req, res) => {
  ok(res, await chatService.adminList(req.user.sub));
});

exports.conversationMessages = asyncHandler(async (req, res) => {
  ok(res, await chatService.adminMessages(req.user.sub, req.params.id));
});

exports.sendConversationMessage = asyncHandler(async (req, res) => {
  if (!req.body?.text?.trim()) throw ApiError.badRequest('Message text is required');
  ok(res, await chatService.adminSend(req.user.sub, req.params.id, req.body.text.trim(), req.body.replyToId), 'Message sent', 201);
});

exports.markConversationRead = asyncHandler(async (req, res) => {
  ok(res, await chatService.markRead(req.user.sub, req.params.id), 'Conversation marked as read');
});

exports.markAllSupportRead = asyncHandler(async (req, res) => {
  ok(res, await chatService.adminMarkAllSupportRead(req.user.sub), 'Support threads marked as read');
});

exports.markAllNotificationsRead = asyncHandler(async (req, res) => {
  await db.query('UPDATE notifications SET read_at=COALESCE(read_at, UTC_TIMESTAMP()) WHERE read_at IS NULL');
  await audit(req.user.sub, 'mark_all_notifications_read', 'notification', null);
  ok(res, { ok: true }, 'All notifications marked as read');
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

/**
 * Live operations map data: active rides + online drivers with coordinates.
 */
// Browser key for the admin console's Google Map. Only returned to authenticated admins.
// Prefer a dedicated key (GOOGLE_MAPS_BROWSER_KEY) restricted to the admin site's HTTP referrer.
exports.mapsConfig = asyncHandler(async (req, res) => {
  ok(res, { key: process.env.GOOGLE_MAPS_BROWSER_KEY || process.env.GOOGLE_MAPS_API_KEY || '' });
});

exports.liveMap = asyncHandler(async (req, res) => {
  const rides = await db.query(`
    SELECT r.id, r.ride_code rideCode, r.ride_type rideType, r.status,
           r.pickup_address pickupAddress, r.destination_address destinationAddress,
           r.pickup_lat pickupLat, r.pickup_lng pickupLng,
           r.destination_lat destinationLat, r.destination_lng destinationLng,
           r.estimated_fare estimatedFare, r.created_at createdAt,
           ru.full_name riderName, du.full_name driverName,
           d.current_lat driverLat, d.current_lng driverLng
    FROM rides r
    JOIN users ru ON ru.id = r.rider_id
    LEFT JOIN users du ON du.id = r.driver_id
    LEFT JOIN driver_profiles d ON d.user_id = r.driver_id
    WHERE r.status NOT IN ('completed', 'cancelled')
    ORDER BY r.id DESC
    LIMIT 200
  `);

  const drivers = await db.query(`
    SELECT d.user_id id, u.full_name fullName, d.current_lat lat, d.current_lng lng,
           d.online, d.rating, d.location_updated_at locationUpdatedAt,
           v.type vehicleType, v.plate_number plateNumber
    FROM driver_profiles d
    JOIN users u ON u.id = d.user_id AND u.status = 'active'
    LEFT JOIN vehicles v ON v.driver_id = d.user_id AND v.status = 'active'
    WHERE d.online = 1
      AND d.application_status = 'active'
      AND d.current_lat IS NOT NULL
      AND d.current_lng IS NOT NULL
    ORDER BY d.location_updated_at DESC
    LIMIT 200
  `);

  ok(res, { rides, drivers, updatedAt: new Date().toISOString() });
});


/* -------------------- Archive -------------------- */
exports.archives = asyncHandler(async (req, res) => {
  const rows = await archiveService.listArchives({ role: req.query.role || null, limit: req.query.limit });
  ok(res, rows);
});

exports.archive = asyncHandler(async (req, res) => {
  const row = await archiveService.getArchive(req.params.id);
  const strip = (v) => Array.isArray(v) ? v.map(strip)
    : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).filter(([k]) => !/pass(word)?|hash|token|secret/i.test(k)).map(([k, x]) => [k, strip(x)]))
    : v;
  row.snapshot = strip(row.snapshot);
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

/** List driver reports submitted by riders */
exports.driverReports = asyncHandler(async (req, res) => {
  try {
    const rows = await db.query(
      `SELECT r.*, 
              reporter.full_name reporter_name, reporter.phone reporter_phone,
              driver.full_name driver_name, driver.phone driver_phone
       FROM driver_reports r
       LEFT JOIN users reporter ON reporter.id = r.reporter_id
       LEFT JOIN users driver ON driver.id = r.driver_id
       ORDER BY r.id DESC LIMIT 500`
    );
    ok(res, rows);
  } catch (e) {
    ok(res, []);
  }
});

exports.updateDriverReport = asyncHandler(async (req, res) => {
  const status = req.body.status;
  const note = String(req.body.note || req.body.adminNote || '').trim().slice(0, 500) || null;
  if (!['open', 'reviewed', 'dismissed'].includes(status)) {
    throw ApiError.badRequest('Invalid status');
  }
  await addColumnIfMissing('driver_reports', 'admin_note', 'VARCHAR(500) NULL');
  await addColumnIfMissing('driver_reports', 'reviewed_by', 'BIGINT UNSIGNED NULL');
  await addColumnIfMissing('driver_reports', 'reviewed_at', 'DATETIME NULL');
  const r = await db.query(
    'UPDATE driver_reports SET status=?, admin_note=COALESCE(?,admin_note), reviewed_by=?, reviewed_at=UTC_TIMESTAMP() WHERE id=?',
    [status, note, req.user.sub, req.params.id]
  );
  if (r.affectedRows === 0) throw ApiError.notFound('Report not found');
  await audit(req.user.sub, 'driver_report_status', 'driver_report', req.params.id, { status, note });
  ok(res, null, 'Report updated');
});


/* ==================== Rider detail ==================== */
exports.rider = asyncHandler(async (req, res) => {
  const id = req.params.id;
  const rows = await db.query(`
    SELECT u.id, u.full_name fullName, u.phone, u.email, u.status, u.photo_url photoUrl, u.island, u.region, u.district, u.ward,
           u.created_at createdAt, u.last_login_at lastLoginAt,
           COALESCE(w.balance,0) walletBalance, w.currency,
           COALESCE(r.total_rides,0) totalRides, COALESCE(r.rating,0) rating,
           COALESCE(r.cancellation_debt,0) cancellationDebt, r.referral_code referralCode,
           r.emergency_name emergencyName, r.emergency_phone emergencyPhone
    FROM users u
    LEFT JOIN wallets w ON w.user_id=u.id
    LEFT JOIN rider_profiles r ON r.user_id=u.id
    WHERE u.id=? AND u.role='rider'`, [id]);
  if (!rows.length) throw ApiError.notFound('Rider not found');
  const safe = async (fn, fb) => { try { return await fn(); } catch (_) { return fb; } };
  const recentRides = await db.query(
    `SELECT r.id, r.ride_code, r.ride_type, r.status, r.pickup_address, r.destination_address, r.final_fare, r.estimated_fare, r.payment_method, r.created_at, du.full_name driverName
     FROM rides r LEFT JOIN users du ON du.id=r.driver_id WHERE r.rider_id=? ORDER BY r.id DESC LIMIT 15`, [id]);
  const walletTransactions = await safe(() => db.query(
    'SELECT id, type, amount, balance_after, status, payment_method, description, created_at FROM wallet_transactions WHERE user_id=? ORDER BY id DESC LIMIT 15', [id]), []);
  const reportsAgainst = await safe(() => db.query(
    `SELECT r.id, r.reason, r.status, r.created_at, d.full_name driverName FROM driver_reports r LEFT JOIN users d ON d.id=r.driver_id WHERE r.reporter_id=? ORDER BY r.id DESC LIMIT 10`, [id]), []);
  const stats = (await db.query(
    `SELECT COUNT(*) total, SUM(status='completed') completed, SUM(status='cancelled') cancelled,
            COALESCE(SUM(CASE WHEN status='completed' THEN final_fare END),0) spent FROM rides WHERE rider_id=?`, [id]))[0] || {};
  ok(res, { profile: rows[0], recentRides, walletTransactions, reportsFiled: reportsAgainst, stats });
});

/* ==================== Document review queue ==================== */
exports.documents = asyncHandler(async (req, res) => {
  const rows = await db.query(`
    SELECT dd.id, dd.driver_id driverId, dd.document_type documentType, dd.url, dd.resource_type resourceType,
           dd.expires_at expiresAt, dd.status, dd.rejection_reason rejectionReason, dd.verified_at verifiedAt,
           dd.created_at createdAt, u.full_name driverName, u.phone driverPhone, d.application_status applicationStatus,
           a.full_name verifiedByName,
           (SELECT COUNT(*) FROM driver_documents n2 WHERE n2.driver_id=dd.driver_id AND n2.document_type=dd.document_type AND n2.id>dd.id AND n2.status IN ('approved','pending')) newerCount
    FROM driver_documents dd
    JOIN users u ON u.id = dd.driver_id
    LEFT JOIN driver_profiles d ON d.user_id = dd.driver_id
    LEFT JOIN users a ON a.id = dd.verified_by
    ORDER BY (dd.status='pending') DESC, dd.id DESC LIMIT 1500`);
  ok(res, rows);
});

/* ==================== Driver change requests ==================== */
async function ensureChangeRequests() {
  await db.query(`CREATE TABLE IF NOT EXISTS driver_change_requests (
    id BIGINT PRIMARY KEY AUTO_INCREMENT, driver_id BIGINT NOT NULL, request_type VARCHAR(32) NOT NULL,
    field_name VARCHAR(64) NOT NULL, new_value TEXT, reason TEXT, status VARCHAR(32) DEFAULT 'pending',
    rejection_reason TEXT, meta JSON, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP, INDEX (driver_id), INDEX (status)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
  await addColumnIfMissing('driver_change_requests', 'reviewed_by', 'BIGINT NULL');
  await addColumnIfMissing('driver_change_requests', 'reviewed_at', 'DATETIME NULL');
}

// Portable across MySQL and MariaDB (no "ADD COLUMN IF NOT EXISTS").
async function addColumnIfMissing(table, column, ddl) {
  try {
    const r = await db.query(
      'SELECT COUNT(*) n FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?',
      [table, column]
    );
    if (!Number(r[0].n)) await db.query(`ALTER TABLE \`${table}\` ADD COLUMN \`${column}\` ${ddl}`);
  } catch (e) { console.warn('[addColumnIfMissing]', table, column, e.message); }
}

function parseJson(v) {
  if (v == null) return null;
  if (typeof v === 'object') return v;
  try { return JSON.parse(v); } catch (_) { return null; }
}

exports.changeRequests = asyncHandler(async (req, res) => {
  await ensureChangeRequests();
  const rows = await db.query(`
    SELECT c.*, u.full_name driverName, u.phone driverPhone, u.email driverEmail, d.driver_code driverCode, rv.full_name reviewedByName
    FROM driver_change_requests c
    JOIN users u ON u.id = c.driver_id
    LEFT JOIN driver_profiles d ON d.user_id = c.driver_id
    LEFT JOIN users rv ON rv.id = c.reviewed_by
    ORDER BY (c.status='pending') DESC, c.id DESC LIMIT 1000`);
  // Attach the driver's current values so the admin can compare before approving
  const profileCols = { full_name: 'u.full_name', phone: 'u.phone', email: 'u.email', home_address: 'd.home_address', national_id: 'd.national_id' };
  for (const r of rows) {
    r.meta = parseJson(r.meta);
    if (r.request_type === 'vehicle') r.newValueParsed = parseJson(r.new_value);
    if (r.status !== 'pending') continue;
    try {
      if (r.request_type === 'profile' && profileCols[r.field_name]) {
        const [cur] = await db.query(`SELECT ${profileCols[r.field_name]} v FROM users u JOIN driver_profiles d ON d.user_id=u.id WHERE u.id=?`, [r.driver_id]);
        r.currentValue = cur ? cur.v : null;
      } else if (r.request_type === 'vehicle') {
        const [veh] = await db.query(`SELECT type vehicleType, plate_number plateNumber, make vehicleMake, model vehicleModel, color vehicleColor, model_year modelYear FROM vehicles WHERE driver_id=? ORDER BY (status='active') DESC, id DESC LIMIT 1`, [r.driver_id]);
        r.currentValue = veh || null;
      } else if (r.request_type === 'document') {
        const [doc] = await db.query(`SELECT id, url, status, expires_at expiresAt FROM driver_documents WHERE driver_id=? AND document_type=? ORDER BY id DESC LIMIT 1`, [r.driver_id, normalizeDocType(r.field_name)]);
        r.currentValue = doc || null;
      }
    } catch (_) {}
  }
  ok(res, rows);
});

function normalizeDocType(name) {
  const n = String(name || '').toLowerCase().replace(/[\s-]+/g, '_');
  const map = {
    license: 'drivers_license', licence: 'drivers_license', driver_license: 'drivers_license', drivers_license: 'drivers_license', driving_license: 'drivers_license', driving_licence: 'drivers_license',
    national_id: 'national_id', nationalid: 'national_id', nida: 'national_id', id: 'national_id',
    insurance: 'insurance', vehicle_insurance: 'insurance',
    vehicle_photo: 'vehicle_photo', vehicle: 'vehicle_photo', driver_photo: 'driver_photo', photo: 'driver_photo'
  };
  return map[n] || 'other';
}

exports.reviewChangeRequest = asyncHandler(async (req, res) => {
  await ensureChangeRequests();
  const status = req.body.status;
  const reason = String(req.body.reason || req.body.rejectionReason || '').trim().slice(0, 500);
  if (!['approved', 'rejected'].includes(status)) throw ApiError.badRequest('Status must be approved or rejected');
  if (status === 'rejected' && !reason) throw ApiError.badRequest('A reason is required when rejecting a request.');
  const rows = await db.query('SELECT * FROM driver_change_requests WHERE id=?', [req.params.id]);
  if (!rows.length) throw ApiError.notFound('Change request not found');
  const cr = rows[0];
  if (cr.status !== 'pending') throw ApiError.conflict(`This request was already ${cr.status}.`);
  const meta = parseJson(cr.meta) || {};

  if (status === 'approved') {
    await withDup(db.transaction(async (conn) => {
      if (cr.request_type === 'profile') {
        const val = String(cr.new_value || '').trim();
        if (!val) throw ApiError.badRequest('The request has no new value to apply.');
        if (cr.field_name === 'full_name') await conn.query('UPDATE users SET full_name=? WHERE id=?', [val, cr.driver_id]);
        else if (cr.field_name === 'phone') await conn.query('UPDATE users SET phone=? WHERE id=?', [normalizePhone(val), cr.driver_id]);
        else if (cr.field_name === 'email') await conn.query('UPDATE users SET email=? WHERE id=?', [val.toLowerCase(), cr.driver_id]);
        else if (cr.field_name === 'home_address') await conn.query('UPDATE driver_profiles SET home_address=? WHERE user_id=?', [val, cr.driver_id]);
        else if (cr.field_name === 'national_id') await conn.query('UPDATE driver_profiles SET national_id=? WHERE user_id=?', [val, cr.driver_id]);
        else throw ApiError.badRequest('Unsupported profile field');
      } else if (cr.request_type === 'vehicle') {
        const v = parseJson(cr.new_value) || {};
        const [veh] = await conn.query(`SELECT id FROM vehicles WHERE driver_id=? ORDER BY (status='active') DESC, id DESC LIMIT 1`, [cr.driver_id]);
        const type = v.vehicleType ? String(v.vehicleType).toLowerCase() : null;
        if (type && !['boda', 'bajaji', 'taxi'].includes(type)) throw ApiError.badRequest('Invalid vehicle type in request');
        const year = v.modelYear ? Number(v.modelYear) : null;
        const vals = [type, v.plateNumber || null, v.vehicleMake || null, v.vehicleModel || null, v.vehicleColor || null, Number.isFinite(year) ? year : null];
        if (veh.length) {
          await conn.query(`UPDATE vehicles SET type=COALESCE(?,type), plate_number=COALESCE(?,plate_number), make=COALESCE(?,make), model=COALESCE(?,model), color=COALESCE(?,color), model_year=COALESCE(?,model_year) WHERE id=?`, [...vals, veh[0].id]);
        } else {
          await conn.query('INSERT INTO vehicles(driver_id,type,plate_number,make,model,color,model_year,status) VALUES(?,?,?,?,?,?,?,?)', [cr.driver_id, type || 'taxi', v.plateNumber || `TMP-${cr.driver_id}`, v.vehicleMake || null, v.vehicleModel || null, v.vehicleColor || null, vals[5], 'active']);
        }
      } else if (cr.request_type === 'document') {
        if (!cr.new_value) throw ApiError.badRequest('No file was attached to this request, so it cannot be approved.');
        await conn.query(
          `INSERT INTO driver_documents(driver_id, document_type, public_id, url, resource_type, expires_at, status, verified_by, verified_at)
           VALUES(?,?,?,?,?,?, 'approved', ?, UTC_TIMESTAMP())`,
          [cr.driver_id, normalizeDocType(cr.field_name), meta.publicId || null, cr.new_value, meta.resourceType || 'image', meta.expiresAt || null, req.user.sub]
        );
      }
      await conn.query(
        `UPDATE driver_change_requests SET status='approved', rejection_reason=NULL, reviewed_by=?, reviewed_at=UTC_TIMESTAMP() WHERE id=?`,
        [req.user.sub, cr.id]
      );
    }));
  } else {
    await db.query(
      `UPDATE driver_change_requests SET status='rejected', rejection_reason=?, reviewed_by=?, reviewed_at=UTC_TIMESTAMP() WHERE id=?`,
      [reason, req.user.sub, cr.id]
    );
  }
  await audit(req.user.sub, `change_request_${status}`, 'driver_change_request', cr.id, { type: cr.request_type, field: cr.field_name, reason: reason || null });
  try {
    const label = cr.request_type === 'vehicle' ? 'vehicle details' : String(cr.field_name).replace(/_/g, ' ');
    await notifyUser(
      cr.driver_id,
      status === 'approved' ? 'Change request approved' : 'Change request rejected',
      status === 'approved' ? `Your request to update your ${label} was approved.` : `Your request to update your ${label} was rejected. ${reason}`,
      'change_request',
      { type: 'change_request', requestId: String(cr.id), status }
    );
  } catch (_) {}
  ok(res, { status }, `Request ${status}`);
});

/* ==================== Settlements, tour bookings, ratings, wallet ledger ==================== */
exports.settlements = asyncHandler(async (req, res) => {
  const rows = await db.query(`
    SELECT s.*, u.full_name driverName, u.phone driverPhone
    FROM driver_settlements s JOIN users u ON u.id=s.driver_id
    ORDER BY s.id DESC LIMIT 1000`);
  ok(res, rows.map((r) => { delete r.metadata; return r; }));
});

exports.tourBookings = asyncHandler(async (req, res) => {
  const rows = await db.query(`
    SELECT b.*, p.name packageName, ru.full_name riderName, ru.phone riderPhone, du.full_name driverName, du.phone driverPhone
    FROM tour_bookings b
    JOIN tour_packages p ON p.id=b.package_id
    JOIN users ru ON ru.id=b.rider_id
    LEFT JOIN users du ON du.id=b.driver_id
    ORDER BY b.id DESC LIMIT 1000`);
  ok(res, rows);
});

exports.ratings = asyncHandler(async (req, res) => {
  const rows = await db.query(`
    SELECT rt.id, rt.ride_id rideId, rt.stars, rt.feedback, rt.created_at createdAt,
           fu.full_name fromName, fu.role fromRole, tu.full_name toName, tu.role toRole, r.ride_code rideCode
    FROM ratings rt
    JOIN users fu ON fu.id=rt.from_user_id
    JOIN users tu ON tu.id=rt.to_user_id
    LEFT JOIN rides r ON r.id=rt.ride_id
    ORDER BY rt.id DESC LIMIT 1000`);
  ok(res, rows);
});

exports.walletTransactions = asyncHandler(async (req, res) => {
  const rows = await db.query(`
    SELECT t.id, t.user_id userId, u.full_name userName, u.role userRole, t.type, t.amount, t.balance_before balanceBefore,
           t.balance_after balanceAfter, t.status, t.payment_method paymentMethod, t.description, t.created_at createdAt
    FROM wallet_transactions t JOIN users u ON u.id=t.user_id
    ORDER BY t.id DESC LIMIT 1000`);
  ok(res, rows);
});

/* ==================== Current admin profile ==================== */
exports.me = asyncHandler(async (req, res) => {
  const rows = await db.query(`SELECT id, full_name fullName, email, phone, status, created_at createdAt, last_login_at lastLoginAt FROM users WHERE id=? AND role='admin'`, [req.user.sub]);
  if (!rows.length) throw ApiError.notFound('Admin not found');
  ok(res, rows[0]);
});

exports.updateMe = asyncHandler(async (req, res) => {
  const b = req.body || {};
  const fields = []; const params = [];
  if (b.fullName !== undefined) {
    const n = String(b.fullName).trim();
    if (n.length < 2) throw ApiError.badRequest('Name is too short');
    fields.push('full_name=?'); params.push(n);
  }
  if (b.phone !== undefined) { fields.push('phone=?'); params.push(b.phone ? normalizePhone(b.phone) : null); }
  if (!fields.length) throw ApiError.badRequest('Nothing to update');
  params.push(req.user.sub);
  await withDup(db.query(`UPDATE users SET ${fields.join(',')} WHERE id=?`, params));
  await audit(req.user.sub, 'update_own_profile', 'user', req.user.sub);
  ok(res, null, 'Profile updated');
});

exports.changeMyPassword = asyncHandler(async (req, res) => {
  const { currentPassword, newPassword } = req.body || {};
  const { comparePassword } = require('../utils/hash');
  if (!currentPassword || !newPassword) throw ApiError.badRequest('Current and new password are required');
  if (String(newPassword).length < 10) throw ApiError.badRequest('New password must be at least 10 characters');
  if (!/[a-z]/.test(newPassword) || !/[A-Z]/.test(newPassword) || !/\d/.test(newPassword)) {
    throw ApiError.badRequest('Use upper and lower case letters and at least one number');
  }
  const rows = await db.query(`SELECT password_hash FROM users WHERE id=? AND role='admin'`, [req.user.sub]);
  if (!rows.length || !(await comparePassword(currentPassword, rows[0].password_hash))) {
    throw ApiError.unauthorized('Current password is incorrect');
  }
  await db.query('UPDATE users SET password_hash=? WHERE id=?', [await hashPassword(newPassword), req.user.sub]);
  await db.query('UPDATE refresh_tokens SET revoked_at=UTC_TIMESTAMP() WHERE user_id=? AND revoked_at IS NULL', [req.user.sub]).catch(() => {});
  await audit(req.user.sub, 'change_own_password', 'user', req.user.sub);
  ok(res, null, 'Password changed. Please sign in again.');
});

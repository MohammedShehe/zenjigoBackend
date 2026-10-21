(() => {
'use strict';

const API = window.ZenjiGOAdminAPI;
const D = window.ZENJIGO_DATA;
const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];

const money = (n) => 'TZS ' + Number(n || 0).toLocaleString();
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const statusClass = (s) => /active|success|completed|verified|delivered|confirmed|approved|paid/i.test(s) ? 'success'
  : /pending|review|assigned|arriving|searching|due|investigating|under_review/i.test(s) ? 'warning'
  : /cancel|reject|restrict|critical|failed|suspended/i.test(s) ? 'danger' : 'info';
const badge = (s) => `<span class="status ${statusClass(s)}">${esc(String(s || '—').replace(/_/g, ' '))}</span>`;
const userCell = (name, sub = '', tone = 'blue') => {
  const initials = String(name || '?').split(/\s+/).map((x) => x[0]).slice(0, 2).join('').toUpperCase();
  return `<div class="table-user"><div class="avatar avatar-${tone}">${esc(initials)}</div><div><b>${esc(name)}</b><span>${esc(sub)}</span></div></div>`;
};

function toast(msg, type = 'success') {
  const id = 't' + Date.now();
  $('#toastHost').insertAdjacentHTML('beforeend',
    `<div id="${id}" class="toast border-0 shadow-sm" role="alert"><div class="toast-body d-flex align-items-center gap-2">
      <i class="bi ${type === 'danger' ? 'bi-exclamation-circle-fill text-danger' : 'bi-check-circle-fill text-success'}"></i>
      <span class="flex-grow-1">${esc(msg)}</span>
      <button class="btn-close" data-bs-dismiss="toast"></button></div></div>`);
  const el = $('#' + id);
  new bootstrap.Toast(el, { delay: 3200 }).show();
  el.addEventListener('hidden.bs.toast', () => el.remove());
}
window.toast = toast;

function loadBtn(btn) {
  if (!btn) return Promise.resolve();
  btn.classList.add('is-loading');
  btn.disabled = true;
  return {
    done() { btn.classList.remove('is-loading'); btn.disabled = false; }
  };
}

function makeOtp(host) {
  if (!host) return;
  host.innerHTML = '';
  for (let i = 0; i < 6; i++) {
    host.insertAdjacentHTML('beforeend', `<input class="form-control otp" maxlength="1" inputmode="numeric" aria-label="OTP digit ${i + 1}">`);
  }
  [...host.children].forEach((inp, i) => {
    inp.addEventListener('input', () => {
      inp.value = inp.value.replace(/\D/g, '').slice(0, 1);
      if (inp.value && i < 5) host.children[i + 1].focus();
    });
    inp.addEventListener('keydown', (e) => {
      if (e.key === 'Backspace' && !inp.value && i > 0) host.children[i - 1].focus();
    });
    inp.addEventListener('paste', (e) => {
      const v = (e.clipboardData.getData('text') || '').replace(/\D/g, '').slice(0, 6);
      if (v.length) {
        e.preventDefault();
        v.split('').forEach((c, j) => { if (host.children[j]) host.children[j].value = c; });
        host.children[Math.min(v.length, 6) - 1].focus();
      }
    });
  });
}

/* ---------- Auth ---------- */
function showAuth(name) {
  $$('.auth-step').forEach((x) => x.classList.remove('active'));
  const el = $('#authStep' + name[0].toUpperCase() + name.slice(1));
  if (el) el.classList.add('active');
}

async function enterApp() {
  $('#authView')?.classList.add('d-none');
  $('#adminApp')?.classList.remove('d-none');
  const s = API.session();
  if (s?.admin || s?.user || s?.fullName || s?.email) {
    const name = s.fullName || s.admin?.fullName || s.user?.fullName || 'Super Admin';
    const email = s.email || s.admin?.email || s.user?.email || '';
    const av = $$('.top-profile b, .top-profile span');
    if (av[0]) av[0].textContent = name;
    if (av[1]) av[1].textContent = email;
  }
  await syncAll();
  renderPage('dashboard');
}

async function signOut() {
  await API.logout();
  $('#adminApp')?.classList.add('d-none');
  $('#authView')?.classList.remove('d-none');
  showAuth('login');
  $$('.otp').forEach((x) => (x.value = ''));
  toast('Signed out securely.');
}

/* ---------- Data sync ---------- */
async function syncAll() {
  try {
    const [
      dashboard, rides, drivers, riders, admins, promos, payments, payouts,
      tours, parcels, notifications, conversations, audit, commissions, finance, settings, commissionSettings
    ] = await Promise.all([
      API.get('/admin/dashboard').catch(() => ({})),
      API.get('/admin/rides').catch(() => []),
      API.get('/admin/drivers').catch(() => []),
      API.get('/admin/riders').catch(() => []),
      API.get('/admin/admins').catch(() => []),
      API.get('/admin/promos').catch(() => []),
      API.get('/admin/payments').catch(() => []),
      API.get('/admin/payouts').catch(() => []),
      API.get('/admin/tour-packages').catch(() => []),
      API.get('/admin/parcels').catch(() => []),
      API.get('/admin/notifications').catch(() => []),
      API.get('/admin/conversations').catch(() => []),
      API.get('/admin/audit-logs').catch(() => []),
      API.get('/admin/commissions').catch(() => []),
      API.get('/admin/driver-finance').catch(() => []),
      API.get('/admin/settings').catch(() => ({})),
      API.get('/admin/commission-settings').catch(() => ({ cycleLimit: 60000, percent: 20 }))
    ]);

    D.dashboard = dashboard || {};
    D.rides = (rides || []).map(mapRide);
    D.drivers = (drivers || []).map(mapDriver);
    D.riders = (riders || []).map(mapRider);
    D.admins = (admins || []).map(mapAdmin);
    D.promos = (promos || []).map(mapPromo);
    D.payments = payments || [];
    D.payouts = (payouts || []).map(mapPayout);
    D.tours = (tours || []).map(mapTour);
    D.parcels = (parcels || []).map(mapParcel);
    D.notifications = notifications || [];
    updateIndicators();
    D.conversations = conversations || [];
    D.audit = audit || [];
    D.commissions = commissions || [];
    D.finance = finance || [];
    D.settings = settings || {};
    D.commissionSettings = commissionSettings || { cycleLimit: 60000, percent: 20 };
  } catch (e) {
    toast('Backend sync failed: ' + e.message, 'danger');
  }
}
window.syncAll = syncAll;

function mapRide(r) {
  return {
    id: r.ride_code || r.id, dbId: r.id,
    rider: r.riderName || '—', driver: r.driverName || '—',
    type: String(r.ride_type || '').replace(/^./, (x) => x.toUpperCase()),
    from: r.pickup_address, to: r.destination_address,
    fare: Number(r.final_fare ?? r.estimated_fare ?? 0),
    status: r.status, payment: r.payment_method || 'Cash',
    time: r.created_at ? new Date(r.created_at).toLocaleString() : '—',
    pin: r.trip_pin || '—',
    distance: (r.estimated_distance_km || 0) + ' km'
  };
}
function mapDriver(d) {
  return {
    id: d.id, dbId: d.id, code: d.driverCode || d.id,
    name: d.fullName, phone: d.phone, email: d.email || '—',
    vehicle: d.vehicleType || '—', plate: d.plateNumber || '—',
    type: (d.vehicleType || '—').replace(/^./, (x) => x.toUpperCase()),
    rating: Number(d.rating || 0).toFixed(1),
    rides: d.totalRides || 0, earnings: d.totalEarnings || 0,
    status: d.applicationStatus || d.status, online: !!d.online,
    userStatus: d.status, make: d.make || '', model: d.model || '', color: d.color || ''
  };
}
function mapRider(r) {
  return {
    id: r.id, name: r.fullName, phone: r.phone, email: r.email || '—',
    island: r.island || '—', area: r.district || r.region || r.ward || '—',
    rides: r.totalRides || 0, wallet: Number(r.walletBalance || 0),
    status: r.status, rating: Number(r.rating || 0).toFixed(1)
  };
}
function mapAdmin(a) {
  return {
    id: a.id, name: a.fullName, phone: a.phone || '—', email: a.email,
    status: a.status, created: a.createdAt ? new Date(a.createdAt).toLocaleString() : '—',
    lastLogin: a.lastLoginAt ? new Date(a.lastLoginAt).toLocaleString() : '—'
  };
}
function mapPromo(p) {
  return {
    id: p.id, code: p.code, description: p.description || p.title,
    discount: p.discount_type === 'percent' ? p.discount_value + '%' : money(p.discount_value),
    discountType: p.discount_type, discountValue: p.discount_value,
    service: p.applies_to, usage: (p.usage_count || 0) + ' / ' + (p.usage_limit || '∞'),
    status: p.is_active ? 'Active' : 'Paused',
    validFrom: p.valid_from, validUntil: p.valid_until
  };
}
function mapPayout(p) {
  return {
    id: p.id, driver: p.driverName, method: p.method, account: p.account_details || '',
    amount: Number(p.amount || 0), status: p.status,
    requested: p.created_at ? new Date(p.created_at).toLocaleString() : '—'
  };
}
function mapTour(t) {
  return {
    id: t.id, name: t.name, description: t.description || '',
    price: Number(t.base_price || 0), duration: t.duration_hours,
    max: t.max_tourists, status: t.is_active ? 'Active' : 'Paused'
  };
}
function mapParcel(p) {
  return {
    id: p.parcel_code || p.id, dbId: p.id,
    rider: p.riderName, driver: p.driverName || '—',
    pickup: p.pickup_address, drop: p.delivery_address,
    weight: (p.weight_kg || 0) + ' kg', status: p.status,
    time: p.created_at ? new Date(p.created_at).toLocaleString() : '—'
  };
}

function updateIndicators() {
  const counts = { live: (D.rides || []).filter(r => !/completed|cancelled|canceled|failed/i.test(r.status || '')).length, drivers: (D.drivers || []).filter(d => /pending|review/i.test(d.status || '')).length, withdrawals: (D.payouts || []).filter(p => /pending/i.test(p.status || '')).length, chat: (D.conversations || []).filter(c => Number(c.unreadCount || c.unread_count || 0) > 0).length, reports: (D.rides || []).filter(r => /cancel|failed|incident|dispute/i.test(r.status || '')).length, notifications: (D.notifications || []).length };
  Object.entries(counts).forEach(([page, count]) => { const link = document.querySelector(`.nav-link[data-page="${page}"]`); if (!link) return; let badgeEl = link.querySelector('.nav-badge'); if (count > 0) { if (!badgeEl) { badgeEl = document.createElement('em'); badgeEl.className = 'nav-badge'; link.appendChild(badgeEl); } badgeEl.textContent = count > 99 ? '99+' : String(count); } else if (badgeEl) badgeEl.remove(); });
  const bell = document.querySelector('.notification-btn span'); if (bell) { const unread = (D.notifications || []).filter(n => !(n.read_at || n.readAt)).length; bell.textContent = unread > 0 ? (unread > 99 ? '99+' : String(unread)) : ''; bell.classList.toggle('has-count', unread > 0); bell.setAttribute('aria-label', `${unread} notifications`); }
}

/* ---------- Navigation ---------- */
let currentPage = 'dashboard';

const PAGE_META = {
  dashboard: ['Dashboard', 'Platform health and operations overview'],
  rides: ['Rides', 'All ride activity and lifecycle'],
  drivers: ['Drivers', 'Applications, fleet and performance'],
  riders: ['Riders', 'Accounts, wallets and history'],
  admins: ['Admins', 'Super admin and sub-admin accounts'],
  parcels: ['Parcels', 'Parcel bookings and delivery status'],
  tours: ['Tours', 'Tour packages and availability'],
  finance: ['Finance', 'Payments, commissions and ledger'],
  withdrawals: ['Withdrawals', 'Driver payout requests'],
  promotions: ['Promotions', 'Promo codes and incentives'],
  notifications: ['Notifications', 'System and admin messages'],
  chat: ['Support', 'Conversations and support threads'],
  audit: ['Audit log', 'Administrative actions trail'],
  pricing: ['Pricing & commission', 'Fare and commission configuration'],
  settings: ['Settings', 'Platform configuration'],
  live: ['Live Operations', 'Current rides, drivers and operational activity'],
  reports: ['Reports & Safety', 'Review operational activity and safety indicators']
};

function renderPage(page) {
  currentPage = page;
  $$('.nav-link[data-page]').forEach((a) => a.classList.toggle('active', a.dataset.page === page));
  const meta = PAGE_META[page] || [page, ''];
  if ($('#pageTitle')) $('#pageTitle').textContent = meta[0];
  if ($('#pageSubtitle')) $('#pageSubtitle').textContent = meta[1];
  const content = $('#content');
  if (!content) return;
  const fn = window.AdminPages?.[page];
  content.innerHTML = fn ? fn() : `<div class="card-x p-4"><p>Page not available.</p></div>`;
  updateIndicators();
  bindPageEvents();
}
window.renderPage = renderPage;
window.renderCurrent = () => renderPage(currentPage);

/* ---------- Table helpers ---------- */
function tableWrap(title, actionsHtml, headHtml, bodyHtml, emptyMsg) {
  return `<div class="card-x">
    <div class="card-head d-flex flex-wrap justify-content-between align-items-center gap-2">
      <div><h6 class="mb-0">${esc(title)}</h6></div>
      <div class="d-flex flex-wrap gap-2">${actionsHtml || ''}</div>
    </div>
    <div class="table-responsive">
      <table class="table table-hover align-middle mb-0">
        <thead><tr>${headHtml}</tr></thead>
        <tbody>${bodyHtml || `<tr><td colspan="12" class="text-center text-muted py-4">${esc(emptyMsg || 'No records')}</td></tr>`}</tbody>
      </table>
    </div>
  </div>`;
}

function toolbar(searchId, extra = '') {
  return `<div class="toolbar d-flex flex-wrap gap-2 mb-3">
    <div class="global-search flex-grow-1" style="max-width:320px"><i class="bi bi-search"></i>
      <input id="${searchId}" placeholder="Filter table..."></div>
    ${extra}
  </div>`;
}

/* ---------- Pages ---------- */
window.AdminPages = {
  live() {
    return toolbar('liveSearch', '<button class="btn btn-outline-primary" id="btnRefreshLive"><i class="bi bi-arrow-clockwise me-1"></i>Refresh</button>') + tableWrap('Live ride operations', '', '<th>Ride</th><th>Rider</th><th>Driver</th><th>Route</th><th>Status</th><th>Started</th>', D.rides.filter(r => !/completed|cancelled|canceled|failed/i.test(r.status || '')).map(r => `<tr data-search="${esc((r.id+' '+r.rider+' '+r.driver+' '+r.from+' '+r.to+' '+r.status).toLowerCase())}"><td><b>${esc(r.id)}</b></td><td>${esc(r.rider)}</td><td>${esc(r.driver)}</td><td>${esc(r.from)} → ${esc(r.to)}</td><td>${badge(r.status)}</td><td>${esc(r.time)}</td></tr>`).join(''), 'No active rides right now.');
  },
  reports() {
    const active = D.rides.filter(r => !/completed|cancelled|canceled|failed/i.test(r.status || '')).length;
    const pending = D.drivers.filter(d => /pending|review/i.test(d.status || '')).length;
    const suspended = D.riders.filter(r => /suspended|restricted/i.test(r.status || '')).length + D.drivers.filter(d => /suspended|rejected/i.test(d.status || '')).length;
    return `<div class="row g-3 mb-3"><div class="col-12 col-md-4"><div class="card-x p-3"><small class="text-muted">Active rides</small><h3>${active}</h3></div></div><div class="col-12 col-md-4"><div class="card-x p-3"><small class="text-muted">Driver applications to review</small><h3>${pending}</h3></div></div><div class="col-12 col-md-4"><div class="card-x p-3"><small class="text-muted">Restricted accounts</small><h3>${suspended}</h3></div></div></div>` + toolbar('reportsSearch') + tableWrap('Safety and operational review', '', '<th>Category</th><th>Reference</th><th>Person / detail</th><th>Status</th><th>Time</th>', [...D.drivers.filter(d => /pending|review|suspended|rejected/i.test(d.status || '')).map(d => ({category:'Driver review',id:d.id,name:d.name,status:d.status,time:'—'})), ...D.rides.filter(r => /cancel|failed|incident|dispute/i.test(r.status || '')).map(r => ({category:'Ride follow-up',id:r.id,name:(r.rider+' / '+r.driver),status:r.status,time:r.time}))].map(x => `<tr data-search="${esc((x.category+' '+x.id+' '+x.name+' '+x.status).toLowerCase())}"><td>${esc(x.category)}</td><td>${esc(x.id)}</td><td>${esc(x.name)}</td><td>${badge(x.status)}</td><td>${esc(x.time)}</td></tr>`).join(''), 'No review items found in the currently available records.');
  },
  dashboard() {
    const d = D.dashboard || {};
    const cards = [
      ['Users', d.users || 0, 'bi-people'],
      ['Riders', d.riders || 0, 'bi-person'],
      ['Drivers', d.drivers || 0, 'bi-scooter'],
      ['Admins', d.admins || 0, 'bi-shield-lock'],
      ["Today's rides", d.todayRides || 0, 'bi-geo-alt'],
      ['Active rides', d.activeRides || 0, 'bi-activity'],
      ['Pending apps', d.pendingDriverApplications || 0, 'bi-hourglass-split'],
      ["Today's revenue", money(d.todayRevenue || 0), 'bi-cash-stack']
    ];
    return `<div class="row g-3 mb-3">${cards.map(([l, v, i]) =>
      `<div class="col-6 col-md-3"><div class="card-x p-3 h-100">
        <div class="d-flex justify-content-between"><span class="text-muted small">${esc(l)}</span><i class="bi ${i} text-primary"></i></div>
        <div class="fs-4 fw-bold mt-1">${typeof v === 'number' ? v.toLocaleString() : esc(v)}</div>
      </div></div>`).join('')}</div>
      ${tableWrap('Recent rides', '', '<th>ID</th><th>Rider</th><th>Driver</th><th>Type</th><th>Fare</th><th>Status</th><th>Time</th>',
        D.rides.slice(0, 8).map((r) => `<tr><td>${esc(r.id)}</td><td>${esc(r.rider)}</td><td>${esc(r.driver)}</td><td>${esc(r.type)}</td><td>${money(r.fare)}</td><td>${badge(r.status)}</td><td>${esc(r.time)}</td></tr>`).join(''),
        'No rides yet')}`;
  },

  rides() {
    return toolbar('rideSearch') + tableWrap('All rides',
      `<button class="btn btn-sm btn-outline-primary" id="btnRefreshRides"><i class="bi bi-arrow-clockwise"></i> Refresh</button>`,
      '<th>ID</th><th>Rider</th><th>Driver</th><th>Type</th><th>From → To</th><th>Fare</th><th>Status</th><th>Time</th>',
      D.rides.map((r) => `<tr data-search="${esc((r.id + r.rider + r.driver + r.status).toLowerCase())}">
        <td><b>${esc(r.id)}</b></td><td>${esc(r.rider)}</td><td>${esc(r.driver)}</td><td>${esc(r.type)}</td>
        <td class="small">${esc(r.from)} → ${esc(r.to)}</td><td>${money(r.fare)}</td><td>${badge(r.status)}</td><td class="small">${esc(r.time)}</td></tr>`).join(''));
  },

  drivers() {
    return toolbar('driverSearch',
      `<button class="btn btn-sm btn-primary" data-action="add-driver"><i class="bi bi-plus-lg"></i> Add driver</button>
       <button class="btn btn-sm btn-outline-primary" id="btnRefreshDrivers"><i class="bi bi-arrow-clockwise"></i></button>`)
      + tableWrap('Drivers', '',
        '<th>Driver</th><th>Phone</th><th>Vehicle</th><th>Plate</th><th>Rides</th><th>Rating</th><th>Status</th><th>Online</th><th></th>',
        D.drivers.map((d) => `<tr data-search="${esc((d.name + d.phone + d.status + d.plate).toLowerCase())}">
          <td>${userCell(d.name, d.code, 'green')}</td><td>${esc(d.phone)}</td><td>${esc(d.type)}</td><td>${esc(d.plate)}</td>
          <td>${d.rides}</td><td>${d.rating}</td><td>${badge(d.status)}</td>
          <td>${d.online ? '<span class="text-success">● Online</span>' : '<span class="text-muted">○ Offline</span>'}</td>
          <td class="text-nowrap">
            <button class="btn btn-sm btn-outline-secondary" data-action="edit-driver" data-id="${d.id}" title="Edit"><i class="bi bi-pencil"></i></button>
            <button class="btn btn-sm btn-outline-success" data-action="driver-status" data-id="${d.id}" data-status="active" title="Approve/Activate"><i class="bi bi-check-lg"></i></button>
            <button class="btn btn-sm btn-outline-warning" data-action="driver-status" data-id="${d.id}" data-status="suspended" title="Suspend"><i class="bi bi-pause"></i></button>
            <button class="btn btn-sm btn-outline-danger" data-action="delete-driver" data-id="${d.id}" title="Deactivate"><i class="bi bi-trash"></i></button>
          </td></tr>`).join(''));
  },

  riders() {
    return toolbar('riderSearch',
      `<button class="btn btn-sm btn-primary" data-action="add-rider"><i class="bi bi-plus-lg"></i> Add rider</button>
       <button class="btn btn-sm btn-outline-primary" id="btnRefreshRiders"><i class="bi bi-arrow-clockwise"></i></button>`)
      + tableWrap('Riders', '',
        '<th>Rider</th><th>Phone</th><th>Email</th><th>Area</th><th>Rides</th><th>Wallet</th><th>Status</th><th></th>',
        D.riders.map((r) => `<tr data-search="${esc((r.name + r.phone + r.status).toLowerCase())}">
          <td>${userCell(r.name, r.email, 'blue')}</td><td>${esc(r.phone)}</td><td>${esc(r.email)}</td>
          <td>${esc(r.island)} / ${esc(r.area)}</td><td>${r.rides}</td><td>${money(r.wallet)}</td><td>${badge(r.status)}</td>
          <td class="text-nowrap">
            <button class="btn btn-sm btn-outline-secondary" data-action="edit-rider" data-id="${r.id}"><i class="bi bi-pencil"></i></button>
            <button class="btn btn-sm btn-outline-warning" data-action="rider-status" data-id="${r.id}" data-status="${r.status === 'suspended' ? 'active' : 'suspended'}" title="Toggle restrict">
              <i class="bi bi-slash-circle"></i></button>
            <button class="btn btn-sm btn-outline-danger" data-action="delete-rider" data-id="${r.id}"><i class="bi bi-trash"></i></button>
          </td></tr>`).join(''));
  },

  admins() {
    return toolbar('adminSearch',
      `<button class="btn btn-sm btn-primary" data-action="add-admin"><i class="bi bi-plus-lg"></i> Add sub-admin</button>
       <button class="btn btn-sm btn-outline-primary" id="btnRefreshAdmins"><i class="bi bi-arrow-clockwise"></i></button>`)
      + tableWrap('Administrators', '',
        '<th>Name</th><th>Email</th><th>Phone</th><th>Status</th><th>Created</th><th>Last login</th><th></th>',
        D.admins.map((a) => `<tr data-search="${esc((a.name + a.email + a.status).toLowerCase())}">
          <td>${userCell(a.name, 'Admin', 'purple')}</td><td>${esc(a.email)}</td><td>${esc(a.phone)}</td>
          <td>${badge(a.status)}</td><td class="small">${esc(a.created)}</td><td class="small">${esc(a.lastLogin)}</td>
          <td class="text-nowrap">
            <button class="btn btn-sm btn-outline-secondary" data-action="edit-admin" data-id="${a.id}"><i class="bi bi-pencil"></i></button>
            <button class="btn btn-sm btn-outline-danger" data-action="delete-admin" data-id="${a.id}"><i class="bi bi-trash"></i></button>
          </td></tr>`).join(''));
  },

  parcels() {
    return toolbar('parcelSearch') + tableWrap('Parcels', '',
      '<th>Code</th><th>Rider</th><th>Driver</th><th>Pickup → Drop</th><th>Weight</th><th>Status</th><th>Time</th>',
      D.parcels.map((p) => `<tr data-search="${esc((p.id + p.rider + p.status).toLowerCase())}">
        <td><b>${esc(p.id)}</b></td><td>${esc(p.rider)}</td><td>${esc(p.driver)}</td>
        <td class="small">${esc(p.pickup)} → ${esc(p.drop)}</td><td>${esc(p.weight)}</td><td>${badge(p.status)}</td><td class="small">${esc(p.time)}</td></tr>`).join(''));
  },

  tours() {
    return toolbar('tourSearch',
      `<button class="btn btn-sm btn-primary" data-action="add-tour"><i class="bi bi-plus-lg"></i> Add package</button>`)
      + tableWrap('Tour packages', '',
        '<th>Name</th><th>Description</th><th>Price</th><th>Duration</th><th>Max</th><th>Status</th><th></th>',
        D.tours.map((t) => `<tr data-search="${esc((t.name + t.status).toLowerCase())}">
          <td><b>${esc(t.name)}</b></td><td class="small">${esc(t.description).slice(0, 80)}</td>
          <td>${money(t.price)}</td><td>${esc(t.duration)} h</td><td>${esc(t.max)}</td><td>${badge(t.status)}</td>
          <td class="text-nowrap">
            <button class="btn btn-sm btn-outline-secondary" data-action="edit-tour" data-id="${t.id}"><i class="bi bi-pencil"></i></button>
            <button class="btn btn-sm btn-outline-danger" data-action="delete-tour" data-id="${t.id}"><i class="bi bi-trash"></i></button>
          </td></tr>`).join(''));
  },

  finance() {
    return `<div class="row g-3 mb-3">
      <div class="col-md-6">${tableWrap('Recent payments', '',
        '<th>ID</th><th>User</th><th>Amount</th><th>Provider</th><th>Status</th><th></th>',
        (D.payments || []).slice(0, 20).map((p) => `<tr>
          <td>${p.id}</td><td>${esc(p.userName || p.user_id)}</td><td>${money(p.amount)}</td>
          <td>${esc(p.provider)}</td><td>${badge(p.status)}</td>
          <td>${p.status === 'pending' ? `<button class="btn btn-sm btn-success" data-action="complete-payment" data-id="${p.id}">Complete</button>` : ''}</td>
        </tr>`).join(''))}</div>
      <div class="col-md-6">${tableWrap('Commission ledger', '',
        '<th>Driver</th><th>Gross</th><th>Commission</th><th>Driver share</th><th>Date</th>',
        (D.commissions || []).slice(0, 20).map((c) => `<tr>
          <td>${esc(c.driverName)}</td><td>${money(c.grossAmount)}</td><td>${money(c.commissionAmount)}</td>
          <td>${money(c.driverAmount)}</td><td class="small">${c.createdAt ? new Date(c.createdAt).toLocaleString() : '—'}</td>
        </tr>`).join(''))}</div>
    </div>`;
  },

  withdrawals() {
    return toolbar('payoutSearch') + tableWrap('Payout requests', '',
      '<th>ID</th><th>Driver</th><th>Method</th><th>Amount</th><th>Requested</th><th>Status</th><th></th>',
      D.payouts.map((p) => `<tr data-search="${esc((p.driver + p.status).toLowerCase())}">
        <td>${p.id}</td><td>${esc(p.driver)}</td><td>${esc(p.method)}</td><td>${money(p.amount)}</td>
        <td class="small">${esc(p.requested)}</td><td>${badge(p.status)}</td>
        <td class="text-nowrap">${p.status === 'pending' ? `
          <button class="btn btn-sm btn-success" data-action="payout-status" data-id="${p.id}" data-status="approved">Approve</button>
          <button class="btn btn-sm btn-danger" data-action="payout-status" data-id="${p.id}" data-status="rejected">Reject</button>
        ` : p.status === 'approved' ? `
          <button class="btn btn-sm btn-primary" data-action="payout-status" data-id="${p.id}" data-status="paid">Mark paid</button>
        ` : ''}</td></tr>`).join(''));
  },

  promotions() {
    return toolbar('promoSearch',
      `<button class="btn btn-sm btn-primary" data-action="add-promo"><i class="bi bi-plus-lg"></i> Create promo</button>`)
      + tableWrap('Promotions', '',
        '<th>Code</th><th>Description</th><th>Discount</th><th>Applies</th><th>Usage</th><th>Status</th><th></th>',
        D.promos.map((p) => `<tr data-search="${esc((p.code + p.status).toLowerCase())}">
          <td><b>${esc(p.code)}</b></td><td>${esc(p.description)}</td><td>${esc(p.discount)}</td>
          <td>${esc(p.service)}</td><td>${esc(p.usage)}</td><td>${badge(p.status)}</td>
          <td class="text-nowrap">
            <button class="btn btn-sm btn-outline-secondary" data-action="edit-promo" data-id="${p.id}"><i class="bi bi-pencil"></i></button>
            <button class="btn btn-sm btn-outline-danger" data-action="delete-promo" data-id="${p.id}"><i class="bi bi-trash"></i></button>
          </td></tr>`).join(''));
  },

  notifications() {
    return toolbar('notifSearch',
      `<button class="btn btn-sm btn-primary" data-action="send-notification"><i class="bi bi-plus-lg"></i> Send</button>`)
      + tableWrap('Notifications', '',
        '<th>User</th><th>Title</th><th>Body</th><th>Type</th><th>Time</th>',
        (D.notifications || []).map((n) => `<tr data-search="${esc((n.userName+' '+n.user_id+' '+n.title+' '+n.body+' '+n.type).toLowerCase())}">
          <td>${esc(n.userName || n.user_id)}</td><td>${esc(n.title)}</td>
          <td class="small">${esc(n.body)}</td><td>${esc(n.type)}</td>
          <td class="small">${n.created_at ? new Date(n.created_at).toLocaleString() : '—'}</td>
        </tr>`).join(''));
  },

  chat() {
    return tableWrap('Conversations', '',
      '<th>ID</th><th>Type</th><th>Messages</th><th>Updated</th>',
      (D.conversations || []).map((c) => `<tr data-search="${esc((c.id+' '+c.type+' '+c.context_type).toLowerCase())}">
        <td>${c.id}</td><td>${esc(c.type || c.context_type || '—')}</td>
        <td>${c.messageCount || 0}</td>
        <td class="small">${c.updated_at ? new Date(c.updated_at).toLocaleString() : '—'}</td>
      </tr>`).join(''));
  },

  audit() {
    return toolbar('auditSearch') + tableWrap('Audit log', '',
      '<th>Time</th><th>Admin</th><th>Action</th><th>Entity</th><th>ID</th>',
      (D.audit || []).map((a) => `<tr data-search="${esc((a.action + a.adminName + a.entity_type).toLowerCase())}">
        <td class="small">${a.created_at ? new Date(a.created_at).toLocaleString() : '—'}</td>
        <td>${esc(a.adminName || a.admin_id)}</td><td>${esc(a.action)}</td>
        <td>${esc(a.entity_type)}</td><td>${a.entity_id || '—'}</td>
      </tr>`).join(''));
  },

  pricing() {
    const cs = D.commissionSettings || {};
    return `<div class="card-x p-4" style="max-width:520px">
      <h6 class="mb-3">Commission & settlement</h6>
      <form id="commissionForm">
        <div class="mb-3"><label class="form-label">Settlement cycle limit (TZS)</label>
          <input class="form-control" name="cycleLimit" type="number" value="${esc(cs.cycleLimit || 60000)}" required min="1"></div>
        <div class="mb-3"><label class="form-label">ZenjiGO commission (%)</label>
          <input class="form-control" name="percent" type="number" value="${esc(cs.percent || 20)}" required min="0" max="100" step="0.1"></div>
        <button class="btn btn-primary" type="submit">Save settings</button>
      </form>
    </div>`;
  },

  settings() {
    return `<div class="card-x p-4">
      <h6>Platform settings</h6>
      <p class="text-muted small">Stored in MySQL <code>app_settings</code>. Values below are live from the API.</p>
      <pre class="bg-light p-3 rounded small" style="max-height:400px;overflow:auto">${esc(JSON.stringify(D.settings || {}, null, 2))}</pre>
      <div class="mt-3">
        <label class="form-label">API base URL (saved in browser)</label>
        <div class="input-group" style="max-width:480px">
          <input class="form-control" id="apiBaseInput" value="${esc(API.base)}">
          <button class="btn btn-outline-primary" id="saveApiBase">Save</button>
        </div>
      </div>
    </div>`;
  }
};

/* ---------- Event binding ---------- */
function bindPageEvents() {
  // Table filter
  $$('.toolbar input[id$="Search"]').forEach((inp) => {
    inp.oninput = () => {
      const q = inp.value.toLowerCase().trim();
      $$('#content tbody tr').forEach((tr) => {
        const hay = (tr.getAttribute('data-search') || tr.textContent).toLowerCase();
        tr.classList.toggle('d-none', q && !hay.includes(q));
      });
    };
  });

  $('#btnRefreshLive')?.addEventListener('click', async (e) => { const state = loadBtn(e.currentTarget); try { await syncAll(); renderPage('live'); } finally { state.done(); } });
  $('#btnRefreshRides')?.addEventListener('click', async () => { await syncAll(); renderPage('rides'); toast('Rides refreshed'); });
  $('#btnRefreshDrivers')?.addEventListener('click', async () => { await syncAll(); renderPage('drivers'); toast('Drivers refreshed'); });
  $('#btnRefreshRiders')?.addEventListener('click', async () => { await syncAll(); renderPage('riders'); toast('Riders refreshed'); });
  $('#btnRefreshAdmins')?.addEventListener('click', async () => { await syncAll(); renderPage('admins'); toast('Admins refreshed'); });

  $('#commissionForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    try {
      await API.patch('/admin/commission-settings', {
        cycleLimit: Number(fd.get('cycleLimit')),
        percent: Number(fd.get('percent'))
      });
      toast('Commission settings saved');
      await syncAll();
      renderPage('pricing');
    } catch (err) { toast(err.message, 'danger'); }
  });

  $('#saveApiBase')?.addEventListener('click', () => {
    const v = $('#apiBaseInput')?.value?.trim();
    if (v) { localStorage.setItem('zenjigo-api-url', v); toast('API base saved. Reload the page.'); }
  });
}

/* ---------- Init ---------- */
function initAuthUI() {
  makeOtp($('#loginOtpInputs'));
  makeOtp($('#forgotOtpInputs'));

  $$('[data-auth]').forEach((b) => b.onclick = () => showAuth(b.dataset.auth));

  const toggle = $('.password-toggle');
  if (toggle) {
    toggle.onclick = () => {
      const i = $('#loginPassword');
      if (!i) return;
      i.type = i.type === 'password' ? 'text' : 'password';
      const icon = toggle.querySelector('i');
      if (icon) icon.className = 'bi ' + (i.type === 'password' ? 'bi-eye' : 'bi-eye-slash');
    };
  }

  $('#loginForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = loadBtn(e.submitter);
    try {
      const email = $('#loginEmail').value.trim();
      const password = $('#loginPassword').value;
      const d = await API.login(email, password);
      localStorage.setItem('zenjigo-admin-email', email);
      // Backend may return tokens directly or require OTP
      if (d.accessToken) {
        API.saveSession(d);
        await enterApp();
        toast('Signed in successfully');
      } else {
        $('#otpEmailLabel') && ($('#otpEmailLabel').textContent = d.maskedEmail || email);
        showAuth('otp');
        $('#loginOtpInputs input')?.focus();
        toast('Security OTP sent');
      }
    } catch (err) {
      toast(err.message, 'danger');
    } finally { btn.done(); }
  });

  $('#otpForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const inputs = $$('#loginOtpInputs input');
    if (inputs.some((i) => !i.value)) { toast('Enter the complete 6-digit OTP', 'danger'); return; }
    const btn = loadBtn(e.submitter);
    try {
      const code = inputs.map((i) => i.value).join('');
      const email = localStorage.getItem('zenjigo-admin-email') || $('#loginEmail')?.value;
      await API.verifyOtp(email, code);
      await enterApp();
      toast('Signed in successfully');
    } catch (err) {
      toast(err.message, 'danger');
    } finally { btn.done(); }
  });

  $('#logoutBtn')?.addEventListener('click', signOut);
  $('#logoutDropdown')?.addEventListener('click', signOut);

  $$('.nav-link[data-page]').forEach((a) => {
    a.addEventListener('click', (e) => {
      e.preventDefault();
      renderPage(a.dataset.page);
      $('#adminApp')?.classList.remove('sidebar-open');
    });
  });
  $$('[data-page-jump]').forEach((b) => {
    b.addEventListener('click', () => renderPage(b.dataset.pageJump));
  });

  $('#openSidebar')?.addEventListener('click', () => $('#adminApp')?.classList.add('sidebar-open'));
  $('#sidebarBackdrop')?.addEventListener('click', () => $('#adminApp')?.classList.remove('sidebar-open'));

  const applyTheme = (theme) => { document.documentElement.dataset.theme = theme; document.documentElement.setAttribute('data-bs-theme', theme); localStorage.setItem('zenjigo-theme', theme); const icon = $('#themeBtn i'); if (icon) icon.className = 'bi ' + (theme === 'dark' ? 'bi-sun' : 'bi-moon-stars'); };
  applyTheme(localStorage.getItem('zenjigo-theme') || 'light');
  $('#themeBtn')?.addEventListener('click', () => applyTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'));
  $('#globalSearch')?.addEventListener('input', (e) => { const q = e.target.value.toLowerCase().trim(); $$('#content tbody tr').forEach(tr => { const hay = (tr.getAttribute('data-search') || tr.textContent).toLowerCase(); tr.classList.toggle('d-none', Boolean(q) && !hay.includes(q)); }); });
}

document.addEventListener('DOMContentLoaded', () => {
  initAuthUI();
  // Ensure Admins nav item exists
  const nav = document.querySelector('.sidebar nav, aside nav, .sidebar-nav');
  if (nav && !nav.querySelector('[data-page="admins"]')) {
    const settingsLink = nav.querySelector('[data-page="settings"]');
    const a = document.createElement('a');
    a.className = 'nav-link';
    a.dataset.page = 'admins';
    a.innerHTML = '<i class="bi bi-shield-lock"></i><span>Admins</span>';
    if (settingsLink) settingsLink.parentNode.insertBefore(a, settingsLink);
    else nav.appendChild(a);
    a.addEventListener('click', (e) => { e.preventDefault(); renderPage('admins'); });
  }

  if (API.session()?.accessToken) {
    enterApp().catch(() => { API.clearSession(); showAuth('login'); });
  } else {
    showAuth('login');
  }
});
})();

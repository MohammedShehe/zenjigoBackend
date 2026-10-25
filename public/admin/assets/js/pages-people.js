(() => {
  'use strict';
  const Z = window.Z; const { html, raw, ico, $, $$, setHtml, F } = Z;
  const get = (p, o) => Z.api.get(p, o);
  const pageHead = (...a) => Z.pageHead(...a);
  const tbl = (cols, rows, empty) => rows.length ? html`<div class="tbl-wrap"><table class="tbl"><thead><tr>${cols.map((c) => html`<th>${c[0]}</th>`)}</tr></thead><tbody>${rows.map((r) => html`<tr>${cols.map((c) => html`<td>${c[1](r)}</td>`)}</tr>`)}</tbody></table></div>` : Z.empty(empty, '', 'inbox');
  const userStatus = (s) => Z.badge(s, s === 'suspended' ? 'Suspended' : undefined);

  /* ============================== Riders ============================== */
  const riderFields = [
    { name: 'fullName', label: 'Full name', required: true, col: 6, minLength: 3, maxLength: 120 },
    { name: 'phone', label: 'Phone number', type: 'tel', required: true, col: 6, placeholder: '+255 7XX XXX XXX' },
    { name: 'email', label: 'Email address', type: 'email', col: 12 },
    { name: 'island', label: 'Island', type: 'select', col: 4, placeholder: 'Select…', options: [{ value: 'Unguja', label: 'Unguja' }, { value: 'Pemba', label: 'Pemba' }] },
    { name: 'region', label: 'Region', col: 4, maxLength: 100 }, { name: 'district', label: 'District', col: 4, maxLength: 100 }
  ];
  Z.pages.riders = {
    title: 'Riders', subtitle: 'Customer accounts',
    async render(ctx) {
      if (ctx.args[0]) return Z.pages.riderProfile.render(ctx);
      const load = (f) => get('/admin/riders', { fresh: f }); const rows = await load(true); if (!ctx.alive()) return;
      const t = new Z.Table({
        rows, exportName: 'riders', search: (r) => `${r.fullName} ${r.phone} ${r.email || ''} ${r.referralCode || ''}`, searchPlaceholder: 'Search name, phone, email…',
        tabs: [{ key: 'all', label: 'All' }, { key: 'active', label: 'Active', fn: (r) => r.status === 'active' }, { key: 'sus', label: 'Suspended', fn: (r) => ['suspended', 'rejected'].includes(r.status) }, { key: 'debt', label: 'Owes cancellation fee', fn: (r) => Number(r.cancellationDebt) > 0 }],
        defaultSort: { key: 'joined', dir: 'desc' }, onRow: (r) => (location.hash = `#/riders/${r.id}`), onRefresh: async () => t.setRows(await load(true)),
        columns: [
          { key: 'fullName', label: 'Rider', render: (r) => Z.userCell(r.fullName, r.phone, r.photoUrl, r.id) }, { key: 'email', label: 'Email', render: (r) => r.email || html`<span class="faint">—</span>`, csv: (r) => r.email || '' },
          { key: 'area', label: 'Location', sort: (r) => r.island || '', render: (r) => [r.island, r.region].filter(Boolean).join(' · ') || html`<span class="faint">—</span>`, csv: (r) => [r.island, r.region].filter(Boolean).join(' / ') },
          { key: 'status', label: 'Status', render: (r) => userStatus(r.status) }, { key: 'totalRides', label: 'Trips', render: (r) => F.num(r.totalRides) },
          { key: 'walletBalance', label: 'Wallet', sort: (r) => Number(r.walletBalance), render: (r) => F.money(r.walletBalance), csv: (r) => r.walletBalance },
          { key: 'cancellationDebt', label: 'Fee owed', sort: (r) => Number(r.cancellationDebt), render: (r) => Number(r.cancellationDebt) ? html`<b style="color:var(--danger)">${F.money(r.cancellationDebt)}</b>` : html`<span class="faint">—</span>`, csv: (r) => r.cancellationDebt },
          { key: 'joined', label: 'Joined', sort: (r) => r.createdAt, render: (r) => html`<span class="muted nowrap">${F.date(r.createdAt)}</span>`, csv: (r) => r.createdAt }
        ]
      });
      setHtml(ctx.el, html`${pageHead('Riders', `${F.num(rows.length)} rider accounts`, html`<button class="btn btn-primary" data-act="addRider">${ico('userPlus')} Add rider</button>`)}<div class="card" id="tbl"></div>`); t.mount($('#tbl', ctx.el));
    }
  };
  Z.act('addRider', async () => {
    const r = await Z.formModal({ title: 'Add rider', subtitle: 'Create a customer account manually', fields: riderFields, submitLabel: 'Create rider', onSubmit: (v) => Z.api.post('/admin/riders', v) });
    if (r) { Z.toast('Rider created.'); if (r.id) location.hash = `#/riders/${r.id}`; else Z.reloadPage(); }
  });
  Z.pages.riderProfile = {
    async render(ctx) {
      const id = ctx.args[0]; const D = await get(`/admin/riders/${id}`, { fresh: true }); if (!ctx.alive()) return; const p = D.profile; Z.setHead(p.fullName, 'Rider'); Z._rid = D; let tab = 'overview';
      setHtml(ctx.el, html`<div class="crumbs"><a href="#/riders">Riders</a>${ico('chevR')}<span>${p.fullName}</span></div>
        <div class="card" style="margin-bottom:18px"><div class="profile-head">${Z.avatar(p.fullName, p.photoUrl, 'xl', p.id)}<div style="flex:1;min-width:240px"><div class="row wrap" style="gap:8px"><h2>${p.fullName}</h2>${userStatus(p.status)}</div><div class="muted" style="margin-top:4px">${p.phone}${p.email ? ' · ' + p.email : ''} · Joined ${F.date(p.createdAt)}</div></div>
          <div class="actions">${p.status === 'active' ? html`<button class="btn btn-soft-danger" data-act="ridSuspend">${ico('ban')} Suspend</button>` : html`<button class="btn btn-primary" data-act="ridActivate">${ico('check')} Reactivate</button>`}<button class="btn" data-act="ridEdit">${ico('edit')} Edit</button><button class="btn" data-act="ridNotify">${ico('bell')} Notify</button><button class="btn btn-ghost btn-icon" data-act="ridArchive" aria-label="Archive rider" title="Archive rider">${ico('archive')}</button></div></div>
          <div class="stat-strip"><div><small>Trips</small><b>${F.num(D.stats.total || 0)}</b></div><div><small>Completed / cancelled</small><b>${F.num(D.stats.completed || 0)} / ${F.num(D.stats.cancelled || 0)}</b></div><div><small>Total spent</small><b>${F.money(D.stats.spent)}</b></div><div><small>Wallet balance</small><b>${F.money(p.walletBalance)}</b></div><div><small>Cancellation fee owed</small><b style="color:${Number(p.cancellationDebt) ? 'var(--danger)' : 'inherit'}">${F.money(p.cancellationDebt)}</b></div></div></div>
        <div class="card"><div class="tabs" id="rTabs">${[['overview', 'Overview'], ['rides', 'Trips'], ['wallet', 'Wallet activity'], ['reports', 'Reports filed']].map(([k, l]) => html`<button class="tab ${k === tab ? 'active' : ''}" data-tab="${k}">${l}</button>`)}</div><div class="card-b" id="rBody"></div></div>`);
      const views = {
        overview: () => html`<div class="grid g-2"><div><div class="section-title">Account</div>${Z.kv([['Phone', p.phone], ['Email', p.email], ['Referral code', p.referralCode ? html`<span class="mono">${p.referralCode}</span>` : null], ['Rating', p.rating ? '★ ' + F.rating(p.rating) : null], ['Last sign-in', p.lastLoginAt ? F.dt(p.lastLoginAt) : 'Never']])}</div>
          <div><div class="section-title">Location</div>${Z.kv([['Island', p.island], ['Region', p.region], ['District', p.district], ['Ward', p.ward]])}<div class="section-title">Emergency contact</div>${Z.kv([['Name', p.emergencyName], ['Phone', p.emergencyPhone]])}</div></div>`,
        rides: () => tbl([['Ride', (r) => html`<a href="#" data-ride="${r.id}" class="mono">${r.ride_code}</a>`], ['Driver', (r) => r.driverName || '—'], ['Route', (r) => html`${F.trunc(r.pickup_address, 26)} → ${F.trunc(r.destination_address, 26)}`], ['Fare', (r) => F.money(r.final_fare ?? r.estimated_fare)], ['Payment', (r) => F.title(r.payment_method)], ['Status', (r) => Z.badge(r.status)], ['Date', (r) => F.dt(r.created_at)]], D.recentRides, 'No trips yet'),
        wallet: () => tbl([['Type', (x) => F.title(x.type)], ['Amount', (x) => F.money(x.amount)], ['Balance after', (x) => F.money(x.balance_after)], ['Method', (x) => F.title(x.payment_method || '—')], ['Status', (x) => Z.badge(x.status)], ['Note', (x) => x.description || '—'], ['Date', (x) => F.dt(x.created_at)]], D.walletTransactions, 'No wallet activity'),
        reports: () => tbl([['Driver', (x) => x.driverName || '—'], ['Reason', (x) => x.reason], ['Status', (x) => Z.badge(x.status)], ['Date', (x) => F.date(x.created_at)]], D.reportsFiled, 'This rider has not reported anyone')
      };
      const draw = () => { setHtml($('#rBody', ctx.el), views[tab]()); $$('#rTabs .tab', ctx.el).forEach((b) => b.classList.toggle('active', b.dataset.tab === tab)); }; draw();
      ctx.el.addEventListener('click', (e) => { const t = e.target.closest('#rTabs [data-tab]'); if (t) { tab = t.dataset.tab; draw(); } const r = e.target.closest('[data-ride]'); if (r) { e.preventDefault(); Z.openRide(r.dataset.ride); } });
    }
  };
  const ridStatus = async (status) => { const p = Z._rid.profile; await Z.api.patch(`/admin/riders/${p.id}/status`, { status }); Z.reloadPage(); };
  Z.act('ridSuspend', async () => { const p = Z._rid.profile; const r = await Z.confirm({ title: `Suspend ${p.fullName}?`, tone: 'danger', confirmLabel: 'Suspend rider', message: 'They will not be able to sign in or book rides until reactivated.' }); if (r) { await ridStatus('suspended'); Z.toast('Rider suspended.'); } });
  Z.act('ridActivate', async () => { await ridStatus('active'); Z.toast('Rider reactivated.'); });
  Z.act('ridNotify', () => { const p = Z._rid.profile; Z.notifyUser({ id: p.id, name: p.fullName }); });
  Z.act('ridEdit', async () => { const p = Z._rid.profile; const ok = await Z.formModal({ title: 'Edit rider', subtitle: p.fullName, fields: riderFields, values: { fullName: p.fullName, phone: p.phone, email: p.email || '', island: p.island || '', region: p.region || '', district: p.district || '' }, onSubmit: (v) => Z.api.patch(`/admin/riders/${p.id}`, v) }); if (ok) { Z.toast('Rider updated.'); Z.reloadPage(); } });
  Z.act('ridArchive', async () => { const p = Z._rid.profile; const r = await Z.confirm({ title: `Archive ${p.fullName}?`, tone: 'danger', confirmLabel: 'Archive rider', message: 'The account is removed from live data and can be restored from the Archive.', reason: { label: 'Reason (kept in the archive)', required: true } }); if (!r) return; await Z.api.del(`/admin/riders/${p.id}`, { reason: r.reason }); Z.toast('Rider archived.'); location.hash = '#/riders'; });

  /* ============================== Admins ============================== */
  const pwRule = (v) => (v.length < 10 ? 'Use at least 10 characters.' : !/[a-z]/.test(v) || !/[A-Z]/.test(v) || !/\d/.test(v) ? 'Include upper and lower case letters and a number.' : null);
  Z.pages.admins = {
    title: 'Admins & access', subtitle: 'People who can sign in to this console',
    async render(ctx) {
      const load = (f) => get('/admin/admins', { fresh: f }); const rows = await load(true); if (!ctx.alive()) return;
      const adminForm = (a) => ({ fields: [
        { name: 'fullName', label: 'Full name', required: true, col: 6, minLength: 3 }, { name: 'phone', label: 'Phone number', type: 'tel', col: 6 },
        { name: 'email', label: 'Email address', type: 'email', required: true, col: 12, hint: 'Verification codes are sent here at every sign-in.' },
        { name: 'password', label: a ? 'New password' : 'Password', type: 'password', required: !a, col: 12, strength: true, autocomplete: 'new-password', hint: a ? 'Leave blank to keep the current password.' : 'At least 10 characters with upper and lower case letters and a number.', validate: (v) => (v ? pwRule(v) : null) },
        { name: 'status', label: 'Account status', type: 'radio', col: 12, options: [{ value: 'active', label: 'Active', desc: 'Can sign in' }, { value: 'suspended', label: 'Suspended', desc: 'Sign-in blocked' }] }] });
      const t = new Z.Table({
        rows, exportName: 'admins', search: (a) => `${a.fullName} ${a.email} ${a.phone || ''}`, export: true, onRefresh: async () => t.setRows(await load(true)),
        columns: [{ key: 'fullName', label: 'Admin', render: (a) => Z.userCell(a.fullName, a.email, null, a.id) }, { key: 'phone', label: 'Phone', render: (a) => a.phone || '—' }, { key: 'status', label: 'Status', render: (a) => userStatus(a.status) },
          { key: 'lastLoginAt', label: 'Last sign-in', sort: (a) => a.lastLoginAt || '', render: (a) => a.lastLoginAt ? F.dt(a.lastLoginAt) : html`<span class="faint">Never</span>`, csv: (a) => a.lastLoginAt || '' },
          { key: 'createdAt', label: 'Added', render: (a) => F.date(a.createdAt) },
          { key: 'act', label: '', sort: false, csv: false, render: (a) => html`<div class="row" style="justify-content:flex-end"><button class="btn btn-sm" data-act="editAdmin" data-id="${a.id}">${ico('edit')} Edit</button>${a.id !== Z.me.id ? html`<button class="btn btn-sm btn-soft-danger" data-act="archiveAdmin" data-id="${a.id}" aria-label="Archive ${a.fullName}">${ico('archive')}</button>` : html`<span class="badge nodot">You</span>`}</div>` }]
      });
      setHtml(ctx.el, html`${pageHead('Admins & access', 'Every admin signs in with a password and an emailed one-time code. All actions are recorded in the audit log.', html`<button class="btn btn-primary" data-act="addAdmin">${ico('plus')} Add admin</button>`)}<div class="card" id="tbl"></div>`); t.mount($('#tbl', ctx.el));
      Z._admins = rows; Z._adminForm = adminForm;
    }
  };
  Z.act('addAdmin', async () => { const d = Z._adminForm(null); const ok = await Z.formModal({ title: 'Add admin', subtitle: 'Grant someone access to this console', ...d, values: { status: 'active' }, submitLabel: 'Create admin', onSubmit: (v) => Z.api.post('/admin/admins', v) }); if (ok) { Z.toast('Admin created.'); Z.reloadPage(); } });
  Z.act('editAdmin', async ({ id }) => { const a = Z._admins.find((x) => String(x.id) === id); const d = Z._adminForm(a); const ok = await Z.formModal({ title: 'Edit admin', subtitle: a.email, ...d, values: { fullName: a.fullName, phone: a.phone || '', email: a.email, status: a.status }, onSubmit: (v) => { if (!v.password) delete v.password; if (a.id === Z.me.id) delete v.status; return Z.api.patch(`/admin/admins/${a.id}`, v); } }); if (ok) { Z.toast('Admin updated.'); Z.reloadPage(); } });
  Z.act('archiveAdmin', async ({ id }) => { const a = Z._admins.find((x) => String(x.id) === id); const r = await Z.confirm({ title: `Remove ${a.fullName}’s access?`, tone: 'danger', confirmLabel: 'Archive admin', message: 'They can no longer sign in. The account can be restored from the Archive.', reason: { label: 'Reason', required: true } }); if (!r) return; await Z.api.del(`/admin/admins/${a.id}`, { reason: r.reason }); Z.toast('Admin archived.'); Z.reloadPage(); });

  /* ============================== Parcels ============================== */
  Z.pages.parcels = {
    title: 'Parcels', subtitle: 'Parcel delivery requests',
    async render(ctx) {
      const load = (f) => get('/admin/parcels', { fresh: f }); const rows = await load(true); if (!ctx.alive()) return;
      const open = (p) => Z.drawer({ title: `Parcel ${p.parcel_code}`, subtitle: F.dt(p.created_at), body: html`<div class="row" style="gap:8px;margin-bottom:14px">${Z.badge(p.status)}</div>
        <div class="section-title">Route</div><div class="route"><div><b>${p.pickup_address}</b><small>Pickup${p.pickup_at ? ' · ' + F.dt(p.pickup_at) : ''}</small></div><div class="to"><b>${p.delivery_address}</b><small>Delivery</small></div></div>
        <div class="section-title">Parcel</div>${Z.kv([['Description', p.description], ['Weight', p.weight_kg != null ? `${p.weight_kg} kg` : null], ['Estimated fare', p.estimated_fare != null ? F.money(p.estimated_fare) : null], ['Final fare', p.final_fare != null ? F.money(p.final_fare) : null]])}
        <div class="section-title">People</div><div class="grid g-2"><div class="card card-b" style="padding:14px"><small class="muted">Sender</small>${Z.userCell(p.riderName, '', null, p.rider_id)}<a class="btn btn-sm" style="margin-top:8px" href="#/riders/${p.rider_id}" data-close>View rider</a></div><div class="card card-b" style="padding:14px"><small class="muted">Driver</small>${p.driver_id ? html`${Z.userCell(p.driverName, '', null, p.driver_id)}<a class="btn btn-sm" style="margin-top:8px" href="#/drivers/${p.driver_id}" data-close>View driver</a>` : html`<p class="muted">Waiting for a driver to accept</p>`}</div></div>
        <div class="section-title">Last updated</div><p>${F.dt(p.updated_at)}</p>` });
      const t = new Z.Table({
        rows, exportName: 'parcels', search: (p) => `${p.parcel_code} ${p.riderName} ${p.driverName || ''} ${p.pickup_address} ${p.delivery_address} ${p.description}`, searchPlaceholder: 'Search code, sender, address…',
        tabs: [{ key: 'all', label: 'All' }, { key: 'pending', label: 'Awaiting driver', fn: (p) => p.status === 'pending', hot: true }, { key: 'live', label: 'In progress', fn: (p) => ['assigned', 'picked_up', 'in_transit'].includes(p.status) }, { key: 'done', label: 'Delivered', fn: (p) => p.status === 'delivered' }, { key: 'cx', label: 'Cancelled', fn: (p) => p.status === 'cancelled' }],
        defaultSort: { key: 'date', dir: 'desc' }, onRow: open, onRefresh: async () => t.setRows(await load(true)),
        columns: [{ key: 'parcel_code', label: 'Parcel', render: (p) => html`<b class="mono">${p.parcel_code}</b>` }, { key: 'riderName', label: 'Sender' }, { key: 'driverName', label: 'Driver', render: (p) => p.driverName || html`<span class="faint">Unassigned</span>`, csv: (p) => p.driverName || '' },
          { key: 'route', label: 'Route', sort: false, render: (p) => html`<div style="max-width:260px"><div style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${p.pickup_address}</div><div class="faint" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">→ ${p.delivery_address}</div></div>`, csv: (p) => `${p.pickup_address} -> ${p.delivery_address}` },
          { key: 'description', label: 'Contents', render: (p) => F.trunc(p.description, 36) }, { key: 'weight_kg', label: 'Weight', render: (p) => (p.weight_kg != null ? p.weight_kg + ' kg' : '—') },
          { key: 'fare', label: 'Fare', sort: (p) => Number(p.final_fare ?? p.estimated_fare ?? 0), render: (p) => (p.final_fare ?? p.estimated_fare) != null ? F.money(p.final_fare ?? p.estimated_fare) : '—', csv: (p) => p.final_fare ?? p.estimated_fare ?? '' },
          { key: 'status', label: 'Status', render: (p) => Z.badge(p.status) }, { key: 'date', label: 'Created', sort: (p) => p.created_at, render: (p) => html`<span class="muted nowrap">${F.dt(p.created_at)}</span>`, csv: (p) => p.created_at }],
        empty: Z.empty('No parcel requests yet', 'Parcel deliveries booked by riders will appear here.', 'package')
      });
      setHtml(ctx.el, html`${pageHead('Parcels', `${F.num(rows.length)} parcel requests`)}<div class="card" id="tbl"></div>`); t.mount($('#tbl', ctx.el));
    }
  };

  /* ============================== Tours ============================== */
  Z.pages.tours = {
    title: 'Tours', subtitle: 'Tour packages and bookings',
    async render(ctx) {
      const [pk, bk] = await Promise.all([get('/admin/tour-packages', { fresh: true }), get('/admin/tour-bookings', { fresh: true })]); if (!ctx.alive()) return;
      const fields = (p) => [
        { name: 'name', label: 'Package name', required: true, col: 12, maxLength: 150 }, { name: 'description', label: 'Description', type: 'textarea', col: 12, rows: 4, hint: 'Shown to riders when they browse tours.' },
        { name: 'base_price', label: 'Price (per booking)', type: 'money', required: true, col: 4, min: 0 }, { name: 'duration_hours', label: 'Duration (hours)', type: 'number', required: true, col: 4, min: 0.5, step: 0.5 }, { name: 'max_tourists', label: 'Max tourists', type: 'number', required: true, col: 4, min: 1, max: 60 },
        { name: 'pickup_notes', label: 'Pickup notes', col: 12, maxLength: 500, hint: 'e.g. Meet at the hotel lobby.' }, { name: 'image_url', label: 'Image URL', type: 'url', col: 12, hint: 'Optional. A public https link to a photo.' },
        { name: 'is_active', label: 'Visible to riders', type: 'switch', hint: 'Turn off to hide this package without deleting it.' }];
      let view = 'bookings';
      const draw = () => {
        setHtml($('#tb', ctx.el), view === 'bookings' ? '' : '');
        if (view === 'bookings') {
          const t = new Z.Table({ rows: bk, exportName: 'tour-bookings', search: (b) => `${b.booking_code} ${b.packageName} ${b.riderName} ${b.driverName || ''}`, defaultSort: { key: 'date', dir: 'desc' },
            tabs: [{ key: 'all', label: 'All' }, { key: 'pending', label: 'Needs a driver', fn: (b) => b.status === 'pending', hot: true }, { key: 'upcoming', label: 'Assigned', fn: (b) => b.status === 'assigned' }, { key: 'prog', label: 'In progress', fn: (b) => b.status === 'in_progress' }, { key: 'done', label: 'Completed', fn: (b) => b.status === 'completed' }, { key: 'cx', label: 'Cancelled', fn: (b) => b.status === 'cancelled' }],
            columns: [{ key: 'booking_code', label: 'Booking', render: (b) => html`<b class="mono">${b.booking_code}</b>` }, { key: 'packageName', label: 'Package' }, { key: 'riderName', label: 'Customer', render: (b) => html`${b.riderName}<div class="muted" style="font-size:12.5px">${b.riderPhone}</div>`, csv: (b) => b.riderName }, { key: 'driverName', label: 'Driver', render: (b) => b.driverName || html`<span class="faint">Unassigned</span>`, csv: (b) => b.driverName || '' },
              { key: 'pickup_location', label: 'Pickup', render: (b) => html`${F.trunc(b.pickup_location, 30)}<div class="muted" style="font-size:12.5px">${F.dt(b.pickup_at)}</div>`, csv: (b) => b.pickup_location }, { key: 'tourists', label: 'Guests' }, { key: 'total_amount', label: 'Total', render: (b) => F.money(b.total_amount), sort: (b) => Number(b.total_amount), csv: (b) => b.total_amount }, { key: 'status', label: 'Status', render: (b) => Z.badge(b.status) }, { key: 'date', label: 'Booked', sort: (b) => b.created_at, render: (b) => html`<span class="muted nowrap">${F.date(b.created_at)}</span>`, csv: (b) => b.created_at }],
            empty: Z.empty('No tour bookings yet', 'Bookings made by riders appear here.', 'compass') });
          t.mount($('#tb', ctx.el));
        } else {
          setHtml($('#tb', ctx.el), pk.length ? html`<div class="card-b"><div class="grid g-3">${pk.map((p) => html`<div class="card" style="overflow:hidden">${Z.safeUrl(p.image_url) ? html`<img src="${Z.safeUrl(p.image_url)}" alt="" style="width:100%;height:150px;object-fit:cover" loading="lazy" referrerpolicy="no-referrer">` : html`<div style="height:90px;background:linear-gradient(135deg,var(--brand-50),var(--info-50));display:grid;place-items:center;color:var(--brand-700)">${ico('compass')}</div>`}
            <div class="card-b"><div class="row between"><h3 style="font-size:16px">${p.name}</h3>${Z.badge(p.is_active ? 'active' : 'paused', p.is_active ? 'Live' : 'Hidden')}</div><p class="muted" style="margin:6px 0 12px;min-height:40px">${F.trunc(p.description || 'No description', 110)}</p>
            <div class="row wrap" style="gap:14px;font-size:13px;color:var(--text-2)"><span><b style="color:var(--text)">${F.money(p.base_price)}</b></span><span>${ico('clock')} ${Number(p.duration_hours)} h</span><span>${ico('users')} up to ${p.max_tourists}</span></div>
            <div class="row" style="margin-top:14px"><button class="btn btn-sm" data-act="editTour" data-id="${p.id}">${ico('edit')} Edit</button>${p.is_active ? html`<button class="btn btn-sm btn-soft-danger" data-act="hideTour" data-id="${p.id}">Hide</button>` : html`<button class="btn btn-sm btn-soft" data-act="showTour" data-id="${p.id}">Publish</button>`}</div></div></div>`)}</div></div>` : Z.empty('No tour packages', 'Create a package so riders can book tours.', 'compass', html`<button class="btn btn-primary" style="margin-top:14px" data-act="addTour">${ico('plus')} New package</button>`));
        }
        $$('[data-v]', ctx.el).forEach((b) => b.classList.toggle('active', b.dataset.v === view));
      };
      setHtml(ctx.el, html`${pageHead('Tours', `${pk.length} packages · ${bk.length} bookings`, html`<button class="btn btn-primary" data-act="addTour">${ico('plus')} New package</button>`)}<div class="card"><div class="tabs"><button class="tab" data-v="bookings">Bookings <span class="c ${bk.some((b) => b.status === 'pending') ? 'hot' : ''}">${bk.length}</span></button><button class="tab" data-v="packages">Packages <span class="c">${pk.length}</span></button></div><div id="tb"></div></div>`);
      draw();
      ctx.el.addEventListener('click', (e) => { const b = e.target.closest('[data-v]'); if (b) { view = b.dataset.v; draw(); } });
      Z._tours = pk; Z._tourFields = fields;
    }
  };
  const tourPayload = (v) => ({ name: v.name, description: v.description, base_price: v.base_price, duration_hours: v.duration_hours, max_tourists: v.max_tourists, pickup_notes: v.pickup_notes, image_url: v.image_url, is_active: v.is_active });
  Z.act('addTour', async () => { const ok = await Z.formModal({ title: 'New tour package', fields: Z._tourFields ? Z._tourFields() : [], values: { is_active: true, duration_hours: 4, max_tourists: 6 }, submitLabel: 'Create package', onSubmit: (v) => Z.api.post('/admin/tour-packages', tourPayload(v)) }); if (ok) { Z.toast('Tour package created. Riders were notified.'); Z.reloadPage(); } });
  Z.act('editTour', async ({ id }) => { const p = Z._tours.find((x) => String(x.id) === id); const ok = await Z.formModal({ title: 'Edit tour package', subtitle: p.name, fields: Z._tourFields(p), values: { ...p, base_price: Number(p.base_price), duration_hours: Number(p.duration_hours), is_active: !!p.is_active, description: p.description || '', pickup_notes: p.pickup_notes || '', image_url: p.image_url || '' }, onSubmit: (v) => Z.api.patch(`/admin/tour-packages/${p.id}`, tourPayload(v)) }); if (ok) { Z.toast('Tour package updated.'); Z.reloadPage(); } });
  Z.act('hideTour', async ({ id }) => { const p = Z._tours.find((x) => String(x.id) === id); const r = await Z.confirm({ title: `Hide “${p.name}”?`, message: 'Riders will no longer see this package. Existing bookings are not affected.', confirmLabel: 'Hide package' }); if (r) { await Z.api.del(`/admin/tour-packages/${id}`); Z.toast('Package hidden.'); Z.reloadPage(); } });
  Z.act('showTour', async ({ id }) => { await Z.api.patch(`/admin/tour-packages/${id}`, { is_active: true }); Z.toast('Package is live.'); Z.reloadPage(); });
})();

(() => {
  'use strict';
  const Z = window.Z; const { html, raw, ico, $, $$, setHtml, F } = Z;
  const get = (p, o) => Z.api.get(p, o);
  const pageHead = (...a) => Z.pageHead(...a);

  const DOC_LABEL = { drivers_license: 'Driver’s licence', national_id: 'National ID', insurance: 'Vehicle insurance', vehicle_photo: 'Vehicle photo', driver_photo: 'Driver photo', other: 'Other document' };
  const docLabel = (t) => DOC_LABEL[t] || F.title(t);
  const REQUIRED_DOCS = ['drivers_license', 'national_id', 'insurance'];
  const isPlaceholder = (u) => !u || /^pending-upload:/.test(u);
  const REJECT_DOC = ['Image is blurry or unreadable', 'Document has expired', 'Name does not match the application', 'Wrong document type uploaded', 'Document appears altered', 'Page is cropped or incomplete'];
  const REJECT_DRIVER = ['Required documents are missing or invalid', 'Identity could not be verified', 'Vehicle does not meet requirements', 'Duplicate or fraudulent application'];

  const expiryBadge = (d) => {
    if (!d) return raw('<span class="faint">No expiry</span>');
    const n = F.daysTo(d);
    if (n < 0) return html`<span class="badge badge-danger">Expired ${F.date(d)}</span>`;
    if (n <= 30) return html`<span class="badge badge-warn">Expires in ${n} d · ${F.date(d)}</span>`;
    return html`<span class="badge badge-success">Valid until ${F.date(d)}</span>`;
  };
  const driverStatus = (p) => {
    const s = p.applicationStatus || p.application_status;
    if (s === 'active') return Z.badge('active', 'Active');
    if (s === 'approved') return Z.badge('approved', 'Approved');
    if (s === 'rejected') return html`<span class="badge badge-danger">${(p.userStatus || p.status) === 'suspended' ? 'Rejected / suspended' : 'Rejected'}</span>`;
    if (s === 'under_review') return Z.badge('under_review', 'Under review');
    return Z.badge('pending', 'Pending review');
  };
  Z.driverStatusBadge = driverStatus;

  /* ====================== Document viewer (modal) ====================== */
  function normDoc(d) {
    return { id: d.id, driverId: d.driverId ?? d.driver_id, driverName: d.driverName, type: d.documentType ?? d.document_type, url: d.url, resourceType: d.resourceType ?? d.resource_type, expiresAt: d.expiresAt ?? d.expires_at, status: d.status, reason: d.rejectionReason ?? d.rejection_reason, verifiedAt: d.verifiedAt ?? d.verified_at, verifiedBy: d.verifiedByName, createdAt: d.createdAt ?? d.created_at, newer: d.newerCount || 0 };
  }
  Z.openDocument = (list, index = 0, onChange) => {
    list = list.map(normDoc); let i = index; let zoom = 1, rot = 0;
    const m = Z.modal({ title: 'Document review', size: 'xl', body: '', footer: '' });
    function preview(d) {
      const url = Z.safeUrl(d.url);
      if (isPlaceholder(d.url) || !url) return html`<div class="v-empty">${ico('file')}<p><b style="color:#fff">No file uploaded</b></p><p>The driver has not uploaded this document yet. Only a reference number and expiry date were recorded.</p></div>`;
      const pdf = d.resourceType === 'raw' || /\.pdf(\?|$)/i.test(url);
      if (pdf) return html`<iframe src="${url}" title="Document preview" referrerpolicy="no-referrer"></iframe>`;
      return html`<img id="vImg" src="${url}" alt="${docLabel(d.type)}" referrerpolicy="no-referrer" style="transform:scale(${zoom}) rotate(${rot}deg)" data-zoom>`;
    }
    function draw() {
      const d = list[i]; const url = Z.safeUrl(d.url); const real = !isPlaceholder(d.url) && url;
      const pdf = real && (d.resourceType === 'raw' || /\.pdf(\?|$)/i.test(url));
      m.title(`${docLabel(d.type)} · ${d.driverName || 'Driver #' + d.driverId}`);
      m.body(html`<div class="viewer" style="margin:0 -24px -20px">
        <div class="v-stage"><div class="v-tools">
          <button class="btn btn-sm" data-v="prev" ${i === 0 ? raw('disabled') : ''}>${ico('chevL')} Prev</button><span style="color:#9fb0cf;align-self:center;font-size:12.5px;padding:0 6px">${i + 1} of ${list.length}</span><button class="btn btn-sm" data-v="next" ${i === list.length - 1 ? raw('disabled') : ''}>Next ${ico('chevR')}</button>
          ${real && !pdf ? html`<button class="btn btn-sm btn-icon" data-v="zin" aria-label="Zoom in">${ico('zoomIn')}</button><button class="btn btn-sm btn-icon" data-v="zout" aria-label="Zoom out">${ico('zoomOut')}</button><button class="btn btn-sm btn-icon" data-v="rot" aria-label="Rotate">${ico('rotate')}</button>` : ''}
          ${real ? html`<a class="btn btn-sm" href="${url}" target="_blank" rel="noopener noreferrer">${ico('ext')} Open original</a>` : ''}</div>
          <div class="v-canvas" id="vCanvas">${preview(d)}</div></div>
        <div class="v-side">
          <div class="row between"><h4 style="font-size:16px">${docLabel(d.type)}</h4>${d.newer ? html`<span class="badge badge-warn">Superseded</span>` : Z.badge(d.status)}</div>
          ${d.status === 'rejected' && d.reason ? html`<div class="banner danger" style="margin-top:12px">${ico('xCircle')}<div><b>Rejected</b><span>${d.reason}</span></div></div>` : ''}
          ${d.expiresAt && F.daysTo(d.expiresAt) < 0 && d.status !== 'rejected' ? html`<div class="banner danger" style="margin-top:12px">${ico('alert')}<div><b>This document has expired</b><span>Approving an expired document is not recommended. Ask the driver for a renewed copy.</span></div></div>` : ''}${d.newer ? html`<div class="banner warn" style="margin-top:12px">${ico('info')}<div><b>Newer version on file</b><span>The driver uploaded a replacement for this document type.</span></div></div>` : ''}
          <div class="section-title">Details</div>
          ${Z.kv([['Driver', html`<a href="#/drivers/${d.driverId}" data-close>${d.driverName || '#' + d.driverId}</a>`], ['Expiry', expiryBadge(d.expiresAt)], ['Uploaded', F.dt(d.createdAt)], ['Reviewed', d.verifiedAt ? `${F.dt(d.verifiedAt)}${d.verifiedBy ? ' by ' + d.verifiedBy : ''}` : 'Not yet reviewed']])}
          <div class="section-title">Verification checklist</div>
          <ul style="margin:0;padding-left:18px;color:var(--text-2);line-height:1.8"><li>Photo is clear and the whole document is visible</li><li>Name matches the driver’s application</li><li>Document is valid and not expired</li><li>Numbers match what the driver entered</li></ul>
          <div class="section-title">Decision</div>
          <div class="row wrap" style="gap:8px">
            ${d.status !== 'approved' ? Z.spinBtn(html`${ico('check')} Approve`, 'btn-primary', `data-v="approve" ${real ? '' : 'disabled title="No file to approve"'}`) : ''}
            ${d.status !== 'rejected' ? html`<button class="btn btn-soft-danger" data-v="reject">${ico('x')} Reject…</button>` : ''}
            ${d.status !== 'pending' ? html`<button class="btn" data-v="pending">${ico('undo')} Back to pending</button>` : ''}</div>
          <p class="faint" style="font-size:12px;margin-top:10px">The driver is notified of every decision. Use ← → keys to move between documents.</p></div></div>`);
      m.foot('');
      $('[data-foot]', m.el)?.remove();
    }
    async function setStatus(status, reason, btn) {
      const d = list[i];
      await Z.busy(btn, async () => { await Z.api.patch(`/admin/documents/${d.id}/status`, { status, reason }); d.status = status; d.reason = status === 'rejected' ? reason : null; d.verifiedAt = new Date().toISOString(); d.verifiedBy = Z.me.fullName; });
      Z.toast(`${docLabel(d.type)} ${status === 'approved' ? 'approved' : status === 'rejected' ? 'rejected' : 'set back to pending'}. The driver was notified.`);
      Z.refreshQueues(); onChange && onChange(list[i]);
      if (status !== 'pending' && i < list.length - 1 && list[i + 1].status === 'pending') i++;
      draw();
    }
    m.el.addEventListener('click', async (e) => {
      const b = e.target.closest('[data-v]'); if (!b) return; const v = b.dataset.v;
      if (v === 'prev' && i > 0) { i--; zoom = 1; rot = 0; draw(); }
      else if (v === 'next' && i < list.length - 1) { i++; zoom = 1; rot = 0; draw(); }
      else if (v === 'zin' || v === 'zout' || v === 'rot') { if (v === 'zin') zoom = Math.min(4, zoom + 0.25); if (v === 'zout') zoom = Math.max(0.5, zoom - 0.25); if (v === 'rot') rot = (rot + 90) % 360; const im = $('#vImg', m.el); if (im) im.style.transform = `scale(${zoom}) rotate(${rot}deg)`; }
      else if (v === 'approve') { try { await setStatus('approved', '', b); } catch (err) { Z.toast(err.message, 'error'); } }
      else if (v === 'pending') { try { await setStatus('pending', '', b); } catch (err) { Z.toast(err.message, 'error'); } }
      else if (v === 'reject') {
        const r = await Z.confirm({ title: 'Reject this document?', message: 'The driver will be told why and can upload a new one.', confirmLabel: 'Reject document', tone: 'danger', reason: { label: 'Reason shown to the driver', required: true, presets: REJECT_DOC, placeholder: 'Explain what is wrong…' } });
        if (r) { try { await setStatus('rejected', r.reason, null); } catch (err) { Z.toast(err.message, 'error'); } }
      }
    });
    const key = (e) => { if (!document.body.contains(m.el)) return document.removeEventListener('keydown', key); if (e.target.closest('textarea,input,select')) return; if (e.key === 'ArrowLeft' && i > 0) { i--; zoom = 1; rot = 0; draw(); } if (e.key === 'ArrowRight' && i < list.length - 1) { i++; zoom = 1; rot = 0; draw(); } };
    document.addEventListener('keydown', key);
    draw();
  };

  /* ====================== Driver forms ====================== */
  const vehicleFields = (v = {}) => [
    { name: 'vehicleType', label: 'Vehicle type', type: 'radio', required: true, col: 12, options: [{ value: 'boda', label: 'Boda', desc: 'Motorcycle' }, { value: 'bajaji', label: 'Bajaji', desc: 'Three-wheeler' }, { value: 'taxi', label: 'Taxi', desc: 'Car' }] },
    { name: 'plateNumber', label: 'Plate number', required: true, col: 6, placeholder: 'e.g. Z 123 AB', maxLength: 20, transform: (x) => x.toUpperCase(), pattern: '^[A-Za-z0-9 \\-]{3,20}$', patternMsg: 'Use letters, numbers, spaces or dashes.' },
    { name: 'make', label: 'Make', col: 6, placeholder: 'e.g. Toyota', maxLength: 60 },
    { name: 'model', label: 'Model', col: 4, placeholder: 'e.g. Vitz', maxLength: 60 },
    { name: 'color', label: 'Colour', col: 4, placeholder: 'e.g. White', maxLength: 40 },
    { name: 'year', label: 'Model year', type: 'number', col: 4, min: 1980, max: new Date().getFullYear() + 1, placeholder: String(new Date().getFullYear()) }
  ];
  const personFields = [
    { name: 'fullName', label: 'Full name', required: true, col: 6, minLength: 3, maxLength: 120, autocomplete: 'off' },
    { name: 'phone', label: 'Phone number', type: 'tel', required: true, col: 6, placeholder: '+255 7XX XXX XXX', hint: 'Used to sign in on the driver app.' },
    { name: 'email', label: 'Email address', type: 'email', required: true, col: 6 },
    { name: 'nationalId', label: 'National ID (NIDA) number', col: 6, maxLength: 60 },
    { name: 'homeAddress', label: 'Home address', col: 12, maxLength: 250 }
  ];
  Z.addDriver = async () => {
    const res = await Z.wizard({
      title: 'Register a driver', subtitle: 'Create a driver account on their behalf', size: 'lg', submitLabel: 'Create driver',
      reviewIntro: html`<div class="banner info" style="margin-bottom:6px">${ico('info')}<div><b>Documents are uploaded by the driver</b><span>After the account exists the driver uploads photos of their documents in the app. You then review them under Document review.</span></div></div>`,
      steps: [
        { title: 'Driver', desc: 'Personal details as they appear on the driver’s ID.', fields: personFields },
        { title: 'Vehicle', desc: 'The vehicle the driver will use for trips.', fields: vehicleFields() },
        { title: 'Documents', desc: 'Record reference numbers and expiry dates so renewals are tracked.', sections: [
          { title: 'Driving licence', fields: [{ name: 'licenseNumber', label: 'Licence number', col: 6 }, { name: 'licenseExpiresAt', label: 'Licence expiry', type: 'date', col: 6 }] },
          { title: 'Insurance', fields: [{ name: 'insuranceNumber', label: 'Policy number', col: 6 }, { name: 'insuranceExpiresAt', label: 'Insurance expiry', type: 'date', col: 6 }] },
          { title: 'Application status', fields: [{ name: 'status', label: 'Initial status', type: 'radio', required: true, col: 12, options: [{ value: 'under_review', label: 'Under review', desc: 'Driver cannot go online yet' }, { value: 'active', label: 'Approve now', desc: 'Driver can go online immediately' }] }] }] }
      ],
      values: { vehicleType: 'boda', status: 'under_review' },
      onSubmit: (v) => Z.api.post('/admin/drivers', { ...v, vehicleType: v.vehicleType })
    });
    if (res && res.id) { Z.toast('Driver account created.'); location.hash = `#/drivers/${res.id}`; Z.reloadPage(); } else if (res) { Z.toast('Driver account created.'); Z.reloadPage(); }
  };
  Z.editDriver = async (p, v) => {
    const ok = await Z.formModal({
      title: 'Edit driver', subtitle: p.full_name || p.fullName, size: 'lg',
      values: { fullName: p.full_name, phone: p.phone, email: p.email || '', nationalId: p.national_id || '', homeAddress: p.home_address || '', vehicleType: p.vehicleType || 'boda', plateNumber: p.plateNumber || '', make: p.make || '', model: p.model || '', color: p.color || '', year: p.year || null },
      sections: [{ title: 'Personal details', fields: personFields }, { title: 'Vehicle', fields: vehicleFields() }],
      onSubmit: (vals) => Z.api.patch(`/admin/drivers/${p.id}`, vals)
    });
    if (ok) { Z.toast('Driver updated.'); Z.reloadPage(); }
  };
  Z.notifyUser = async (u) => {
    const ok = await Z.formModal({
      title: 'Send notification', subtitle: `To ${u.name}`, size: 'sm', submitLabel: 'Send notification',
      fields: [{ name: 'title', label: 'Title', required: true, maxLength: 150, col: 12 }, { name: 'body', label: 'Message', type: 'textarea', required: true, maxLength: 500, col: 12, hint: 'Delivered as a push notification and in-app message.' }],
      onSubmit: (v) => Z.api.post('/admin/notifications', { audience: 'user', userId: u.id, title: v.title, body: v.body })
    });
    if (ok) Z.toast('Notification sent.');
  };

  /* ====================== Drivers list ====================== */
  Z.pages.drivers = {
    title: 'Drivers', subtitle: 'Applications, verification and fleet status',
    async render(ctx) {
      if (ctx.args[0]) return Z.pages.driverProfile.render(ctx);
      const load = (fresh) => get('/admin/drivers', { fresh });
      const rows = await load(true); if (!ctx.alive()) return;
      const t = new Z.Table({
        rows, exportName: 'drivers', search: (r) => `${r.fullName} ${r.phone} ${r.email || ''} ${r.driverCode} ${r.plateNumber || ''}`, searchPlaceholder: 'Search name, phone, plate, code…',
        tabs: [{ key: 'all', label: 'All' }, { key: 'review', label: 'Needs review', fn: (r) => ['pending', 'under_review'].includes(r.applicationStatus), hot: true }, { key: 'active', label: 'Active', fn: (r) => ['active', 'approved'].includes(r.applicationStatus) }, { key: 'online', label: 'Online now', fn: (r) => r.online && r.applicationStatus === 'active' }, { key: 'rej', label: 'Rejected / suspended', fn: (r) => r.applicationStatus === 'rejected' }, { key: 'docs', label: 'Document issues', fn: (r) => r.pendingDocsCount > 0 || r.expiredDocsCount > 0 || r.expiringSoonCount > 0 }],
        filters: [{ key: 'v', label: 'Vehicle', options: ['boda', 'bajaji', 'taxi'], fn: (r, v) => r.vehicleType === v }],
        defaultSort: { key: 'joined', dir: 'desc' }, onRow: (r) => (location.hash = `#/drivers/${r.id}`), onRefresh: async () => { t.setRows(await load(true)); Z.toast('Drivers refreshed.'); },
        columns: [
          { key: 'fullName', label: 'Driver', render: (r) => Z.userCell(r.fullName, `${r.phone} · ${r.driverCode}`, r.photoUrl, r.id) },
          { key: 'vehicle', label: 'Vehicle', sort: (r) => r.plateNumber || '', render: (r) => r.vehicleType ? html`<div>${Z.typeBadge(r.vehicleType)} <b class="mono">${r.plateNumber}</b></div><div class="faint" style="font-size:12px">${[r.make, r.model, r.color].filter(Boolean).join(' ') || '—'}</div>` : '—', csv: (r) => `${r.vehicleType || ''} ${r.plateNumber || ''}` },
          { key: 'applicationStatus', label: 'Status', render: (r) => html`${driverStatus(r)}${r.online && r.applicationStatus === 'active' ? html` <span class="badge badge-success nodot" title="Online">● Online</span>` : ''}`, csv: (r) => r.applicationStatus },
          { key: 'docs', label: 'Documents', sort: (r) => r.pendingDocsCount + r.expiredDocsCount * 10, render: (r) => r.expiredDocsCount ? html`<span class="badge badge-danger">${r.expiredDocsCount} expired</span>` : r.pendingDocsCount ? html`<span class="badge badge-warn">${r.pendingDocsCount} to review</span>` : r.expiringSoonCount ? html`<span class="badge badge-warn">${r.expiringSoonCount} expiring</span>` : html`<span class="badge badge-success nodot">OK</span>`, csv: (r) => `${r.pendingDocsCount} pending / ${r.expiredDocsCount} expired` },
          { key: 'rating', label: 'Rating', sort: (r) => Number(r.rating), render: (r) => html`★ ${F.rating(r.rating)}` },
          { key: 'totalRides', label: 'Trips', render: (r) => F.num(r.totalRides) },
          { key: 'commissionOwed', label: 'Commission owed', sort: (r) => Number(r.commissionOwed), render: (r) => html`${Number(r.commissionOwed) > 0 ? html`<b>${F.money(r.commissionOwed)}</b>` : html`<span class="faint">—</span>`}${r.financeBlocked ? html` <span class="badge badge-danger nodot">Blocked</span>` : ''}`, csv: (r) => r.commissionOwed },
          { key: 'joined', label: 'Joined', sort: (r) => r.createdAt, render: (r) => html`<span class="nowrap muted">${F.date(r.createdAt)}</span>`, csv: (r) => r.createdAt }
        ]
      });
      setHtml(ctx.el, html`${pageHead('Drivers', `${F.num(rows.length)} registered drivers`, html`<button class="btn btn-primary" data-act="addDriver">${ico('userPlus')} Add driver</button>`)}<div class="card" id="tbl"></div>`); t.mount($('#tbl', ctx.el));
    }
  };
  Z.act('addDriver', () => Z.addDriver());

  /* ====================== Driver profile ====================== */
  Z.pages.driverProfile = {
    async render(ctx) {
      const id = ctx.args[0]; const D = await get(`/admin/drivers/${id}`, { fresh: true }); if (!ctx.alive()) return;
      const p = D.profile; const st = p.application_status; let tab = location.hash.split('?tab=')[1] || 'overview';
      const pendingDocs = D.documents.filter((d) => d.status === 'pending' && !isPlaceholder(d.url) && !D.documents.some((x) => x.document_type === d.document_type && x.id > d.id && ['approved', 'pending'].includes(x.status)));
      const pendingReqs = D.changeRequests.filter((c) => c.status === 'pending'); const openReports = D.reports.filter((r) => r.status === 'open');
      const f = D.financials || {}; const owed = Number(f.commission_owed || 0);
      Z.setHead(p.full_name, `Driver · ${p.driver_code}`);
      ctx.el.dataset.driver = id;
      const actions = [];
      if (['pending', 'under_review', 'approved'].includes(st)) actions.push(html`<button class="btn btn-primary" data-act="drvApprove" data-id="${id}">${ico('check')} Approve driver</button>`);
      if (st === 'rejected') actions.push(html`<button class="btn btn-primary" data-act="drvApprove" data-id="${id}">${ico('check')} Reactivate</button>`);
      if (['pending', 'under_review', 'approved'].includes(st)) actions.push(html`<button class="btn btn-soft-danger" data-act="drvReject" data-id="${id}">${ico('x')} Reject</button>`);
      if (st === 'active') actions.push(html`<button class="btn btn-soft-danger" data-act="drvSuspend" data-id="${id}">${ico('ban')} Suspend</button>`);
      if (st === 'pending') actions.push(html`<button class="btn" data-act="drvReview" data-id="${id}">Mark under review</button>`);
      const header = html`<div class="crumbs"><a href="#/drivers">Drivers</a>${ico('chevR')}<span>${p.full_name}</span></div>
        <div class="card" style="margin-bottom:18px"><div class="profile-head">${Z.avatar(p.full_name, p.photo_url, 'xl', p.id)}
          <div style="flex:1;min-width:240px"><div class="row wrap" style="gap:8px"><h2>${p.full_name}</h2>${driverStatus({ applicationStatus: st, status: p.status })}${p.online && st === 'active' ? html`<span class="badge badge-success">Online</span>` : ''}${f.blocked ? html`<span class="badge badge-danger">Blocked — unpaid commission</span>` : ''}</div>
            <div class="muted" style="margin-top:4px">${p.phone}${p.email ? ' · ' + p.email : ''} · Joined ${F.date(p.created_at)}</div>
            ${p.rejection_reason && st === 'rejected' ? html`<div class="banner danger" style="margin-top:12px">${ico('xCircle')}<div><b>Reason on file</b><span>${p.rejection_reason}</span></div></div>` : ''}</div>
          <div class="actions">${actions}<button class="btn" data-act="drvEdit">${ico('edit')} Edit</button><button class="btn" data-act="drvNotify">${ico('bell')} Notify</button><button class="btn btn-ghost btn-icon" data-act="drvArchive" aria-label="Archive driver" title="Archive driver">${ico('archive')}</button></div></div>
          <div class="stat-strip"><div><small>Rating</small><b>★ ${F.rating(p.rating)}</b></div><div><small>Total trips</small><b>${F.num(p.total_rides)}</b></div><div><small>Completed / cancelled</small><b>${F.num(D.stats.completed || 0)} / ${F.num(D.stats.cancelled || 0)}</b></div><div><small>Lifetime earnings</small><b>${F.money(p.total_earnings)}</b></div><div><small>Commission owed</small><b style="color:${owed ? 'var(--danger)' : 'inherit'}">${F.money(owed)}</b></div></div></div>
        ${(pendingDocs.length || pendingReqs.length || openReports.length) ? html`<div class="banner warn" style="margin-bottom:18px">${ico('alert')}<div><b>Waiting for your review</b><span>${[pendingDocs.length ? `${pendingDocs.length} document${pendingDocs.length > 1 ? 's' : ''}` : '', pendingReqs.length ? `${pendingReqs.length} change request${pendingReqs.length > 1 ? 's' : ''}` : '', openReports.length ? `${openReports.length} open report${openReports.length > 1 ? 's' : ''}` : ''].filter(Boolean).join(' · ')}</span></div></div>` : ''}
        <div class="card"><div class="tabs" id="dTabs">${[['overview', 'Overview'], ['documents', `Documents`, D.documents.filter((d) => d.status === 'pending' && !isPlaceholder(d.url)).length], ['vehicle', 'Vehicles'], ['trips', 'Trips'], ['finance', 'Finance'], ['feedback', 'Reviews & reports', openReports.length], ['requests', 'Change requests', pendingReqs.length]].map(([k, l, n]) => html`<button class="tab ${k === tab ? 'active' : ''}" data-tab="${k}">${l}${n ? html`<span class="c hot">${n}</span>` : ''}</button>`)}</div><div class="card-b" id="dBody"></div></div>`;
      setHtml(ctx.el, header);

      const docCard = (d, idx) => { const url = Z.safeUrl(d.url); const real = !isPlaceholder(d.url) && url; const img = real && d.resource_type !== 'raw' && !/\.pdf/i.test(url);
        const sup = D.documents.some((x) => x.document_type === d.document_type && x.id > d.id && ['approved', 'pending'].includes(x.status));
        return html`<button class="card" style="text-align:left;padding:14px;display:flex;gap:14px;align-items:center;width:100%" data-doc="${idx}"><span class="thumb" style="width:64px;height:64px">${img ? html`<img src="${url}" alt="" style="width:100%;height:100%;object-fit:cover" loading="lazy" referrerpolicy="no-referrer">` : ico(real ? 'file' : 'upload')}</span>
          <span style="flex:1;min-width:0"><b>${docLabel(d.document_type)}</b><span style="display:block;margin:4px 0">${sup ? html`<span class="badge badge-warn">Superseded</span>` : real ? Z.badge(d.status) : html`<span class="badge">Awaiting upload</span>`}</span><span class="muted" style="font-size:12.5px;display:block">${expiryBadge(d.expires_at)}</span><span class="faint" style="font-size:12px">Uploaded ${F.date(d.created_at)}</span></span>${ico('chevR')}</button>`; };
      const tbl = (cols, rows, empty) => rows.length ? html`<div class="tbl-wrap"><table class="tbl"><thead><tr>${cols.map((c) => html`<th>${c[0]}</th>`)}</tr></thead><tbody>${rows.map((r) => html`<tr>${cols.map((c) => html`<td>${c[1](r)}</td>`)}</tr>`)}</tbody></table></div>` : Z.empty(empty, '', 'inbox');
      const views = {
        overview: () => html`<div class="grid g-2"><div><div class="section-title">Personal</div>${Z.kv([['Driver code', html`<span class="mono">${p.driver_code}</span>`], ['Phone', p.phone], ['Email', p.email], ['National ID', p.national_id], ['Home address', p.home_address], ['Last sign-in', p.last_login_at ? F.dt(p.last_login_at) : 'Never'], ['Approved on', p.approved_at ? F.dt(p.approved_at) : null]])}</div>
          <div><div class="section-title">Vehicle</div>${p.plateNumber ? Z.kv([['Type', Z.typeBadge(p.vehicleType)], ['Plate', html`<b class="mono">${p.plateNumber}</b>`], ['Make / model', [p.make, p.model].filter(Boolean).join(' ')], ['Colour', p.color], ['Year', p.year]]) : html`<span class="muted">No vehicle on file.</span>`}
            <div class="section-title">Required documents</div>${REQUIRED_DOCS.map((t) => { const latest = D.documents.find((d) => d.document_type === t); return html`<div class="row between" style="padding:7px 0;border-bottom:1px solid var(--border)"><span>${docLabel(t)}</span>${!latest ? html`<span class="badge badge-danger">Missing</span>` : isPlaceholder(latest.url) ? html`<span class="badge">Awaiting upload</span>` : Z.badge(latest.status)}</div>`; })}</div></div>`,
        documents: () => D.documents.length ? html`<div class="grid g-2">${D.documents.map(docCard)}</div>` : Z.empty('No documents uploaded', 'The driver has not uploaded any documents yet.', 'file'),
        vehicle: () => tbl([['Type', (v) => Z.typeBadge(v.type)], ['Plate', (v) => html`<b class="mono">${v.plateNumber}</b>`], ['Make / model', (v) => [v.make, v.model].filter(Boolean).join(' ') || '—'], ['Colour', (v) => v.color || '—'], ['Year', (v) => v.year || '—'], ['Status', (v) => Z.badge(v.status)]], D.vehicles, 'No vehicles registered'),
        trips: () => html`${tbl([['Ride', (r) => html`<a href="#" data-ride="${r.id}" class="mono">${r.ride_code}</a>`], ['Rider', (r) => r.riderName], ['Route', (r) => html`${F.trunc(r.pickup_address, 28)} → ${F.trunc(r.destination_address, 28)}`], ['Fare', (r) => F.money(r.final_fare ?? r.estimated_fare)], ['Status', (r) => Z.badge(r.status)], ['Date', (r) => F.dt(r.created_at)]], D.recentRides, 'No trips yet')}`,
        finance: () => html`<div class="grid g-2"><div><div class="section-title">Commission account</div>${Z.kv([['Commission owed', html`<b>${F.money(owed)}</b>`], ['Account status', f.blocked ? html`<span class="badge badge-danger">Blocked</span>` : html`<span class="badge badge-success">In good standing</span>`], ['Gross since last settlement', F.money(f.gross_since_settlement)], ['Lifetime gross', F.money(f.lifetime_gross)], ['Lifetime commission', F.money(f.lifetime_commission)], ['Autopay', f.autopay_enabled ? 'Enabled' : 'Off']])}
          ${owed > 0 ? html`<button class="btn btn-primary" style="margin-top:14px" data-act="drvSettle">${ico('cash')} Record cash / bank settlement</button>` : ''}</div>
          <div><div class="section-title">Payout requests</div>${tbl([['Amount', (x) => F.money(x.amount)], ['Method', (x) => F.title(x.method)], ['Status', (x) => Z.badge(x.status)], ['Requested', (x) => F.date(x.created_at)]], D.payouts, 'No payout requests')}</div></div>
          <div class="section-title">Commission settlements</div>${tbl([['#', (x) => x.id], ['Commission', (x) => F.money(x.commission_amount)], ['Paid', (x) => F.money(x.paid_amount)], ['Provider', (x) => F.title(x.provider || 'admin')], ['Reference', (x) => html`<span class="mono">${x.external_reference || '—'}</span>`], ['Status', (x) => Z.badge(x.status)], ['Date', (x) => F.dt(x.paid_at || x.created_at)]], D.settlements, 'No settlements yet')}`,
        feedback: () => html`<div class="section-title">Rider reviews</div>${tbl([['Rating', (r) => html`<b>${'★'.repeat(r.stars)}</b><span class="faint">${'★'.repeat(5 - r.stars)}</span>`], ['Comment', (r) => r.feedback || html`<span class="faint">No comment</span>`], ['Rider', (r) => r.riderName || '—'], ['Date', (r) => F.date(r.created_at)]], D.reviews, 'No reviews yet')}
          <div class="section-title">Safety reports against this driver</div>${tbl([['Reason', (r) => r.reason], ['Reported by', (r) => r.reporterName || '—'], ['Status', (r) => Z.badge(r.status)], ['Date', (r) => F.date(r.created_at)]], D.reports, 'No reports')}`,
        requests: () => html`${D.changeRequests.length ? tbl([['Type', (c) => F.title(c.request_type)], ['Field', (c) => F.title(c.field_name)], ['Requested', (c) => c.request_type === 'document' ? 'New document file' : c.request_type === 'vehicle' ? 'Vehicle details' : F.trunc(c.new_value, 50)], ['Status', (c) => Z.badge(c.status)], ['Date', (c) => F.dt(c.created_at)]], D.changeRequests, '') : Z.empty('No change requests', 'Requests the driver submits from the app will appear here.', 'inbox')}${pendingReqs.length ? html`<a class="btn btn-primary" style="margin-top:14px" href="#/requests">Review ${pendingReqs.length} pending request${pendingReqs.length > 1 ? 's' : ''}</a>` : ''}`
      };
      const draw = () => { setHtml($('#dBody', ctx.el), views[tab]()); $$('#dTabs .tab', ctx.el).forEach((b) => b.classList.toggle('active', b.dataset.tab === tab)); };
      draw();
      ctx.el.addEventListener('click', (e) => {
        const t = e.target.closest('#dTabs [data-tab]'); if (t) { tab = t.dataset.tab; draw(); return; }
        const dd = e.target.closest('[data-doc]'); if (dd) { const list = D.documents.map((d) => ({ ...d, driverName: p.full_name, newerCount: D.documents.filter((x) => x.document_type === d.document_type && x.id > d.id && ['approved', 'pending'].includes(x.status)).length })); Z.openDocument(list, +dd.dataset.doc, () => Z.reloadPage()); return; }
        const r = e.target.closest('[data-ride]'); if (r) { e.preventDefault(); Z.openRide(r.dataset.ride); }
      });
      ctx.driver = D; Z._drv = { D, id };
    }
  };
  const setStatus = async (id, status, reason) => { await Z.api.patch(`/admin/drivers/${id}/status`, { status, reason }); Z.refreshQueues(); Z.reloadPage(); };
  Z.act('drvApprove', async (d) => {
    const { D } = Z._drv; const missing = REQUIRED_DOCS.filter((t) => { const x = D.documents.find((y) => y.document_type === t && !isPlaceholder(y.url)); return !x || x.status !== 'approved'; });
    const r = await Z.confirm({ title: 'Approve this driver?', tone: 'ok', confirmLabel: 'Approve driver', message: missing.length ? `Not every required document is approved yet (${missing.map(docLabel).join(', ')}). You can still approve, but consider reviewing them first.` : 'All required documents are approved. The driver will be notified and can go online.' });
    if (r) { await setStatus(d.id, 'active'); Z.toast('Driver approved and notified.'); }
  });
  Z.act('drvReject', async (d) => { const r = await Z.confirm({ title: 'Reject this application?', tone: 'danger', confirmLabel: 'Reject application', message: 'The driver will see the reason you give.', reason: { label: 'Reason shown to the driver', required: true, presets: REJECT_DRIVER } }); if (r) { await setStatus(d.id, 'rejected', r.reason); Z.toast('Application rejected.'); } });
  Z.act('drvSuspend', async (d) => { const r = await Z.confirm({ title: 'Suspend this driver?', tone: 'danger', confirmLabel: 'Suspend driver', message: 'They will be taken offline immediately and cannot take trips until reactivated.', reason: { label: 'Reason shown to the driver', required: true, presets: ['Safety complaints under investigation', 'Repeated policy violations', 'Documents expired', 'Unpaid commission'] } }); if (r) { await setStatus(d.id, 'suspended', r.reason); Z.toast('Driver suspended.'); } });
  Z.act('drvReview', async (d) => { await setStatus(d.id, 'under_review'); Z.toast('Marked as under review.'); });
  Z.act('drvEdit', () => Z.editDriver(Z._drv.D.profile));
  Z.act('drvNotify', () => { const p = Z._drv.D.profile; Z.notifyUser({ id: p.id, name: p.full_name }); });
  Z.act('drvArchive', async () => {
    const p = Z._drv.D.profile; const r = await Z.confirm({ title: `Archive ${p.full_name}?`, tone: 'danger', confirmLabel: 'Archive driver', message: 'The account is removed from live data and can no longer sign in. You can restore it from the Archive page.', reason: { label: 'Reason (kept in the archive)', required: true } });
    if (!r) return; await Z.api.del(`/admin/drivers/${p.id}`, { reason: r.reason }); Z.toast('Driver archived.'); Z.refreshQueues(); location.hash = '#/drivers';
  });
  Z.act('drvSettle', async () => {
    const p = Z._drv.D.profile; const owed = Number(Z._drv.D.financials.commission_owed);
    const ok = await Z.formModal({ title: 'Record settlement', subtitle: `${p.full_name} owes ${F.money(owed)}`, size: 'sm', submitLabel: 'Record settlement',
      fields: [{ name: 'reference', label: 'Payment reference', col: 12, maxLength: 120, placeholder: 'Receipt or transfer number', hint: 'Cash receipt, bank slip or mobile-money transaction ID.' }, { name: 'note', label: 'Note', type: 'textarea', col: 12, maxLength: 300 }],
      onSubmit: async (v) => {
        try {
          await Z.api.post(`/admin/drivers/${p.id}/settle`, v);
        } catch (err) {
          const msg = (err && err.message) || '';
          if (msg.includes('awaiting confirmation') || msg.includes('force=true')) {
            const forceOk = await Z.confirm({
              title: 'Pending mobile-money payment',
              tone: 'warn',
              confirmLabel: 'Record cash payment anyway',
              message: 'A mobile-money charge is still awaiting confirmation for this driver. If the driver paid cash (or the mobile prompt failed/expired), you can override and record this cash payment. The pending mobile charge will be closed as settled by admin.'
            });
            if (!forceOk) throw err;
            await Z.api.post(`/admin/drivers/${p.id}/settle`, { ...v, force: true });
          } else {
            throw err;
          }
        }
      } });
    if (ok) { Z.toast('Settlement recorded. Commission balance updated.'); Z.reloadPage(); }
  });

  /* ====================== Document review queue ====================== */
  Z.pages.documents = {
    title: 'Document review', subtitle: 'Verify driver documents before they can drive',
    async render(ctx) {
      const load = (f) => get('/admin/documents', { fresh: f });
      let rows = await load(true); if (!ctx.alive()) return;
      const isPh = (r) => isPlaceholder(r.url);
      const t = new Z.Table({
        rows, exportName: 'documents', search: (r) => `${r.driverName} ${r.driverPhone} ${docLabel(r.documentType)}`, searchPlaceholder: 'Search driver or document type…',
        tabs: [{ key: 'pending', label: 'To review', fn: (r) => r.status === 'pending' && !isPh(r) && !r.newerCount, hot: true }, { key: 'exp', label: 'Expiring / expired', fn: (r) => r.expiresAt && !r.newerCount && r.status !== 'rejected' && F.daysTo(r.expiresAt) <= 30 }, { key: 'ok', label: 'Approved', fn: (r) => r.status === 'approved' }, { key: 'rej', label: 'Rejected', fn: (r) => r.status === 'rejected' }, { key: 'wait', label: 'Awaiting upload', fn: isPh }, { key: 'all', label: 'All' }],
        filters: [{ key: 'type', label: 'Type', options: Object.entries(DOC_LABEL).map(([value, label]) => ({ value, label })), fn: (r, v) => r.documentType === v }],
        defaultSort: { key: 'up', dir: 'asc' }, onRefresh: async () => { rows = await load(true); t.setRows(rows); },
        onRow: (r) => { const list = t.filtered; Z.openDocument(list, list.indexOf(r), async () => { rows = await load(true); t.setRows(rows); }); },
        columns: [
          { key: 'doc', label: 'Document', sort: (r) => r.documentType, render: (r) => { const u = Z.safeUrl(r.url); const img = !isPh(r) && u && r.resourceType !== 'raw' && !/\.pdf/i.test(u); return html`<div class="cell-user"><span class="thumb">${img ? html`<img src="${u}" alt="" style="width:100%;height:100%;object-fit:cover" loading="lazy" referrerpolicy="no-referrer">` : ico(isPh(r) ? 'upload' : 'file')}</span><div><b>${docLabel(r.documentType)}</b><span>${isPh(r) ? 'No file yet' : r.resourceType === 'raw' ? 'PDF' : 'Image'}</span></div></div>`; }, csv: (r) => docLabel(r.documentType) },
          { key: 'driverName', label: 'Driver', render: (r) => html`<a href="#/drivers/${r.driverId}" data-stop><b>${r.driverName}</b></a><div class="muted" style="font-size:12.5px">${r.driverPhone}</div>` },
          { key: 'status', label: 'Status', render: (r) => r.newerCount ? html`<span class="badge badge-warn">Superseded</span>` : isPh(r) ? html`<span class="badge">Awaiting upload</span>` : html`${Z.badge(r.status)}${r.status === 'rejected' && r.rejectionReason ? html`<div class="faint" style="font-size:12px;max-width:220px">${F.trunc(r.rejectionReason, 60)}</div>` : ''}` },
          { key: 'expiresAt', label: 'Expiry', sort: (r) => r.expiresAt || '9999', render: (r) => expiryBadge(r.expiresAt), csv: (r) => r.expiresAt || '' },
          { key: 'up', label: 'Uploaded', sort: (r) => r.createdAt, render: (r) => html`<span class="muted nowrap">${F.dt(r.createdAt)}</span>`, csv: (r) => r.createdAt },
          { key: 'rev', label: 'Reviewed by', sort: false, render: (r) => r.verifiedByName ? html`${r.verifiedByName}<div class="faint" style="font-size:12px">${F.ago(r.verifiedAt)}</div>` : '—', csv: (r) => r.verifiedByName || '' },
          { key: 'act', label: '', sort: false, csv: false, render: (r) => html`<button class="btn btn-sm ${r.status === 'pending' && !isPh(r) ? 'btn-primary' : ''}">${r.status === 'pending' && !isPh(r) ? 'Review' : 'View'}</button>` }
        ]
      });
      setHtml(ctx.el, html`${pageHead('Document review', 'Open a document to preview it full size, then approve or reject with a reason. Drivers are notified automatically.')}<div class="card" id="tbl"></div>`); t.mount($('#tbl', ctx.el));
    }
  };

  /* ====================== Driver change requests ====================== */
  const FIELD_LABEL = { full_name: 'Full name', phone: 'Phone number', email: 'Email address', home_address: 'Home address', national_id: 'National ID' };
  const VEH_LABEL = { vehicleType: 'Vehicle type', plateNumber: 'Plate number', vehicleMake: 'Make', vehicleModel: 'Model', vehicleColor: 'Colour', modelYear: 'Model year' };
  const reqTitle = (c) => c.request_type === 'profile' ? `Change ${FIELD_LABEL[c.field_name] || F.title(c.field_name)}` : c.request_type === 'vehicle' ? 'Update vehicle details' : `Replace ${docLabel(c.field_name.toLowerCase().replace(/\s+/g, '_'))}`;
  Z.pages.requests = {
    title: 'Driver requests', subtitle: 'Profile, vehicle and document changes sent by drivers',
    async render(ctx) {
      const load = (f) => get('/admin/change-requests', { fresh: f });
      let rows = await load(true); if (!ctx.alive()) return;
      const open = (c) => {
        const url = Z.safeUrl(c.new_value); const meta = c.meta || {};
        let diff;
        if (c.request_type === 'profile') diff = html`<div class="diff"><div class="old"><small>Current</small>${c.currentValue ?? '—'}</div><div class="arrow">${ico('chevR')}</div><div class="new"><small>Requested</small><b>${c.new_value}</b></div></div>`;
        else if (c.request_type === 'vehicle') { const n = c.newValueParsed || {}; const cur = c.currentValue || {}; diff = html`<table class="tbl"><thead><tr><th>Field</th><th>Current</th><th>Requested</th></tr></thead><tbody>${Object.keys(VEH_LABEL).filter((k) => n[k]).map((k) => html`<tr><td>${VEH_LABEL[k]}</td><td class="muted">${cur[k] ?? '—'}</td><td><b>${n[k]}</b></td></tr>`)}</tbody></table>`; }
        else diff = html`<div class="grid g-2"><div class="card card-b" style="padding:12px"><small class="muted">Current document</small>${c.currentValue ? html`<div style="margin:6px 0">${Z.badge(c.currentValue.status)} ${expiryBadge(c.currentValue.expiresAt)}</div>${Z.safeUrl(c.currentValue.url) ? html`<a href="${Z.safeUrl(c.currentValue.url)}" target="_blank" rel="noopener noreferrer">Open current file ${ico('ext')}</a>` : ''}` : html`<p class="muted">None on file</p>`}</div>
          <div class="card card-b" style="padding:12px"><small class="muted">New upload</small>${url ? (meta.resourceType === 'raw' || /\.pdf/i.test(url) ? html`<p style="margin:8px 0">PDF document</p>` : html`<img src="${url}" alt="New document" style="width:100%;max-height:220px;object-fit:contain;border-radius:8px;margin-top:6px;background:var(--surface-3)" referrerpolicy="no-referrer">`) : html`<p class="muted">No file attached</p>`}<div style="margin-top:6px">${meta.expiresAt ? expiryBadge(meta.expiresAt) : ''}</div>${url ? html`<a href="${url}" target="_blank" rel="noopener noreferrer">Open full size ${ico('ext')}</a>` : ''}</div></div>`;
        const h = Z.drawer({ title: reqTitle(c), subtitle: `${c.driverName} · ${F.dt(c.created_at)}`, size: 'lg', body: html`<div class="row wrap" style="gap:8px;margin-bottom:12px">${Z.badge(c.status)}<span class="badge nodot">${F.title(c.request_type)}</span></div>
          <div class="section-title">${c.request_type === 'document' ? 'Comparison' : 'Requested change'}</div>${diff}
          <div class="section-title">Driver’s reason</div><p>${c.reason || html`<span class="muted">No reason given.</span>`}</p>
          <div class="section-title">Driver</div>${Z.userCell(c.driverName, `${c.driverPhone} · ${c.driverCode || ''}`, null, c.driver_id)}<a class="btn btn-sm" style="margin-top:10px" href="#/drivers/${c.driver_id}" data-close>Open driver profile</a>
          ${c.status !== 'pending' ? html`<div class="section-title">Outcome</div>${Z.kv([['Decision', Z.badge(c.status)], ['Reviewed by', c.reviewedByName], ['Reviewed', c.reviewed_at ? F.dt(c.reviewed_at) : null], ['Reason', c.rejection_reason]])}` : ''}`,
          footer: c.status === 'pending' ? html`<button class="btn btn-soft-danger" data-r="rejected">${ico('x')} Reject…</button>${Z.spinBtn(html`${ico('check')} Approve and apply`, 'btn-primary', 'data-r="approved"')}` : html`<button class="btn" data-close>Close</button>` });
        h.el.addEventListener('click', async (e) => {
          const b = e.target.closest('[data-r]'); if (!b) return; let reason = '';
          if (b.dataset.r === 'rejected') { const r = await Z.confirm({ title: 'Reject this request?', tone: 'danger', confirmLabel: 'Reject request', message: 'The driver is notified with your reason.', reason: { label: 'Reason shown to the driver', required: true, presets: ['Information could not be verified', 'Please upload a clearer document', 'Request does not meet policy'] } }); if (!r) return; reason = r.reason; }
          else { const ok = await Z.confirm({ title: 'Approve and apply this change?', tone: 'ok', confirmLabel: 'Approve', message: c.request_type === 'document' ? 'The new document is added to the driver’s file as approved.' : 'The driver’s record will be updated immediately.' }); if (!ok) return; }
          try { await Z.busy(b.dataset.r === 'approved' ? b : null, () => Z.api.patch(`/admin/change-requests/${c.id}`, { status: b.dataset.r, reason })); Z.toast(`Request ${b.dataset.r}.`); h.close(); rows = await load(true); t.setRows(rows); Z.refreshQueues(); } catch (err) { Z.toast(err.message, 'error'); }
        });
      };
      const t = new Z.Table({
        rows, exportName: 'driver-requests', search: (c) => `${c.driverName} ${c.driverPhone} ${c.field_name} ${c.request_type} ${c.new_value || ''}`, searchPlaceholder: 'Search driver or request…',
        tabs: [{ key: 'pending', label: 'Pending', fn: (c) => c.status === 'pending', hot: true }, { key: 'approved', label: 'Approved', fn: (c) => c.status === 'approved' }, { key: 'rejected', label: 'Rejected', fn: (c) => c.status === 'rejected' }, { key: 'all', label: 'All' }],
        filters: [{ key: 'type', label: 'Type', options: ['profile', 'vehicle', 'document'], fn: (c, v) => c.request_type === v }],
        defaultSort: { key: 'date', dir: 'desc' }, onRow: open, onRefresh: async () => { rows = await load(true); t.setRows(rows); },
        columns: [
          { key: 'req', label: 'Request', sort: (c) => c.request_type, render: (c) => html`<b>${reqTitle(c)}</b><div class="muted" style="font-size:12.5px">${c.request_type === 'profile' ? F.trunc(c.new_value, 46) : c.request_type === 'vehicle' ? 'Vehicle details' : 'New document file'}</div>`, csv: (c) => reqTitle(c) },
          { key: 'driverName', label: 'Driver', render: (c) => html`<b>${c.driverName}</b><div class="muted" style="font-size:12.5px">${c.driverPhone}</div>` },
          { key: 'reason', label: 'Driver’s reason', sort: false, render: (c) => c.reason ? F.trunc(c.reason, 60) : html`<span class="faint">—</span>`, csv: (c) => c.reason || '' },
          { key: 'status', label: 'Status', render: (c) => Z.badge(c.status) },
          { key: 'date', label: 'Submitted', sort: (c) => c.created_at, render: (c) => html`<span class="muted nowrap">${F.dt(c.created_at)}</span>`, csv: (c) => c.created_at },
          { key: 'act', label: '', sort: false, csv: false, render: (c) => html`<button class="btn btn-sm ${c.status === 'pending' ? 'btn-primary' : ''}">${c.status === 'pending' ? 'Review' : 'View'}</button>` }
        ],
        empty: Z.empty('No driver requests yet', 'When a driver asks to change their profile, vehicle or documents from the app, it shows up here for approval.', 'inbox')
      });
      setHtml(ctx.el, html`${pageHead('Driver requests', 'Changes drivers ask for are applied only after you approve them.')}<div class="card" id="tbl"></div>`); t.mount($('#tbl', ctx.el));
    }
  };
})();

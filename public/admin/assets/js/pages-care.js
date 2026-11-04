(() => {
  'use strict';
  const Z = window.Z; const { html, raw, ico, $, $$, setHtml, F } = Z;
  const get = (p, o) => Z.api.get(p, o);
  const pageHead = (...a) => Z.pageHead(...a);
  const REDACT = /pass(word)?|hash|token|secret|otp|pin$/i;
  const redact = (v) => Array.isArray(v) ? v.map(redact) : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, REDACT.test(k) ? '[hidden]' : redact(x)])) : v;

  /* ============================== Support inbox ============================== */
  Z.pages.support = {
    title: 'Support inbox', subtitle: 'Conversations with riders and drivers',
    async render(ctx) {
      let convs = await get('/admin/conversations', { fresh: true }); if (!ctx.alive()) return;
      let sel = null; let scope = 'support'; let msgs = []; let lastCount = 0;
      const inScope = (c) => (scope === 'support' ? c.type === 'support' : c.type !== 'support');
      const name = (c) => (c.type === 'support' ? c.customerName || 'Support request' : c.title || `${F.title(c.type)} chat`);
      setHtml(ctx.el, html`${pageHead('Support inbox', 'Reply to riders and drivers who contact support', html`<button class="btn" data-act="supReadAll">${ico('checkCircle')} Mark all read</button>`)}
        <div class="card"><div class="tabs"><button class="tab active" data-sc="support">Support requests <span class="c" id="scS"></span></button><button class="tab" data-sc="other">Ride &amp; direct chats <span class="c" id="scO"></span></button></div>
        <div class="chat" id="chat"><div class="chat-list"><div class="chat-items" id="cList"></div></div><div class="chat-pane" id="cPane"></div></div></div>`);
      const drawList = () => {
        const list = convs.filter(inScope); $('#scS').textContent = convs.filter((c) => c.type === 'support').length; $('#scO').textContent = convs.filter((c) => c.type !== 'support').length;
        setHtml($('#cList'), list.length ? html`${list.map((c) => html`<button class="chat-item ${sel === c.id ? 'active' : ''}" data-c="${c.id}">${Z.avatar(name(c), null, '', c.customerId || c.id)}<div style="flex:1;min-width:0"><div class="t"><b>${F.trunc(name(c), 24)}</b><small>${c.lastMessageAt ? F.ago(c.lastMessageAt) : ''}</small></div><div class="row between"><p>${c.lastMessage || 'No messages yet'}</p>${Number(c.unreadCount) ? html`<span class="un">${c.unreadCount}</span>` : ''}</div>${c.customerRole ? html`<small class="faint">${F.title(c.customerRole)}${c.rideId ? ' · ride #' + c.rideId : ''}</small>` : ''}</div></button>`)}` : Z.empty(scope === 'support' ? 'No support requests' : 'No other chats', 'New conversations appear here.', 'chat'));
      };
      const drawPane = (keepScroll) => {
        const c = convs.find((x) => x.id === sel); const chat = $('#chat'); chat.classList.toggle('has-sel', !!c);
        if (!c) return setHtml($('#cPane'), Z.empty('Select a conversation', 'Choose a thread on the left to read and reply.', 'chat'));
        const prev = $('#cMsgs'); const atBottom = !prev || prev.scrollHeight - prev.scrollTop - prev.clientHeight < 80;
        const draft = $('#cText') ? $('#cText').value : '';
        setHtml($('#cPane'), html`<div class="chat-head"><button class="iconbtn" data-act="supBack" aria-label="Back" style="display:${innerWidth <= 1024 ? 'grid' : 'none'}">${ico('chevL')}</button>${Z.avatar(name(c), null, '', c.customerId || c.id)}<div style="flex:1;min-width:0"><b>${name(c)}</b><div class="muted" style="font-size:12.5px">${(c.members || []).map((m) => `${m.fullName} (${F.title(m.role)})`).join(', ')}</div></div>${c.customerId && c.customerRole ? html`<a class="btn btn-sm" href="#/${c.customerRole}s/${c.customerId}">View profile</a>` : ''}</div>
          <div class="chat-msgs" id="cMsgs">${msgs.length ? msgs.map((m) => html`<div class="msg ${m.isMine ? 'mine' : ''}"><span class="who">${m.isMine ? 'You' : m.senderName || 'User'}${!m.isMine && m.senderRole ? ' · ' + F.title(m.senderRole) : ''}</span>${m.text}<small>${F.dt(m.createdAt)}${m.isEdited ? ' · edited' : ''}</small></div>`) : html`<div class="empty"><p>No messages yet.</p></div>`}</div>
          <div class="chat-compose"><textarea class="textarea" id="cText" rows="1" maxlength="2000" placeholder="Write a reply… (Enter to send, Shift+Enter for a new line)" aria-label="Reply"></textarea>${Z.spinBtn(html`${ico('send')} Send`, 'btn-primary', 'id="cSend"')}</div>`);
        $('#cText').value = draft; const m = $('#cMsgs'); if (atBottom || !keepScroll) m.scrollTop = m.scrollHeight;
      };
      async function openConv(id) {
        const c = convs.find((x) => x.id === id);
        if (c.type !== 'support' && !Z._chatOk) { const r = await Z.confirm({ title: 'Open this conversation?', message: 'This is a conversation between a rider and a driver. Opening it adds you as a participant so you can read it. Only do this for safety or dispute investigations.', confirmLabel: 'Open conversation' }); if (!r) return; Z._chatOk = true; }
        sel = id; drawList(); setHtml($('#cPane'), Z.skeleton(5));
        try { msgs = await get(`/admin/conversations/${id}/messages`, { fresh: true }); lastCount = msgs.length; drawPane(); if (Number(c.unreadCount)) { await Z.api.post(`/admin/conversations/${id}/read`); c.unreadCount = 0; drawList(); Z.refreshQueues(); } }
        catch (e) { setHtml($('#cPane'), Z.errorBlock(e)); }
      }
      async function send() {
        const t = $('#cText'); const text = t.value.trim(); if (!text) return;
        await Z.busy($('#cSend'), async () => { try { const m = await Z.api.post(`/admin/conversations/${sel}/messages`, { text }); msgs.push(m && m.id ? m : { text, isMine: true, createdAt: new Date().toISOString() }); t.value = ''; drawPane(); } catch (e) { Z.toast(e.message, 'error'); } });
      }
      ctx.el.addEventListener('click', (e) => {
        const s = e.target.closest('[data-sc]'); if (s) { scope = s.dataset.sc; $$('[data-sc]').forEach((x) => x.classList.toggle('active', x === s)); sel = null; drawList(); drawPane(); return; }
        const c = e.target.closest('[data-c]'); if (c) openConv(+c.dataset.c); if (e.target.closest('#cSend')) send();
      });
      ctx.el.addEventListener('keydown', (e) => { if (e.target.id === 'cText' && e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } });
      Z.act('supBack', () => { sel = null; drawList(); drawPane(); });
      Z.act('supReadAll', async () => { await Z.api.post('/admin/conversations/mark-all-read'); Z.toast('All support threads marked as read.'); convs = await get('/admin/conversations', { fresh: true }); drawList(); Z.refreshQueues(); });
      drawList(); drawPane();
      const iv = setInterval(async () => {
        if (document.hidden || !ctx.alive()) return;
        try { convs = await get('/admin/conversations', { fresh: true }); drawList(); if (sel) { const m = await get(`/admin/conversations/${sel}/messages`, { fresh: true }); if (m.length !== lastCount) { msgs = m; lastCount = m.length; drawPane(true); const cc = convs.find((x) => x.id === sel); if (cc && Number(cc.unreadCount)) { await Z.api.post(`/admin/conversations/${sel}/read`).catch(() => {}); } } } } catch (_) {}
      }, 12000);
      ctx.onLeave(() => clearInterval(iv));
    }
  };

  /* ============================== Safety reports ============================== */
  Z.pages.reports = {
    title: 'Safety reports', subtitle: 'Reports riders filed against drivers',
    async render(ctx) {
      const load = (f) => get('/admin/driver-reports', { fresh: f }); let rows = await load(true); if (!ctx.alive()) return;
      const open = (r) => {
        const h = Z.drawer({ title: `Report #${r.id}`, subtitle: F.dt(r.created_at), body: html`<div class="row" style="gap:8px;margin-bottom:12px">${Z.badge(r.status)}</div>
          <div class="section-title">What was reported</div><p style="font-weight:600;margin-bottom:6px">${r.reason}</p><p class="muted" style="white-space:pre-wrap">${r.details || 'No additional details provided.'}</p>
          ${r.ride_id ? html`<p style="margin-top:10px"><a href="#" data-ride="${r.ride_id}">View the ride (#${r.ride_id}) ${ico('ext')}</a></p>` : ''}
          <div class="section-title">Reported driver</div>${Z.userCell(r.driver_name || 'Unknown', r.driver_phone, null, r.driver_id)}<a class="btn btn-sm" style="margin:8px 0" href="#/drivers/${r.driver_id}" data-close>Open driver profile</a>
          <div class="section-title">Reported by</div>${Z.userCell(r.reporter_name || 'Unknown', r.reporter_phone, null, r.reporter_id)}
          ${r.reviewed_at || r.admin_note ? html`<div class="section-title">Review</div>${Z.kv([['Reviewed', r.reviewed_at ? F.dt(r.reviewed_at) : null], ['Admin note', r.admin_note]])}` : ''}
          <div class="section-title">Your note</div><div class="field"><textarea class="textarea" id="rpNote" maxlength="500" placeholder="Record what you found or did (optional)…">${r.admin_note || ''}</textarea></div>`,
          footer: html`${r.status !== 'open' ? html`<button class="btn" data-s="open">${ico('undo')} Reopen</button>` : ''}${r.status !== 'dismissed' ? html`<button class="btn" data-s="dismissed">Dismiss</button>` : ''}${r.status !== 'reviewed' ? Z.spinBtn(html`${ico('check')} Mark reviewed`, 'btn-primary', 'data-s="reviewed"') : ''}` });
        h.el.addEventListener('click', async (e) => { const b = e.target.closest('[data-s]'); if (!b) return; try { await Z.busy(b, () => Z.api.patch(`/admin/driver-reports/${r.id}`, { status: b.dataset.s, note: $('#rpNote', h.el).value })); Z.toast('Report updated.'); h.close(); rows = await load(true); t.setRows(rows); Z.refreshQueues(); } catch (err) { Z.toast(err.message, 'error'); } });
        h.el.addEventListener('click', (e) => { const a = e.target.closest('[data-ride]'); if (a) { e.preventDefault(); Z.openRide(a.dataset.ride); } });
      };
      const t = new Z.Table({
        rows, exportName: 'safety-reports', search: (r) => `${r.reason} ${r.details || ''} ${r.driver_name || ''} ${r.reporter_name || ''}`, searchPlaceholder: 'Search reason, driver, rider…',
        tabs: [{ key: 'open', label: 'Open', fn: (r) => r.status === 'open', hot: true }, { key: 'rev', label: 'Reviewed', fn: (r) => r.status === 'reviewed' }, { key: 'dis', label: 'Dismissed', fn: (r) => r.status === 'dismissed' }, { key: 'all', label: 'All' }],
        defaultSort: { key: 'date', dir: 'desc' }, onRow: open, onRefresh: async () => { rows = await load(true); t.setRows(rows); },
        columns: [{ key: 'id', label: '#', render: (r) => html`<span class="mono">${r.id}</span>` }, { key: 'reason', label: 'Reason', render: (r) => html`<b>${F.trunc(r.reason, 60)}</b><div class="muted" style="font-size:12.5px">${F.trunc(r.details || '', 70)}</div>`, csv: (r) => r.reason },
          { key: 'driver_name', label: 'Driver', render: (r) => html`<a href="#/drivers/${r.driver_id}" data-stop>${r.driver_name || '—'}</a>`, csv: (r) => r.driver_name || '' }, { key: 'reporter_name', label: 'Reported by', render: (r) => r.reporter_name || '—' }, { key: 'status', label: 'Status', render: (r) => Z.badge(r.status) },
          { key: 'date', label: 'Filed', sort: (r) => r.created_at, render: (r) => html`<span class="muted nowrap">${F.dt(r.created_at)}</span>`, csv: (r) => r.created_at }, { key: 'act', label: '', sort: false, csv: false, render: (r) => html`<button class="btn btn-sm ${r.status === 'open' ? 'btn-primary' : ''}">${r.status === 'open' ? 'Review' : 'View'}</button>` }],
        empty: Z.empty('No reports filed', 'When a rider reports a driver, it appears here for review.', 'flag')
      });
      setHtml(ctx.el, html`${pageHead('Safety reports', 'Investigate rider complaints about drivers')}<div class="card" id="tbl"></div>`); t.mount($('#tbl', ctx.el));
    }
  };

  /* ============================== Notifications ============================== */
  Z.pages.notifications = {
    title: 'Notifications', subtitle: 'Message riders and drivers',
    async render(ctx) {
      const hist = await get('/admin/notifications', { fresh: true }); if (!ctx.alive()) return;
      const d = Z.dash || {}; let people = null; let chosen = null; let aud = 'all_riders';
      setHtml(ctx.el, html`${pageHead('Notifications', 'Send push notifications and review what has been sent')}
        <div class="grid g-main" style="align-items:start"><div class="card"><div class="card-h"><h3>Compose</h3></div><div class="card-b" id="compose"></div></div>
        <div class="card"><div class="card-h"><h3>Preview</h3></div><div class="card-b"><div class="card card-b" style="padding:14px;display:flex;gap:12px;background:var(--surface-2)"><img src="assets/img/zenjigo-icon.png" alt="" style="width:38px;height:38px;border-radius:9px;background:#fff;padding:3px"><div style="min-width:0"><div class="faint" style="font-size:11px">ZENJIGO · now</div><b id="pvT">Title</b><div class="muted" id="pvB" style="word-break:break-word">Your message appears here.</div></div></div><p class="faint" style="margin-top:12px;font-size:12.5px">Delivered as a push notification to devices, and saved in each person’s in-app notification list.</p></div></div></div>
        <div class="card" style="margin-top:18px"><div class="card-h"><div><h3>History</h3><small>Latest ${hist.length} notifications across the platform</small></div></div><div id="hist"></div></div>`);
      const fm = new Z.Form({ fields: [
        { name: 'audience', label: 'Send to', type: 'radio', required: true, col: 12, options: [{ value: 'all_riders', label: 'All riders', desc: `${F.num(d.riders || 0)} accounts` }, { value: 'all_drivers', label: 'All drivers', desc: `${F.num(d.drivers || 0)} accounts` }, { value: 'online_drivers', label: 'Online drivers', desc: `${F.num(d.onlineDrivers || 0)} now` }, { value: 'user', label: 'One person', desc: 'Search by name' }] },
        { name: 'title', label: 'Title', required: true, col: 12, maxLength: 150, placeholder: 'Short and clear' }, { name: 'body', label: 'Message', type: 'textarea', required: true, col: 12, maxLength: 500, rows: 4, hint: 'Up to 500 characters.' }], values: { audience: 'all_riders' } });
      setHtml($('#compose'), html`${fm.html()}<div id="userPick" class="hidden"><div class="field"><label for="upq">Recipient</label><input class="input" id="upq" placeholder="Type a name, phone or email…" autocomplete="off"><div id="upr" style="margin-top:6px"></div></div></div>
        <div class="row" style="justify-content:flex-end;margin-top:18px">${Z.spinBtn(html`${ico('send')} Send notification`, 'btn-primary', 'id="sendN"')}</div>`);
      fm.bind($('#compose'));
      const sync = () => { const v = fm.values(true); aud = v.audience; $('#userPick').classList.toggle('hidden', aud !== 'user'); $('#pvT').textContent = v.title || 'Title'; $('#pvB').textContent = v.body || 'Your message appears here.'; };
      $('#compose').addEventListener('input', sync); $('#compose').addEventListener('change', sync);
      $('#upq').addEventListener('input', Z.debounce(async (e) => {
        const q = e.target.value.trim().toLowerCase(); if (q.length < 2) return setHtml($('#upr'), '');
        if (!people) { const [dr, ri] = await Promise.all([get('/admin/drivers', { ttl: 60000 }), get('/admin/riders', { ttl: 60000 })]); people = [...dr.map((x) => ({ id: x.id, name: x.fullName, role: 'Driver', sub: x.phone })), ...ri.map((x) => ({ id: x.id, name: x.fullName, role: 'Rider', sub: x.phone }))]; }
        const m = people.filter((p) => `${p.name} ${p.sub}`.toLowerCase().includes(q)).slice(0, 6);
        setHtml($('#upr'), m.length ? html`<div class="chips">${m.map((p) => html`<button type="button" class="chip" data-pick="${p.id}" data-name="${p.name}">${p.name} · ${p.role}</button>`)}</div>` : html`<span class="muted">No matches</span>`);
      }, 250));
      $('#compose').addEventListener('click', (e) => { const p = e.target.closest('[data-pick]'); if (p) { chosen = { id: +p.dataset.pick, name: p.dataset.name }; setHtml($('#upr'), html`<span class="badge badge-success nodot">${ico('check')} ${chosen.name}</span>`); $('#upq').value = ''; } });
      $('#sendN').addEventListener('click', async (e) => {
        if (!fm.validate()) return; const v = fm.values(); if (v.audience === 'user' && !chosen) return Z.toast('Choose who should receive this notification.', 'warn');
        const who = { all_riders: `all ${F.num(d.riders || 0)} riders`, all_drivers: `all ${F.num(d.drivers || 0)} drivers`, online_drivers: 'every driver who is online', user: chosen && chosen.name }[v.audience];
        const r = await Z.confirm({ title: 'Send this notification?', message: `It will be sent to ${who}. This cannot be recalled.`, confirmLabel: 'Send now', tone: 'warn' }); if (!r) return;
        await Z.busy(e.currentTarget, async () => { try { const res = await Z.api.post('/admin/notifications', { audience: v.audience, userId: chosen && chosen.id, title: v.title, body: v.body }); Z.toast(`Sent to ${res.recipients} recipient${res.recipients === 1 ? '' : 's'}.`); Z.reloadPage(); } catch (err) { fm.formError(err.message); } });
      });
      const t = new Z.Table({ rows: hist, exportName: 'notifications', pageSize: 15, search: (n) => `${n.title} ${n.body} ${n.userName || ''} ${n.type}`, searchPlaceholder: 'Search title, message, recipient…', filters: [{ key: 'type', label: 'Type', options: [...new Set(hist.map((n) => n.type))].sort().map((x) => ({ value: x, label: F.title(x) })), fn: (n, v) => n.type === v }], defaultSort: { key: 'date', dir: 'desc' },
        columns: [{ key: 'userName', label: 'Recipient', render: (n) => n.userName || '—' }, { key: 'type', label: 'Type', render: (n) => html`<span class="badge nodot">${F.title(n.type)}</span>` }, { key: 'title', label: 'Message', render: (n) => html`<b>${F.trunc(n.title, 50)}</b><div class="muted" style="font-size:12.5px">${F.trunc(n.body, 80)}</div>`, csv: (n) => `${n.title} — ${n.body}` }, { key: 'read', label: 'Read', sort: (n) => (n.read_at ? 1 : 0), render: (n) => n.read_at ? html`<span class="badge badge-success nodot">${F.ago(n.read_at)}</span>` : html`<span class="badge nodot">Unread</span>`, csv: (n) => n.read_at || '' }, { key: 'date', label: 'Sent', sort: (n) => n.created_at, render: (n) => html`<span class="muted nowrap">${F.dt(n.created_at)}</span>`, csv: (n) => n.created_at }],
        empty: Z.empty('No notifications yet', '', 'bell') });
      t.mount($('#hist'));
    }
  };

  /* ============================== Pricing & policy ============================== */
  Z.pages.pricing = {
    title: 'Pricing & policy', subtitle: 'Fares, commission and cancellation rules',
    async render(ctx) {
      const [fare, com, can] = await Promise.all([get('/admin/fare-settings', { fresh: true }), get('/admin/commission-settings', { fresh: true }), get('/admin/cancel-settings', { fresh: true })]); if (!ctx.alive()) return;
      const cur = fare.currency || 'TZS';
      const fareForm = new Z.Form({ values: { baseFare: fare.baseFare, perKm: fare.perKm, perMinute: fare.perMinute, bookingFee: fare.bookingFee, boda: fare.multipliers.boda, bajaji: fare.multipliers.bajaji, taxi: fare.multipliers.taxi }, sections: [
        { title: 'Base charges', desc: 'Added to every ride before the vehicle multiplier.', fields: [{ name: 'baseFare', label: 'Base fare', type: 'money', required: true, min: 0, col: 6, prefix: cur }, { name: 'bookingFee', label: 'Booking fee', type: 'money', required: true, min: 0, col: 6, prefix: cur }, { name: 'perKm', label: 'Per kilometre', type: 'money', required: true, min: 0, col: 6, prefix: cur }, { name: 'perMinute', label: 'Per minute', type: 'money', required: true, min: 0, col: 6, prefix: cur }] },
        { title: 'Vehicle multipliers', desc: 'Final fare = (base + distance + time + booking fee) × multiplier.', fields: [{ name: 'boda', label: 'Boda', type: 'number', required: true, min: 0.1, step: 0.05, col: 4 }, { name: 'bajaji', label: 'Bajaji', type: 'number', required: true, min: 0.1, step: 0.05, col: 4 }, { name: 'taxi', label: 'Taxi', type: 'number', required: true, min: 0.1, step: 0.05, col: 4 }] }] });
      const comForm = new Z.Form({ values: { percent: com.percent, cycleLimit: com.cycleLimit }, fields: [{ name: 'percent', label: 'Commission rate (%)', type: 'number', required: true, min: 0, max: 100, step: 0.5, col: 6, hint: 'Share of each fare the platform keeps.' }, { name: 'cycleLimit', label: 'Settlement threshold', type: 'money', required: true, min: 1, col: 6, prefix: com.currency || cur, hint: 'Drivers owing more than this are blocked until they pay.' }] });
      const canForm = new Z.Form({ values: { nearPickupKm: can.nearPickupKm, percent: can.percent }, fields: [{ name: 'nearPickupKm', label: 'Free-cancel radius (km)', type: 'number', required: true, min: 0, max: 50, step: 0.1, col: 6, hint: 'If the driver is already this close, a fee applies.' }, { name: 'percent', label: 'Cancellation fee (% of fare)', type: 'number', required: true, min: 0, max: 100, step: 1, col: 6 }] });
      const card = (id, title, sub, form, btn) => html`<div class="card"><div class="card-h"><div><h3>${title}</h3><small>${sub}</small></div></div><div class="card-b">${form.html()}<div class="row" style="justify-content:flex-end;margin-top:6px">${Z.spinBtn(btn, 'btn-primary', `id="${id}"`)}</div></div></div>`;
      setHtml(ctx.el, html`${pageHead('Pricing & policy', 'Changes apply immediately to new quotes and cancellations. Every change is recorded in the audit log.')}
        <div class="grid g-main" style="align-items:start"><div class="stack">${card('saveFare', 'Ride fares', 'How the price of a ride is calculated', fareForm, 'Save fares')}
          <div class="grid g-2">${card('saveCom', 'Driver commission', 'What drivers owe the platform', comForm, 'Save commission')}${card('saveCan', 'Rider cancellation', 'Fee when a rider cancels near the pickup', canForm, 'Save policy')}</div></div>
        <div class="card" style="position:sticky;top:84px"><div class="card-h"><div><h3>Fare estimator</h3><small>Preview using the values entered on the left</small></div></div><div class="card-b"><div class="form-grid"><div class="field c-6"><label for="eKm">Distance (km)</label><input id="eKm" class="input" type="number" min="0" step="0.5" value="5"></div><div class="field c-6"><label for="eMin">Duration (min)</label><input id="eMin" class="input" type="number" min="0" step="1" value="15"></div></div>
          <div id="eOut" style="margin-top:16px"></div></div></div></div>`);
      [fareForm, comForm, canForm].forEach((f) => f.bind(ctx.el));
      const est = () => { const v = fareForm.values(true); const km = Number($('#eKm').value) || 0, mn = Number($('#eMin').value) || 0; const sub = (Number(v.baseFare) || 0) + km * (Number(v.perKm) || 0) + mn * (Number(v.perMinute) || 0) + (Number(v.bookingFee) || 0);
        setHtml($('#eOut'), html`${['boda', 'bajaji', 'taxi'].map((k) => html`<div class="row between" style="padding:10px 0;border-bottom:1px solid var(--border)"><span>${Z.typeBadge(k)} <span class="faint">× ${Number(v[k]) || 0}</span></span><b style="font-size:17px">${F.money(Math.round(sub * (Number(v[k]) || 0)), cur)}</b></div>`)}<p class="faint" style="font-size:12px;margin-top:10px">Subtotal before multiplier: ${F.money(sub, cur)}</p>`); };
      ctx.el.addEventListener('input', est); est();
      const save = (btnId, form, send, msg) => $(btnId).addEventListener('click', async (e) => { if (!form.validate()) return; const r = await Z.confirm({ title: 'Save these changes?', message: 'They take effect immediately for everyone.', confirmLabel: 'Save changes', tone: 'warn' }); if (!r) return; await Z.busy(e.currentTarget, async () => { try { await send(form.values()); Z.toast(msg); } catch (err) { form.formError(err.message); } }); });
      save('#saveFare', fareForm, (v) => Z.api.patch('/admin/fare-settings', { baseFare: v.baseFare, perKm: v.perKm, perMinute: v.perMinute, bookingFee: v.bookingFee, currency: cur, multipliers: { boda: v.boda, bajaji: v.bajaji, taxi: v.taxi } }), 'Fares saved. New quotes use these values now.');
      save('#saveCom', comForm, (v) => Z.api.patch('/admin/commission-settings', { percent: v.percent, cycleLimit: v.cycleLimit }), 'Commission settings saved.');
      save('#saveCan', canForm, (v) => Z.api.patch('/admin/cancel-settings', { nearPickupKm: v.nearPickupKm, percent: v.percent }), 'Cancellation policy saved.');
    }
  };

  /* ============================== Audit log ============================== */
  Z.pages.audit = {
    title: 'Audit log', subtitle: 'A record of every admin action',
    async render(ctx) {
      const rows = await get('/admin/audit-logs', { fresh: true }); if (!ctx.alive()) return;
      const open = (a) => { const det = redact(Z.parseJson(a.details)); Z.drawer({ title: F.title(a.action), subtitle: F.dt(a.created_at), body: html`${Z.kv([['Performed by', a.adminName || `Admin #${a.admin_id}`], ['Action', html`<span class="mono">${a.action}</span>`], ['Target', a.entity_type ? `${F.title(a.entity_type)}${a.entity_id ? ' #' + a.entity_id : ''}` : null], ['IP address', a.ip_address], ['When', F.dt(a.created_at)]])}<div class="section-title">Details</div>${det ? html`<pre class="json">${JSON.stringify(det, null, 2)}</pre>` : html`<p class="muted">No extra details recorded.</p>`}<p class="faint" style="font-size:12px;margin-top:10px">Sensitive fields such as passwords are never shown.</p>` }); };
      const t = new Z.Table({ rows, exportName: 'audit-log', search: (a) => `${a.action} ${a.adminName || ''} ${a.entity_type || ''} ${a.entity_id || ''}`, searchPlaceholder: 'Search action, admin, record…',
        filters: [{ key: 'action', label: 'Action', options: [...new Set(rows.map((r) => r.action))].sort().map((x) => ({ value: x, label: F.title(x) })), fn: (r, v) => r.action === v }, { key: 'admin', label: 'Admin', options: [...new Set(rows.map((r) => r.adminName).filter(Boolean))].sort(), fn: (r, v) => r.adminName === v }],
        defaultSort: { key: 'date', dir: 'desc' }, onRow: open, onRefresh: async () => t.setRows(await get('/admin/audit-logs', { fresh: true })),
        columns: [{ key: 'date', label: 'When', sort: (a) => a.created_at, render: (a) => html`<span class="nowrap">${F.dt(a.created_at)}</span>`, csv: (a) => a.created_at }, { key: 'adminName', label: 'Admin', render: (a) => a.adminName || `#${a.admin_id}` }, { key: 'action', label: 'Action', render: (a) => html`<b>${F.title(a.action)}</b>`, csv: (a) => a.action }, { key: 'entity', label: 'Target', sort: (a) => a.entity_type || '', render: (a) => a.entity_type ? html`${F.title(a.entity_type)}${a.entity_id ? html` <span class="mono faint">#${a.entity_id}</span>` : ''}` : '—', csv: (a) => `${a.entity_type || ''} ${a.entity_id || ''}` }, { key: 'ip_address', label: 'IP', render: (a) => html`<span class="mono muted">${a.ip_address || '—'}</span>` }],
        empty: Z.empty('No activity recorded', '', 'clock') });
      setHtml(ctx.el, html`${pageHead('Audit log', 'Immutable history of who changed what, and when')}<div class="card" id="tbl"></div>`); t.mount($('#tbl', ctx.el));
    }
  };

  /* ============================== Archive ============================== */
  Z.pages.archive = {
    title: 'Archive', subtitle: 'Accounts removed from live data',
    async render(ctx) {
      const load = (f) => get('/admin/archives', { fresh: f }); let rows = await load(true); if (!ctx.alive()) return;
      const open = async (a) => {
        const h = Z.drawer({ title: a.fullName, subtitle: `${F.title(a.role)} · archived ${F.dt(a.archivedAt)}`, body: Z.skeleton(5) });
        let snap = null; try { snap = redact((await get(`/admin/archives/${a.id}`, { fresh: true })).snapshot); } catch (_) {}
        const summary = snap && typeof snap === 'object' ? Object.entries(snap).filter(([, v]) => Array.isArray(v)).map(([k, v]) => [F.title(k), `${v.length} record${v.length === 1 ? '' : 's'}`]) : [];
        h.body(html`${Z.kv([['Name', a.fullName], ['Role', F.title(a.role)], ['Phone', a.phone], ['Email', a.email], ['Original ID', `#${a.originalUserId}`], ['Archived', F.dt(a.archivedAt)], ['Reason', a.archiveReason]])}
          ${summary.length ? html`<div class="section-title">Data preserved in the archive</div>${Z.kv(summary)}` : ''}
          <div class="banner info" style="margin-top:18px">${ico('info')}<div><b>Restoring</b><span>Brings the account back with its history so the person can sign in again.</span></div></div>`);
        h.foot(html`<button class="btn btn-soft-danger" data-s="del">${ico('trash')} Delete permanently…</button>${Z.spinBtn(html`${ico('undo')} Restore account`, 'btn-primary', 'data-s="restore"')}`);
        h.el.addEventListener('click', async (e) => {
          const b = e.target.closest('[data-s]'); if (!b) return;
          if (b.dataset.s === 'restore') { const r = await Z.confirm({ title: `Restore ${a.fullName}?`, tone: 'ok', confirmLabel: 'Restore', message: 'The account becomes active again.' }); if (!r) return; try { await Z.busy(b, () => Z.api.post(`/admin/archives/${a.id}/restore`)); Z.toast('Account restored.'); h.close(); rows = await load(true); t.setRows(rows); } catch (err) { Z.toast(err.message, 'error'); } }
          else { const r = await Z.confirm({ title: 'Delete permanently?', tone: 'danger', confirmLabel: 'Delete forever', message: 'This erases the archived account and its saved data. It cannot be undone.', typeToConfirm: 'DELETE' }); if (!r) return; try { await Z.api.del(`/admin/archives/${a.id}`); Z.toast('Archived account deleted.'); h.close(); rows = await load(true); t.setRows(rows); } catch (err) { Z.toast(err.message, 'error'); } }
        });
      };
      const t = new Z.Table({ rows, exportName: 'archive', search: (a) => `${a.fullName} ${a.phone} ${a.email || ''} ${a.archiveReason || ''}`,
        tabs: [{ key: 'all', label: 'All' }, { key: 'driver', label: 'Drivers', fn: (a) => a.role === 'driver' }, { key: 'rider', label: 'Riders', fn: (a) => a.role === 'rider' }, { key: 'admin', label: 'Admins', fn: (a) => a.role === 'admin' }],
        defaultSort: { key: 'date', dir: 'desc' }, onRow: open, onRefresh: async () => { rows = await load(true); t.setRows(rows); },
        columns: [{ key: 'fullName', label: 'Account', render: (a) => Z.userCell(a.fullName, a.phone, null, a.originalUserId), csv: (a) => a.fullName }, { key: 'role', label: 'Role', render: (a) => html`<span class="badge nodot">${F.title(a.role)}</span>` }, { key: 'email', label: 'Email', render: (a) => a.email || '—' }, { key: 'archiveReason', label: 'Reason', render: (a) => F.trunc(a.archiveReason || '—', 50) }, { key: 'date', label: 'Archived', sort: (a) => a.archivedAt, render: (a) => html`<span class="muted nowrap">${F.dt(a.archivedAt)}</span>`, csv: (a) => a.archivedAt }],
        empty: Z.empty('Archive is empty', 'Archived drivers, riders and admins are kept here until you restore or delete them.', 'archive') });
      setHtml(ctx.el, html`${pageHead('Archive', 'Restore an account or delete it permanently')}<div class="card" id="tbl"></div>`); t.mount($('#tbl', ctx.el));
    }
  };

  /* ============================== My account ============================== */
  Z.pages.settings = {
    title: 'My account', subtitle: 'Your profile, password and preferences',
    async render(ctx) {
      const me = await get('/admin/me', { fresh: true }); const sets = await get('/admin/settings', { fresh: true }).catch(() => ({})); if (!ctx.alive()) return;
      const pf = new Z.Form({ values: { fullName: me.fullName, phone: me.phone || '' }, fields: [{ name: 'fullName', label: 'Full name', required: true, minLength: 3, col: 12 }, { name: 'phone', label: 'Phone number', type: 'tel', col: 12 }] });
      const pw = new Z.Form({ fields: [{ name: 'currentPassword', label: 'Current password', type: 'password', required: true, col: 12, autocomplete: 'current-password' }, { name: 'newPassword', label: 'New password', type: 'password', required: true, col: 12, strength: true, autocomplete: 'new-password', hint: 'At least 10 characters with upper and lower case letters and a number.', validate: (v) => (v.length < 10 ? 'Use at least 10 characters.' : !/[a-z]/.test(v) || !/[A-Z]/.test(v) || !/\d/.test(v) ? 'Include upper and lower case letters and a number.' : null) }, { name: 'confirm', label: 'Confirm new password', type: 'password', required: true, col: 12, autocomplete: 'new-password', validate: (v, a) => (v !== a.newPassword ? 'Passwords do not match.' : null) }] });
      const keys = Object.keys(sets);
      setHtml(ctx.el, html`${pageHead('My account', 'Manage how you appear and sign in')}
        <div class="grid g-2" style="align-items:start"><div class="stack">
          <div class="card"><div class="profile-head">${Z.avatar(me.fullName, null, 'lg', me.id)}<div><h3 style="font-size:17px">${me.fullName}</h3><div class="muted">${me.email}</div><span class="badge badge-success" style="margin-top:6px">Administrator</span></div></div>
            <div class="card-b" style="border-top:1px solid var(--border)">${Z.kv([['Email', me.email], ['Member since', F.date(me.createdAt)], ['Last sign-in', me.lastLoginAt ? F.dt(me.lastLoginAt) : '—']])}</div></div>
          <div class="card"><div class="card-h"><h3>Profile</h3></div><div class="card-b">${pf.html()}<div class="row" style="justify-content:flex-end">${Z.spinBtn('Save profile', 'btn-primary', 'id="saveP"')}</div></div></div>
          <div class="card"><div class="card-h"><h3>Appearance</h3></div><div class="card-b"><div class="switch"><div><b>Dark mode</b><span>Easier on the eyes in low light</span></div><label class="tgl"><input type="checkbox" id="darkT" ${document.documentElement.dataset.theme === 'dark' ? raw('checked') : ''}><i></i></label></div></div></div></div>
        <div class="stack"><div class="card"><div class="card-h"><div><h3>Change password</h3><small>You’ll be signed out everywhere after changing it</small></div></div><div class="card-b">${pw.html()}<div class="row" style="justify-content:flex-end">${Z.spinBtn('Update password', 'btn-primary', 'id="savePw"')}</div></div></div>
          <div class="card"><div class="card-h"><div><h3>Platform settings</h3><small>Stored configuration, read-only. Edit pricing under Pricing &amp; policy.</small></div></div><div class="card-b">${keys.length ? html`<div class="stack" style="gap:10px">${keys.map((k) => html`<div><div class="mono" style="font-weight:600">${k}</div><pre class="json" style="margin-top:4px;max-height:120px">${JSON.stringify(redact(sets[k]), null, 2)}</pre></div>`)}</div>` : html`<p class="muted">No stored settings yet. Defaults from the server configuration are in use.</p>`}</div></div>
          <div class="card"><div class="card-h"><h3>Connection</h3></div><div class="card-b">${Z.kv([['API', html`<span class="mono">${Z.api.base()}</span>`], ['Session storage', Z.api.store.remembered() ? 'Kept on this device' : 'Cleared when you close the tab']])}</div></div></div></div>`);
      pf.bind(ctx.el); pw.bind(ctx.el);
      $('#darkT').addEventListener('change', () => Z.acts.theme());
      $('#saveP').addEventListener('click', (e) => { if (!pf.validate()) return; Z.busy(e.currentTarget, async () => { try { await Z.api.patch('/admin/me', pf.values()); Z.me = await get('/admin/me', { fresh: true }); Z.toast('Profile updated.'); } catch (err) { pf.formError(err.message); } }); });
      $('#savePw').addEventListener('click', (e) => { if (!pw.validate()) return; const v = pw.values(); Z.busy(e.currentTarget, async () => { try { await Z.api.post('/admin/me/password', { currentPassword: v.currentPassword, newPassword: v.newPassword }); Z.toast('Password changed. Signing you out…'); setTimeout(async () => { await Z.api.logout(); location.reload(); }, 1200); } catch (err) { pw.formError(err.message); } }); });
    }
  };
})();

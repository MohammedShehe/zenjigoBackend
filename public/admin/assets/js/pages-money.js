(() => {
  'use strict';
  const Z = window.Z; const { html, raw, ico, $, $$, setHtml, F } = Z;
  const get = (p, o) => Z.api.get(p, o);
  const pageHead = (...a) => Z.pageHead(...a);
  const kpi = (l, v, s, i, c = '') => html`<div class="card kpi"><div class="row between"><span class="label">${l}</span><span class="ico ${c}">${ico(i)}</span></div><div class="value">${v}</div>${s ? html`<div class="sub">${s}</div>` : ''}</div>`;
  const PROVIDER = (p) => F.title(String(p || '').replace('driver_commission', 'driver commission'));

  /* ============================== Finance ============================== */
  Z.pages.finance = {
    title: 'Finance', subtitle: 'Payments, wallets, commission and settlements',
    async render(ctx) {
      const [pay, bal] = await Promise.all([get('/admin/payments', { fresh: true }), get('/admin/driver-finance', { fresh: true })]); if (!ctx.alive()) return;
      const ok = pay.filter((p) => p.status === 'success'); const pend = pay.filter((p) => p.status === 'pending');
      const owed = bal.reduce((a, b) => a + Number(b.commission_owed || 0), 0); const blocked = bal.filter((b) => Number(b.blocked)).length;
      let tab = 'payments'; const cache = { payments: pay, balances: bal };
      const defs = {
        payments: { label: 'Payments', cols: () => [
          { key: 'id', label: '#', render: (p) => html`<span class="mono">${p.id}</span>` }, { key: 'userName', label: 'Customer' }, { key: 'provider', label: 'Provider', render: (p) => PROVIDER(p.provider) },
          { key: 'external_reference', label: 'Reference', render: (p) => html`<span class="mono">${p.external_reference || '—'}</span>`, csv: (p) => p.external_reference || '' },
          { key: 'amount', label: 'Amount', sort: (p) => Number(p.amount), render: (p) => html`<b>${F.money(p.amount, p.currency)}</b>`, csv: (p) => p.amount }, { key: 'status', label: 'Status', render: (p) => Z.badge(p.status) },
          { key: 'created_at', label: 'Date', sort: (p) => p.created_at, render: (p) => html`<span class="nowrap muted">${F.dt(p.created_at)}</span>`, csv: (p) => p.created_at },
          { key: 'act', label: '', sort: false, csv: false, render: (p) => p.status === 'pending' ? html`<button class="btn btn-sm btn-primary" data-act="payComplete" data-id="${p.id}">Mark paid</button>` : '' }],
          tabs: [{ key: 'all', label: 'All' }, { key: 'pending', label: 'Pending', fn: (p) => p.status === 'pending', hot: true }, { key: 'success', label: 'Successful', fn: (p) => p.status === 'success' }, { key: 'failed', label: 'Failed / cancelled', fn: (p) => ['failed', 'cancelled'].includes(p.status) }],
          search: (p) => `${p.id} ${p.userName} ${p.provider} ${p.external_reference || ''}`, url: '/admin/payments', export: 'payments' },
        wallet: { label: 'Wallet ledger', url: '/admin/wallet-transactions', export: 'wallet-ledger', search: (t) => `${t.userName} ${t.type} ${t.description || ''}`,
          filters: [{ key: 'type', label: 'Type', options: ['topup', 'ride', 'refund', 'tip', 'promo', 'withdrawal', 'adjustment'], fn: (t, v) => t.type === v }],
          cols: () => [{ key: 'userName', label: 'User', render: (t) => html`<b>${t.userName}</b><div class="faint" style="font-size:12px">${F.title(t.userRole)}</div>` }, { key: 'type', label: 'Type', render: (t) => html`<span class="badge nodot">${F.title(t.type)}</span>` },
            { key: 'amount', label: 'Amount', sort: (t) => Number(t.amount), render: (t) => html`<b style="color:${Number(t.amount) < 0 ? 'var(--danger)' : 'var(--brand-700)'}">${Number(t.amount) > 0 ? '+' : ''}${F.money(t.amount)}</b>`, csv: (t) => t.amount }, { key: 'balanceAfter', label: 'Balance after', render: (t) => F.money(t.balanceAfter), csv: (t) => t.balanceAfter },
            { key: 'paymentMethod', label: 'Method', render: (t) => F.title(t.paymentMethod || '—') }, { key: 'status', label: 'Status', render: (t) => Z.badge(t.status) }, { key: 'description', label: 'Note', render: (t) => F.trunc(t.description || '—', 40) }, { key: 'createdAt', label: 'Date', sort: (t) => t.createdAt, render: (t) => html`<span class="nowrap muted">${F.dt(t.createdAt)}</span>`, csv: (t) => t.createdAt }] },
        commission: { label: 'Commission ledger', url: '/admin/commissions', export: 'commission-ledger', search: (c) => `${c.driverName} ${c.rideId}`,
          cols: () => [{ key: 'id', label: '#', render: (c) => html`<span class="mono">${c.id}</span>` }, { key: 'driverName', label: 'Driver', render: (c) => html`<a href="#/drivers/${c.driverId}" data-stop>${c.driverName}</a>`, csv: (c) => c.driverName }, { key: 'rideId', label: 'Ride', render: (c) => html`<a href="#" data-ride="${c.rideId}" class="mono">#${c.rideId}</a>`, csv: (c) => c.rideId },
            { key: 'grossAmount', label: 'Fare', sort: (c) => Number(c.grossAmount), render: (c) => F.money(c.grossAmount), csv: (c) => c.grossAmount }, { key: 'commissionRate', label: 'Rate', render: (c) => `${Number(c.commissionRate)}%` },
            { key: 'commissionAmount', label: 'Commission', sort: (c) => Number(c.commissionAmount), render: (c) => html`<b>${F.money(c.commissionAmount)}</b>`, csv: (c) => c.commissionAmount }, { key: 'driverAmount', label: 'Driver keeps', render: (c) => F.money(c.driverAmount), csv: (c) => c.driverAmount }, { key: 'createdAt', label: 'Date', sort: (c) => c.createdAt, render: (c) => html`<span class="nowrap muted">${F.dt(c.createdAt)}</span>`, csv: (c) => c.createdAt }] },
        balances: { label: 'Driver balances', export: 'driver-balances', search: (b) => `${b.driverName} ${b.phone}`,
          tabs: [{ key: 'all', label: 'All' }, { key: 'owed', label: 'Owes commission', fn: (b) => Number(b.commission_owed) > 0 }, { key: 'blocked', label: 'Blocked', fn: (b) => Number(b.blocked) === 1, hot: true }],
          cols: () => [{ key: 'driverName', label: 'Driver', render: (b) => html`<a href="#/drivers/${b.driver_id}" data-stop><b>${b.driverName}</b></a><div class="muted" style="font-size:12.5px">${b.phone}</div>`, csv: (b) => b.driverName }, { key: 'commission_owed', label: 'Commission owed', sort: (b) => Number(b.commission_owed), render: (b) => Number(b.commission_owed) ? html`<b>${F.money(b.commission_owed)}</b>` : html`<span class="faint">—</span>`, csv: (b) => b.commission_owed },
            { key: 'blocked', label: 'Standing', render: (b) => Number(b.blocked) ? html`<span class="badge badge-danger">Blocked</span>` : html`<span class="badge badge-success">Good</span>`, csv: (b) => (Number(b.blocked) ? 'Blocked' : 'Good') }, { key: 'gross_since_settlement', label: 'Gross since settlement', render: (b) => F.money(b.gross_since_settlement), csv: (b) => b.gross_since_settlement },
            { key: 'lifetime_gross', label: 'Lifetime gross', render: (b) => F.money(b.lifetime_gross), csv: (b) => b.lifetime_gross }, { key: 'lifetime_commission', label: 'Lifetime commission', render: (b) => F.money(b.lifetime_commission), csv: (b) => b.lifetime_commission }, { key: 'autopay_enabled', label: 'Autopay', render: (b) => (Number(b.autopay_enabled) ? 'On' : 'Off'), csv: (b) => (Number(b.autopay_enabled) ? 'On' : 'Off') },
            { key: 'act', label: '', sort: false, csv: false, render: (b) => Number(b.commission_owed) > 0 ? html`<button class="btn btn-sm btn-primary" data-act="finSettle" data-id="${b.driver_id}">Record payment</button>` : '' }] },
        settlements: { label: 'Settlements', url: '/admin/settlements', export: 'settlements', search: (s) => `${s.driverName} ${s.external_reference || ''} ${s.provider || ''}`,
          tabs: [{ key: 'all', label: 'All' }, { key: 'processing', label: 'Processing', fn: (s) => ['pending', 'processing'].includes(s.status) }, { key: 'paid', label: 'Paid', fn: (s) => s.status === 'paid' }, { key: 'failed', label: 'Failed', fn: (s) => s.status === 'failed' }],
          cols: () => [{ key: 'id', label: '#', render: (s) => html`<span class="mono">${s.id}</span>` }, { key: 'driverName', label: 'Driver', render: (s) => html`<a href="#/drivers/${s.driver_id}" data-stop>${s.driverName}</a>`, csv: (s) => s.driverName }, { key: 'gross_earnings', label: 'Gross', render: (s) => F.money(s.gross_earnings), csv: (s) => s.gross_earnings }, { key: 'commission_rate', label: 'Rate', render: (s) => `${Number(s.commission_rate)}%` },
            { key: 'commission_amount', label: 'Commission', render: (s) => F.money(s.commission_amount), csv: (s) => s.commission_amount }, { key: 'paid_amount', label: 'Paid', render: (s) => html`<b>${F.money(s.paid_amount)}</b>`, csv: (s) => s.paid_amount }, { key: 'provider', label: 'Method', render: (s) => F.title(s.provider || '—') },
            { key: 'external_reference', label: 'Reference', render: (s) => html`<span class="mono">${F.trunc(s.external_reference || '—', 26)}</span>`, csv: (s) => s.external_reference || '' }, { key: 'status', label: 'Status', render: (s) => html`${Z.badge(s.status)}${s.failure_reason ? html`<div class="faint" style="font-size:12px">${F.trunc(s.failure_reason, 40)}</div>` : ''}` }, { key: 'created_at', label: 'Date', sort: (s) => s.paid_at || s.created_at, render: (s) => html`<span class="nowrap muted">${F.dt(s.paid_at || s.created_at)}</span>`, csv: (s) => s.paid_at || s.created_at }] }
      };
      setHtml(ctx.el, html`${pageHead('Finance', 'Money in and out of the platform', html`<button class="btn" data-act="reload">${ico('refresh')} Refresh</button>`)}
        <div class="grid g-4" style="margin-bottom:18px">${kpi('Received (all time)', F.money(ok.reduce((a, p) => a + Number(p.amount), 0)), `${F.num(ok.length)} successful payments`, 'checkCircle')}${kpi('Awaiting confirmation', F.num(pend.length), `${F.money(pend.reduce((a, p) => a + Number(p.amount), 0))} pending`, 'clock', 'amber')}${kpi('Commission owed by drivers', F.money(owed), `${F.num(bal.filter((b) => Number(b.commission_owed) > 0).length)} drivers owe commission`, 'wallet', 'blue')}${kpi('Drivers blocked', F.num(blocked), 'Cannot take trips until they pay', 'ban', blocked ? 'red' : 'violet')}</div>
        <div class="card"><div class="tabs" id="fTabs">${Object.entries(defs).map(([k, d]) => html`<button class="tab ${k === tab ? 'active' : ''}" data-ft="${k}">${d.label}</button>`)}</div><div id="fBody"></div></div>`);
      let table;
      async function show() {
        const d = defs[tab]; $$('#fTabs .tab', ctx.el).forEach((b) => b.classList.toggle('active', b.dataset.ft === tab));
        const body = $('#fBody', ctx.el);
        if (!cache[tab]) { setHtml(body, Z.skeleton(6)); try { cache[tab] = await get(d.url, { fresh: true }); } catch (e) { setHtml(body, Z.errorBlock(e)); return; } if (tab !== d.__t && defs[tab] !== d) return; }
        table = new Z.Table({ rows: cache[tab], columns: d.cols(), search: d.search, tabs: d.tabs, filters: d.filters, exportName: d.export, defaultSort: tab === 'balances' ? { key: 'commission_owed', dir: 'desc' } : { key: tab === 'wallet' ? 'createdAt' : tab === 'commission' ? 'createdAt' : 'created_at', dir: 'desc' }, empty: Z.empty('Nothing recorded yet', 'Records will appear here as money moves through the platform.', 'wallet') });
        table.mount(body);
      }
      ctx.el.addEventListener('click', (e) => { const t = e.target.closest('[data-ft]'); if (t) { tab = t.dataset.ft; show(); } const r = e.target.closest('[data-ride]'); if (r) { e.preventDefault(); Z.openRide(r.dataset.ride); } });
      Z._fin = { bal, reload: () => Z.reloadPage() }; show();
    }
  };
  Z.act('payComplete', async ({ id }) => {
    const r = await Z.confirm({ title: 'Mark this payment as paid?', tone: 'warn', confirmLabel: 'Confirm payment received', message: 'This credits the customer’s wallet. Only do this after you have confirmed the money arrived with the payment provider.' });
    if (r) { await Z.api.post(`/admin/payments/${id}/complete`); Z.toast('Payment completed and wallet credited.'); Z.refreshQueues(); Z.reloadPage(); }
  });
  Z.act('finSettle', async ({ id }) => {
    const b = Z._fin.bal.find((x) => String(x.driver_id) === id);
    const ok = await Z.formModal({ title: 'Record commission payment', subtitle: `${b.driverName} owes ${F.money(b.commission_owed)}`, size: 'sm', submitLabel: 'Record payment',
      fields: [{ name: 'reference', label: 'Payment reference', col: 12, maxLength: 120, placeholder: 'Receipt / transfer number' }, { name: 'note', label: 'Note', type: 'textarea', col: 12, maxLength: 300 }],
      onSubmit: (v) => Z.api.post(`/admin/drivers/${id}/settle`, v) });
    if (ok) { Z.toast('Payment recorded. Commission balance updated.'); Z.reloadPage(); }
  });

  /* ============================== Driver payouts ============================== */
  Z.pages.withdrawals = {
    title: 'Driver payouts', subtitle: 'Withdrawal requests from drivers',
    async render(ctx) {
      const load = (f) => get('/admin/payouts', { fresh: f }); let rows = await load(true); if (!ctx.alive()) return;
      const acct = (p) => { const a = Z.parseJson(p.account_details) || {}; const e = Object.entries(a).filter(([, v]) => v); return e.length ? e.map(([k, v]) => `${F.title(k)}: ${v}`).join(' · ') : '—'; };
      const open = (p) => {
        const a = Z.parseJson(p.account_details) || {};
        const next = { pending: ['approved', 'paid', 'rejected'], approved: ['paid', 'rejected'], paid: [], rejected: [] }[p.status];
        const h = Z.drawer({ title: `Payout request #${p.id}`, subtitle: `${p.driverName} · ${F.dt(p.created_at)}`, body: html`<div class="row" style="gap:8px;margin-bottom:12px">${Z.badge(p.status)}<span class="badge nodot">${F.title(p.method)}</span></div><div style="font-size:30px;font-weight:700;letter-spacing:-.02em;margin-bottom:6px">${F.money(p.amount)}</div>
          <div class="section-title">Send money to</div>${Z.kv(Object.entries(a).filter(([, v]) => v).map(([k, v]) => [F.title(k), html`<b>${v}</b>`]).concat(Object.keys(a).length ? [] : [['Account', 'No account details provided']]))}
          <div class="section-title">Driver</div>${Z.userCell(p.driverName, '', null, p.driver_id)}<a class="btn btn-sm" style="margin-top:8px" href="#/drivers/${p.driver_id}" data-close>Open driver profile</a>
          ${p.processed_at ? html`<div class="section-title">Processing</div>${Z.kv([['Last updated', F.dt(p.processed_at)], ['Admin note', p.admin_note]])}` : ''}
          ${next.length ? html`<div class="banner info" style="margin-top:18px">${ico('info')}<div><b>Before you mark it paid</b><span>Send the money to the account above first, then mark the request as paid. The driver is notified of each step.</span></div></div>` : ''}`,
          footer: next.length ? html`${next.includes('rejected') ? html`<button class="btn btn-soft-danger" data-s="rejected">${ico('x')} Reject…</button>` : ''}${next.includes('approved') ? html`<button class="btn" data-s="approved">Approve</button>` : ''}${next.includes('paid') ? Z.spinBtn(html`${ico('check')} Mark as paid`, 'btn-primary', 'data-s="paid"') : ''}` : html`<button class="btn" data-close>Close</button>` });
        h.el.addEventListener('click', async (e) => {
          const b = e.target.closest('[data-s]'); if (!b) return; const s = b.dataset.s; let note = '';
          if (s === 'rejected') { const r = await Z.confirm({ title: 'Reject this payout?', tone: 'danger', confirmLabel: 'Reject payout', message: 'The driver sees your reason.', reason: { label: 'Reason', required: true, presets: ['Account details are incorrect', 'Amount exceeds available earnings', 'Outstanding commission must be paid first'] } }); if (!r) return; note = r.reason; }
          else { const r = await Z.confirm({ title: s === 'paid' ? `Confirm ${F.money(p.amount)} was sent?` : 'Approve this payout?', tone: 'ok', confirmLabel: s === 'paid' ? 'Yes, mark as paid' : 'Approve', message: s === 'paid' ? 'This cannot be undone.' : 'Approved requests stay open until you mark them paid.', reason: { label: 'Note (optional)', required: false } }); if (!r) return; note = r.reason; }
          try { await Z.busy(null, () => Z.api.patch(`/admin/payouts/${p.id}/status`, { status: s, note })); Z.toast(`Payout ${s}.`); h.close(); rows = await load(true); t.setRows(rows); Z.refreshQueues(); } catch (err) { Z.toast(err.message, 'error'); }
        });
      };
      const t = new Z.Table({
        rows, exportName: 'payouts', search: (p) => `${p.driverName} ${p.id} ${acct(p)}`, searchPlaceholder: 'Search driver, account…',
        tabs: [{ key: 'pending', label: 'Pending', fn: (p) => p.status === 'pending', hot: true }, { key: 'approved', label: 'Approved — to pay', fn: (p) => p.status === 'approved' }, { key: 'paid', label: 'Paid', fn: (p) => p.status === 'paid' }, { key: 'rej', label: 'Rejected', fn: (p) => p.status === 'rejected' }, { key: 'all', label: 'All' }],
        defaultSort: { key: 'date', dir: 'desc' }, onRow: open, onRefresh: async () => { rows = await load(true); t.setRows(rows); },
        columns: [{ key: 'id', label: '#', render: (p) => html`<span class="mono">${p.id}</span>` }, { key: 'driverName', label: 'Driver', render: (p) => html`<b>${p.driverName}</b>` }, { key: 'amount', label: 'Amount', sort: (p) => Number(p.amount), render: (p) => html`<b>${F.money(p.amount)}</b>`, csv: (p) => p.amount },
          { key: 'method', label: 'Method', render: (p) => F.title(p.method) }, { key: 'account', label: 'Account', sort: false, render: (p) => html`<span class="muted">${F.trunc(acct(p), 50)}</span>`, csv: (p) => acct(p) }, { key: 'status', label: 'Status', render: (p) => Z.badge(p.status) },
          { key: 'date', label: 'Requested', sort: (p) => p.created_at, render: (p) => html`<span class="muted nowrap">${F.dt(p.created_at)}</span>`, csv: (p) => p.created_at }, { key: 'act', label: '', sort: false, csv: false, render: (p) => html`<button class="btn btn-sm ${['pending', 'approved'].includes(p.status) ? 'btn-primary' : ''}">${['pending', 'approved'].includes(p.status) ? 'Process' : 'View'}</button>` }],
        empty: Z.empty('No payout requests', 'Drivers can request a withdrawal of their earnings from the app.', 'cash')
      });
      const pend = rows.filter((p) => p.status === 'pending');
      setHtml(ctx.el, html`${pageHead('Driver payouts', `${pend.length} pending · ${F.money(pend.reduce((a, p) => a + Number(p.amount), 0))} awaiting approval`)}<div class="card" id="tbl"></div>`); t.mount($('#tbl', ctx.el));
    }
  };

  /* ============================== Promotions ============================== */
  const promoState = (p) => {
    const now = Date.now(); const from = Z.toDate(p.valid_from), to = Z.toDate(p.valid_until);
    if (!p.is_active) return ['paused', 'Paused']; if (to && to.getTime() < now) return ['expired', 'Expired']; if (from && from.getTime() > now) return ['pending', 'Scheduled'];
    if (p.usage_limit && p.usage_count >= p.usage_limit) return ['expired', 'Fully used']; return ['active', 'Live'];
  };
  const day = (v) => (v ? String(v).slice(0, 10) : '');
  const promoFields = (p) => [
    { name: 'code', label: 'Promo code', required: true, col: 6, maxLength: 40, transform: (v) => v.toUpperCase(), pattern: '^[A-Za-z0-9_-]{3,40}$', patternMsg: 'Use 3–40 letters, numbers, - or _.', hint: 'Riders type this at checkout.' },
    { name: 'title', label: 'Headline', required: true, col: 6, maxLength: 120, hint: 'Shown in the app and in the offer notification.' },
    { name: 'description', label: 'Description', type: 'textarea', col: 12, rows: 2, maxLength: 480 },
    { name: 'discountType', label: 'Discount type', type: 'radio', required: true, col: 12, options: [{ value: 'percent', label: 'Percentage', desc: 'e.g. 20% off the fare' }, { value: 'fixed', label: 'Fixed amount', desc: 'e.g. TZS 2,000 off' }] },
    { name: 'discountValue', label: 'Discount value', type: 'number', required: true, col: 4, min: 1, step: 1, validate: (v, a) => (a.discountType === 'percent' && v > 100 ? 'A percentage cannot exceed 100.' : null) },
    { name: 'maxDiscount', label: 'Maximum discount (TZS)', type: 'money', col: 4, min: 0, showIf: (a) => a.discountType === 'percent', hint: 'Caps the saving. Blank = no cap.' },
    { name: 'appliesTo', label: 'Applies to', type: 'select', required: true, col: 4, options: [{ value: 'all', label: 'Everything' }, { value: 'ride', label: 'Rides' }, { value: 'parcel', label: 'Parcels' }, { value: 'tour', label: 'Tours' }] },
    { name: 'validFrom', label: 'Starts', type: 'date', required: true, col: 6 }, { name: 'validUntil', label: 'Ends', type: 'date', required: true, col: 6, validate: (v, a) => (a.validFrom && v < a.validFrom ? 'End date must be after the start date.' : null), hint: 'Valid through the end of this day.' },
    { name: 'usageLimit', label: 'Total redemptions', type: 'number', col: 6, min: 1, hint: 'Blank = unlimited.' }, { name: 'perUserLimit', label: 'Per rider limit', type: 'number', col: 6, min: 1, required: true },
    { name: 'isActive', label: 'Promotion is active', type: 'switch', hint: 'Pause at any time without deleting.' },
    ...(p ? [] : [{ name: 'notifyRiders', label: 'Notify all riders', type: 'switch', hint: 'Sends a push notification announcing the offer.' }])];
  const promoBody = (v) => ({ code: v.code, title: v.title, description: v.description || undefined, discountType: v.discountType, discountValue: v.discountValue, maxDiscount: v.discountType === 'percent' ? v.maxDiscount : null, appliesTo: v.appliesTo, validFrom: `${v.validFrom} 00:00:00`, validUntil: `${v.validUntil} 23:59:59`, usageLimit: v.usageLimit || undefined, perUserLimit: v.perUserLimit, isActive: v.isActive, notifyRiders: v.notifyRiders });
  Z.pages.promotions = {
    title: 'Promotions', subtitle: 'Discount codes for riders',
    async render(ctx) {
      const load = (f) => get('/admin/promos', { fresh: f }); const rows = await load(true); if (!ctx.alive()) return; Z._promos = rows;
      const t = new Z.Table({
        rows, exportName: 'promotions', search: (p) => `${p.code} ${p.title} ${p.description || ''}`, searchPlaceholder: 'Search code or title…',
        tabs: [{ key: 'all', label: 'All' }, { key: 'live', label: 'Live', fn: (p) => promoState(p)[0] === 'active' }, { key: 'sch', label: 'Scheduled', fn: (p) => promoState(p)[0] === 'pending' }, { key: 'end', label: 'Ended / paused', fn: (p) => ['expired', 'paused'].includes(promoState(p)[0]) }],
        defaultSort: { key: 'date', dir: 'desc' }, onRefresh: async () => { Z._promos = await load(true); t.setRows(Z._promos); }, onRow: (p) => Z.acts.editPromo({ id: String(p.id) }),
        columns: [{ key: 'code', label: 'Code', render: (p) => html`<b class="mono" style="font-size:13.5px">${p.code}</b>` }, { key: 'title', label: 'Promotion', render: (p) => html`<b>${p.title}</b><div class="muted" style="font-size:12.5px">${F.trunc(p.description || '', 50)}</div>`, csv: (p) => p.title },
          { key: 'discount', label: 'Discount', sort: (p) => Number(p.discount_value), render: (p) => p.discount_type === 'percent' ? html`<b>${Number(p.discount_value)}%</b>${p.max_discount ? html`<div class="faint" style="font-size:12px">max ${F.money(p.max_discount)}</div>` : ''}` : html`<b>${F.money(p.discount_value)}</b>`, csv: (p) => (p.discount_type === 'percent' ? `${p.discount_value}%` : p.discount_value) },
          { key: 'applies_to', label: 'Applies to', render: (p) => F.title(p.applies_to) }, { key: 'usage', label: 'Used', sort: (p) => p.usage_count, render: (p) => html`${p.usage_count}${p.usage_limit ? html` / ${p.usage_limit}<div class="progress" style="width:80px;margin-top:4px"><i style="width:${Math.min(100, (p.usage_count / p.usage_limit) * 100)}%"></i></div>` : html` <span class="faint">/ ∞</span>`}`, csv: (p) => `${p.usage_count}/${p.usage_limit || 'unlimited'}` },
          { key: 'valid', label: 'Valid', sort: (p) => p.valid_until, render: (p) => html`<span class="nowrap">${F.date(p.valid_from)} → ${F.date(p.valid_until)}</span>`, csv: (p) => `${p.valid_from} - ${p.valid_until}` }, { key: 'status', label: 'Status', sort: (p) => promoState(p)[1], render: (p) => { const [s, l] = promoState(p); return Z.badge(s, l); }, csv: (p) => promoState(p)[1] },
          { key: 'date', label: 'Created', sort: (p) => p.created_at, render: (p) => F.date(p.created_at), csv: (p) => p.created_at },
          { key: 'act', label: '', sort: false, csv: false, render: (p) => html`<button class="btn btn-sm" data-act="togglePromo" data-id="${p.id}">${p.is_active ? 'Pause' : 'Activate'}</button>` }],
        empty: Z.empty('No promotions yet', 'Create a code to reward riders.', 'tag', html`<button class="btn btn-primary" style="margin-top:14px" data-act="addPromo">${ico('plus')} New promotion</button>`)
      });
      setHtml(ctx.el, html`${pageHead('Promotions', 'Create and manage discount codes', html`<button class="btn btn-primary" data-act="addPromo">${ico('plus')} New promotion</button>`)}<div class="card" id="tbl"></div>`); t.mount($('#tbl', ctx.el));
    }
  };
  Z.act('addPromo', async () => {
    const today = new Date().toISOString().slice(0, 10); const end = new Date(Date.now() + 30 * 864e5).toISOString().slice(0, 10);
    const ok = await Z.formModal({ title: 'New promotion', subtitle: 'Riders will be able to apply this code at checkout', fields: promoFields(null), values: { discountType: 'percent', appliesTo: 'ride', validFrom: today, validUntil: end, perUserLimit: 1, isActive: true, notifyRiders: false }, submitLabel: 'Create promotion', onSubmit: (v) => Z.api.post('/admin/promos', promoBody(v)) });
    if (ok) { Z.toast('Promotion created.'); Z.reloadPage(); }
  });
  Z.act('editPromo', async ({ id }) => {
    const p = Z._promos.find((x) => String(x.id) === id);
    const ok = await Z.formModal({ title: 'Edit promotion', subtitle: p.code, fields: promoFields(p), values: { code: p.code, title: p.title, description: p.description || '', discountType: p.discount_type, discountValue: Number(p.discount_value), maxDiscount: p.max_discount ? Number(p.max_discount) : null, appliesTo: p.applies_to, validFrom: day(p.valid_from), validUntil: day(p.valid_until), usageLimit: p.usage_limit, perUserLimit: p.per_user_limit, isActive: !!p.is_active }, submitLabel: 'Save changes', onSubmit: (v) => { const b = promoBody(v); delete b.notifyRiders; return Z.api.patch(`/admin/promos/${p.id}`, b); } });
    if (ok) { Z.toast('Promotion updated.'); Z.reloadPage(); }
  });
  Z.act('togglePromo', async ({ id }) => {
    const p = Z._promos.find((x) => String(x.id) === id);
    if (p.is_active) { const r = await Z.confirm({ title: `Pause ${p.code}?`, message: 'Riders can no longer apply this code until you activate it again.', confirmLabel: 'Pause promotion' }); if (!r) return; }
    await Z.api.patch(`/admin/promos/${id}`, { isActive: !p.is_active }); Z.toast(p.is_active ? 'Promotion paused.' : 'Promotion activated.'); Z.reloadPage();
  });
})();

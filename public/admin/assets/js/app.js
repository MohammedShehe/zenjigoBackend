(() => {
  'use strict';
  const Z = window.Z; const { html, raw, ico, $, $$, setHtml, F } = Z;

  /* ---------------- Theme ---------------- */
  const theme = { get() { try { return localStorage.getItem('zg_theme') || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'); } catch (_) { return 'light'; } },
    set(t) { document.documentElement.dataset.theme = t; try { localStorage.setItem('zg_theme', t); } catch (_) {} const b = $('#themeBtn'); if (b) setHtml(b, ico(t === 'dark' ? 'sun' : 'moon')); } };
  theme.set(theme.get());

  /* ---------------- Navigation model ---------------- */
  const NAV = [
    { group: 'Overview', items: [
      { k: 'dashboard', l: 'Dashboard', i: 'grid' },
      { k: 'live', l: 'Live operations', i: 'radio', q: (q) => q.activeRides, tone: '' } ] },
    { group: 'Operations', items: [
      { k: 'rides', l: 'Rides', i: 'car' },
      { k: 'drivers', l: 'Drivers', i: 'id', q: (q) => q.driverApplications, tone: 'warn' },
      { k: 'documents', l: 'Document review', i: 'fileCheck', q: (q) => q.documents, tone: 'warn' },
      { k: 'requests', l: 'Driver requests', i: 'inbox', q: (q) => q.changeRequests, tone: 'warn' },
      { k: 'riders', l: 'Riders', i: 'users' },
      { k: 'parcels', l: 'Parcels', i: 'package', q: (q) => q.parcels, tone: 'warn' },
      { k: 'tours', l: 'Tours', i: 'compass', q: (q) => q.tourBookings, tone: 'warn' } ] },
    { group: 'Money', items: [
      { k: 'finance', l: 'Finance', i: 'wallet', q: (q) => q.payments, tone: 'warn' },
      { k: 'withdrawals', l: 'Driver payouts', i: 'cash', q: (q) => q.payouts, tone: 'warn' },
      { k: 'promotions', l: 'Promotions', i: 'tag' } ] },
    { group: 'Care & safety', items: [
      { k: 'support', l: 'Support inbox', i: 'chat', q: (q) => q.supportUnread, tone: '' },
      { k: 'reports', l: 'Safety reports', i: 'flag', q: (q) => q.reports, tone: 'danger' },
      { k: 'notifications', l: 'Notifications', i: 'bell' } ] },
    { group: 'Platform', items: [
      { k: 'pricing', l: 'Pricing & policy', i: 'sliders' },
      { k: 'admins', l: 'Admins & access', i: 'shield' },
      { k: 'audit', l: 'Audit log', i: 'clock' },
      { k: 'archive', l: 'Archive', i: 'archive' },
      { k: 'settings', l: 'My account', i: 'gear' } ] }
  ];
  const ALL = NAV.flatMap((g) => g.items);
  Z.queues = {}; Z.me = null;

  /* ---------------- Auth view ---------------- */
  const root = $('#root');
  function renderAuth(note) {
    setHtml(root, html`<div class="auth">
      <aside class="auth-art"><div class="logo"><img src="assets/img/zenjigo-icon.png" alt="">ZenjiGO</div>
        <div><h1>Run every ride, driver and payment from one console.</h1><p class="lead">The ZenjiGO operations console is restricted to authorised administrators. Every action is recorded in the audit log.</p>
          <div class="auth-points"><div>${ico('shieldCheck')}<p><b>Two-step verification</b><span>Password plus a one-time code sent to your email.</span></p></div>
          <div>${ico('fileCheck')}<p><b>Driver verification</b><span>Review documents and change requests before drivers go live.</span></p></div>
          <div>${ico('wallet')}<p><b>Finance control</b><span>Payments, commissions and payouts with a full ledger.</span></p></div></div></div>
        <footer>© ${new Date().getFullYear()} ZenjiGO · Ride Anywhere in Zanzibar</footer></aside>
      <main class="auth-panel"><div class="auth-card" id="authCard"></div></main></div>`);
    loginStep(note);
  }
  function loginStep(note) {
    const email = (Z._loginEmail || '');
    setHtml($('#authCard'), html`<span class="eyebrow">${ico('lock')} Administrator sign-in</span><h2>Welcome back</h2><p class="sub">Sign in with your admin email and password. We’ll then email you a verification code.</p>
      ${note ? html`<div class="banner warn" style="margin-bottom:16px">${ico('info')}<div>${note}</div></div>` : ''}
      <form id="loginForm" novalidate><div class="form-error" data-form-error role="alert">${ico('alert')}<span></span></div>
        <div class="field" data-field="email"><label for="lgEmail">Email address</label><input id="lgEmail" name="email" type="email" class="input" autocomplete="username" value="${email}" placeholder="you@zenjigo.com" required><div class="err"></div></div>
        <div class="field" data-field="password" style="margin-top:16px"><label for="lgPass">Password</label><div class="input-wrap"><input id="lgPass" name="password" type="password" class="input" style="padding-right:44px" autocomplete="current-password" required><button type="button" class="iconbtn suf" data-toggle-pass aria-label="Show password" tabindex="-1">${ico('eye')}</button></div><div class="err"></div></div>
        <label class="row" style="margin:16px 0 22px;gap:10px;font-size:13.5px"><input type="checkbox" id="lgRemember" style="width:16px;height:16px;accent-color:var(--brand)"> Keep me signed in on this device</label>
        <button class="btn btn-primary btn-lg btn-block" id="lgBtn" type="submit"><span class="spin"></span>Continue</button></form>
      <div class="secure-note">${ico('shieldCheck')}<span>Only authorised ZenjiGO staff may use this console. Never share your password or verification codes.</span></div>`);
    const form = $('#loginForm'); $('#lgEmail').focus();
    form.addEventListener('click', (e) => { const t = e.target.closest('[data-toggle-pass]'); if (!t) return; const i = t.parentElement.querySelector('input'); const s = i.type === 'password'; i.type = s ? 'text' : 'password'; setHtml(t, ico(s ? 'eyeOff' : 'eye')); });
    form.addEventListener('submit', async (e) => {
      e.preventDefault(); const em = $('#lgEmail').value.trim().toLowerCase(), pw = $('#lgPass').value; const bar = $('[data-form-error]', form);
      $$('.field', form).forEach((f) => f.classList.remove('invalid')); bar.classList.remove('show');
      let bad = false;
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(em)) { fieldErr('email', 'Enter a valid email address.'); bad = true; }
      if (pw.length < 8) { fieldErr('password', 'Password must be at least 8 characters.'); bad = true; }
      if (bad) return;
      await Z.busy($('#lgBtn'), async () => {
        try { const r = await Z.api.login(em, pw); Z._loginEmail = em; Z._pw = pw; Z._remember = $('#lgRemember').checked; otpStep(r && r.maskedEmail ? r.maskedEmail : em); }
        catch (err) { $('span', bar).textContent = err.message; bar.classList.add('show'); }
      });
    });
    function fieldErr(n, m) { const w = $(`[data-field="${n}"]`, form); w.classList.add('invalid'); $('.err', w).textContent = m; }
  }
  function otpStep(masked) {
    const LEN = 6; let expiresAt = Date.now() + 10 * 60 * 1000; let resendAt = Date.now() + 30 * 1000; let timer;
    setHtml($('#authCard'), html`<button class="back" id="otpBack">${ico('chevL')} Back to sign in</button><span class="eyebrow">${ico('mail')} Two-step verification</span><h2>Check your email</h2><p class="sub">Enter the 6-digit code we sent to <b>${masked}</b>.</p>
      <form id="otpForm" novalidate><div class="form-error" data-form-error role="alert">${ico('alert')}<span></span></div>
        <div class="otp" id="otpRow" role="group" aria-label="Verification code">${Array.from({ length: LEN }, (_, i) => html`<input inputmode="numeric" autocomplete="${i === 0 ? 'one-time-code' : 'off'}" maxlength="1" aria-label="Digit ${i + 1}">`)}</div>
        <div class="row between" style="margin:14px 0 22px;font-size:13px"><span class="muted" id="otpTimer"></span><button type="button" class="link" id="otpResend" disabled>Resend code</button></div>
        <button class="btn btn-primary btn-lg btn-block" id="otpBtn" type="submit"><span class="spin"></span>Verify and sign in</button></form>`);
    const inputs = $$('#otpRow input'); const form = $('#otpForm'); const bar = $('[data-form-error]', form);
    inputs[0].focus();
    const code = () => inputs.map((i) => i.value).join('');
    inputs.forEach((inp, idx) => {
      inp.addEventListener('input', () => { inp.value = inp.value.replace(/\D/g, '').slice(-1); if (inp.value && idx < LEN - 1) inputs[idx + 1].focus(); $('#otpRow').classList.remove('bad'); if (code().length === LEN) form.requestSubmit(); });
      inp.addEventListener('keydown', (e) => { if (e.key === 'Backspace' && !inp.value && idx > 0) inputs[idx - 1].focus(); if (e.key === 'ArrowLeft' && idx > 0) inputs[idx - 1].focus(); if (e.key === 'ArrowRight' && idx < LEN - 1) inputs[idx + 1].focus(); });
      inp.addEventListener('paste', (e) => { const t = (e.clipboardData.getData('text') || '').replace(/\D/g, '').slice(0, LEN); if (!t) return; e.preventDefault(); [...t].forEach((c, k) => (inputs[k].value = c)); inputs[Math.min(t.length, LEN - 1)].focus(); if (t.length === LEN) form.requestSubmit(); });
    });
    const tick = () => {
      const left = Math.max(0, Math.round((expiresAt - Date.now()) / 1000)); const rs = Math.max(0, Math.round((resendAt - Date.now()) / 1000));
      const t = $('#otpTimer'); if (!t) return clearInterval(timer);
      t.textContent = left ? `Code expires in ${String(Math.floor(left / 60)).padStart(2, '0')}:${String(left % 60).padStart(2, '0')}` : 'Code expired — request a new one';
      const r = $('#otpResend'); r.disabled = rs > 0; r.textContent = rs > 0 ? `Resend in ${rs}s` : 'Resend code';
    };
    timer = setInterval(tick, 1000); tick();
    $('#otpBack').addEventListener('click', () => { clearInterval(timer); Z._pw = ''; loginStep(); });
    $('#otpResend').addEventListener('click', async () => {
      const b = $('#otpResend'); b.disabled = true;
      try { await Z.api.login(Z._loginEmail, Z._pw || ''); expiresAt = Date.now() + 10 * 60 * 1000; resendAt = Date.now() + 30 * 1000; bar.classList.remove('show'); Z.toast('A new code is on its way.'); inputs.forEach((i) => (i.value = '')); inputs[0].focus(); }
      catch (err) { $('span', bar).textContent = err.message; bar.classList.add('show'); resendAt = Date.now() + 15 * 1000; }
      tick();
    });
    form.addEventListener('submit', async (e) => {
      e.preventDefault(); bar.classList.remove('show');
      if (code().length < LEN) { $('span', bar).textContent = 'Enter all 6 digits of your code.'; bar.classList.add('show'); return; }
      await Z.busy($('#otpBtn'), async () => {
        try { await Z.api.verifyOtp(Z._loginEmail, code(), Z._remember); clearInterval(timer); Z._loginEmail = ''; Z._pw = ''; await start(); }
        catch (err) { $('#otpRow').classList.add('bad'); $('span', bar).textContent = err.message; bar.classList.add('show'); inputs.forEach((i) => (i.value = '')); inputs[0].focus(); }
      });
    });
  }

  /* ---------------- Shell ---------------- */
  function renderShell() {
    setHtml(root, html`<div class="app"><aside class="sidebar" id="sidebar" aria-label="Main navigation"><div class="sb-head"><div class="sb-brand"><img src="assets/img/zenjigo-icon.png" alt=""><div>ZenjiGO<small>Admin console</small></div></div></div>
      <nav class="sb-nav" id="nav">${NAV.map((g) => html`<div class="sb-group">${g.group}</div>${g.items.map((n) => html`<a class="sb-link" href="#/${n.k}" data-nav="${n.k}">${ico(n.i)}<span>${n.l}</span><span class="count hidden ${n.tone || ''}" data-count="${n.k}"></span></a>`)}`)}</nav>
      <div class="sb-foot"><div class="sb-user">${Z.avatar(Z.me.fullName, null, '', Z.me.id)}<div style="min-width:0"><b>${Z.me.fullName}</b><span>${Z.me.email}</span></div></div>
        <button class="sb-link" data-act="logout">${ico('logout')}<span>Sign out</span></button></div></aside>
      <div class="scrim" id="scrim"></div>
      <div class="main"><header class="topbar"><button class="iconbtn menu-toggle" id="menuBtn" aria-label="Open menu">${ico('menu')}</button>
        <div class="tb-title"><h1 id="pgTitle"></h1><small id="pgSub"></small></div><div class="tb-spacer"></div>
        <button class="searchbtn" data-act="palette" aria-label="Search">${ico('search')}<span>Search drivers, riders, pages…</span><kbd>Ctrl K</kbd></button>
        <button class="iconbtn" id="themeBtn" data-act="theme" aria-label="Toggle theme"></button>
        <a class="iconbtn" href="#/support" aria-label="Support inbox">${ico('chat')}<span class="pip hidden" id="supPip"></span></a></header>
        <main class="content" id="page" tabindex="-1"></main></div></div>`);
    theme.set(theme.get());
    $('#menuBtn').addEventListener('click', () => toggleMenu(true)); $('#scrim').addEventListener('click', () => toggleMenu(false));
    $('#nav').addEventListener('click', (e) => { if (e.target.closest('a')) toggleMenu(false); });
  }
  const toggleMenu = (o) => { $('#sidebar').classList.toggle('open', o); $('#scrim').classList.toggle('show', o); };

  async function refreshQueues() {
    try {
      const d = await Z.api.get('/admin/dashboard', { ttl: 15000 }); Z.queues = { ...d.queues, activeRides: d.activeRides }; Z.dash = d;
      ALL.forEach((n) => { if (!n.q) return; const c = $(`[data-count="${n.k}"]`); if (!c) return; const v = Number(n.q(Z.queues) || 0); c.textContent = v > 99 ? '99+' : v; c.classList.toggle('hidden', !v); });
      const p = $('#supPip'); if (p) { const u = Z.queues.supportUnread || 0; p.textContent = u > 9 ? '9+' : u; p.classList.toggle('hidden', !u); }
    } catch (_) {}
  }
  Z.refreshQueues = refreshQueues;

  /* ---------------- Router ---------------- */
  let leave = null; let token = 0; let current = '';
  function parse() { const h = location.hash.replace(/^#\/?/, ''); const [path] = h.split('?'); const parts = path.split('/').filter(Boolean); return { key: parts[0] || 'dashboard', args: parts.slice(1) }; }
  async function route() {
    if (!Z.me) return;
    const { key, args } = parse(); const page = Z.pages[key];
    if (leave) { try { leave(); } catch (_) {} leave = null; }
    const my = ++token; current = key;
    $$('[data-nav]').forEach((a) => a.classList.toggle('active', a.dataset.nav === key));
    const el = $('#page'); const nav = ALL.find((n) => n.k === key);
    if (!page) { setHead('Page not found', ''); setHtml(el, Z.empty('Page not found', 'That address does not exist.', 'search', html`<a class="btn btn-primary" style="margin-top:14px" href="#/dashboard">Go to dashboard</a>`)); return; }
    setHead(page.title || nav.l, page.subtitle || ''); setHtml(el, html`<div class="card">${Z.skeleton(7)}</div>`);
    const ctx = { el, args, alive: () => my === token, onLeave: (fn) => { leave = fn; }, setHead, reload: () => route() };
    try { await page.render(ctx); } catch (err) { if (my === token) { console.error(err); setHtml(el, html`<div class="card">${Z.errorBlock(err)}</div>`); } }
    if (my === token) { el.focus({ preventScroll: true }); window.scrollTo(0, 0); }
  }
  function setHead(t, s) { $('#pgTitle').textContent = t; $('#pgSub').textContent = s || ''; document.title = `${t} · ZenjiGO Admin`; }
  Z.setHead = setHead;
  Z.go = (h) => { location.hash = h; };
  Z.reloadPage = () => { Z.api.clearCache(); route(); };
  Z.act('reload', () => Z.reloadPage());
  Z.act('theme', () => theme.set(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'));
  Z.act('logout', async () => {
    const ok = await Z.confirm({ title: 'Sign out?', message: 'You will need your password and a new email code to sign back in.', confirmLabel: 'Sign out' }); if (!ok) return;
    await Z.api.logout(); Z.me = null; Z.closeAll(); history.replaceState(null, '', location.pathname); renderAuth();
  });
  window.addEventListener('hashchange', route);
  window.addEventListener('zg:logout', () => { if (!Z.me) return; Z.me = null; Z.closeAll(); renderAuth('Your session has expired. Please sign in again.'); });

  /* ---------------- Command palette ---------------- */
  let dirCache = null;
  async function directory() {
    if (dirCache && Date.now() - dirCache.t < 60000) return dirCache.d;
    const [d, r] = await Promise.all([Z.api.get('/admin/drivers', { ttl: 60000 }).catch(() => []), Z.api.get('/admin/riders', { ttl: 60000 }).catch(() => [])]);
    dirCache = { t: Date.now(), d: [...d.map((x) => ({ t: 'drivers', id: x.id, name: x.fullName, sub: `${x.phone} · ${x.plateNumber || x.driverCode || ''}` })), ...r.map((x) => ({ t: 'riders', id: x.id, name: x.fullName, sub: `${x.phone} ${x.email || ''}` }))] };
    return dirCache.d;
  }
  Z.act('palette', async () => {
    const m = Z.modal({ title: '', size: 'palette', dismissible: true, body: html`<input id="palQ" placeholder="Jump to a page, driver or rider…" aria-label="Search" autocomplete="off"><div class="pal-list" id="palList"></div>` });
    $('.m-head', m.el).remove(); $('[data-body]', m.el).style.padding = '0'; m.el.classList.add('palette'); m.el.classList.remove('size');
    const q = $('#palQ'); q.focus(); let sel = 0; let items = []; let dir = [];
    directory().then((d) => { dir = d; draw(); });
    function draw() {
      const s = q.value.trim().toLowerCase();
      const pages = ALL.filter((n) => !s || n.l.toLowerCase().includes(s)).map((n) => ({ h: `#/${n.k}`, name: n.l, sub: 'Page', i: n.i }));
      const people = s.length >= 2 ? dir.filter((p) => (p.name + ' ' + p.sub).toLowerCase().includes(s)).slice(0, 8).map((p) => ({ h: `#/${p.t}/${p.id}`, name: p.name, sub: `${F.title(p.t.slice(0, -1))} · ${p.sub}`, i: p.t === 'drivers' ? 'id' : 'user' })) : [];
      items = [...pages, ...people]; sel = Math.min(sel, Math.max(0, items.length - 1));
      setHtml($('#palList'), items.length ? html`${pages.length ? html`<div class="pal-sec">Pages</div>` : ''}${items.map((it, n) => html`${n === pages.length && people.length ? html`<div class="pal-sec">People</div>` : ''}<button class="pal-item ${n === sel ? 'sel' : ''}" data-n="${n}">${ico(it.i)}<span><b style="font-weight:600">${it.name}</b></span><small>${it.sub}</small></button>`)}` : html`<div class="empty" style="padding:30px">No results</div>`);
    }
    const go = (n) => { const it = items[n]; if (it) { m.close(); location.hash = it.h; } };
    q.addEventListener('input', () => { sel = 0; draw(); });
    q.addEventListener('keydown', (e) => { if (e.key === 'ArrowDown') { sel = Math.min(sel + 1, items.length - 1); draw(); e.preventDefault(); } if (e.key === 'ArrowUp') { sel = Math.max(sel - 1, 0); draw(); e.preventDefault(); } if (e.key === 'Enter') go(sel); });
    $('#palList').addEventListener('click', (e) => { const b = e.target.closest('[data-n]'); if (b) go(+b.dataset.n); });
    draw();
  });
  document.addEventListener('keydown', (e) => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k' && Z.me) { e.preventDefault(); Z.acts.palette(); } });

  /* ---------------- Boot ---------------- */
  let poll;
  async function start() {
    Z.api.clearCache();
    try { Z.me = await Z.api.request('/admin/me'); } catch (err) { Z.me = null; Z.api.store.clear(); renderAuth(err.status === 401 || err.status === 403 ? '' : err.message); return; }
    renderShell(); await refreshQueues(); clearInterval(poll); poll = setInterval(() => { if (!document.hidden) refreshQueues(); }, 60000);
    if (!location.hash || location.hash === '#') location.hash = '#/dashboard'; else route();
  }
  window.addEventListener('DOMContentLoaded', async () => {
    const boot = $('#boot');
    if (!Z.api.base()) { boot && boot.remove(); renderAuth('This console is not connected to an API yet. Set apiBase in assets/js/config.js.'); return; }
    if (Z.api.store.get()) await start(); else renderAuth();
    boot && boot.remove();
  });
})();

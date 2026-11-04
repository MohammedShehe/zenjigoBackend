(() => {
  'use strict';
  const Z = (window.Z = { pages: {}, acts: {}, cfg: window.ZENJIGO_ADMIN_CONFIG || {} });

  /* ------------------------------------------------------------------ *
   * Safe HTML templating. Every interpolated value is escaped unless it
   * was produced by html`` / raw(). This is the XSS defence for the whole app.
   * ------------------------------------------------------------------ */
  class Safe { constructor(s) { this.s = s; } toString() { return this.s; } }
  const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;', '`': '&#96;' };
  const esc = (v) => String(v ?? '').replace(/[&<>"'`]/g, (c) => ESC[c]);
  const str = (v) => {
    if (v instanceof Safe) return v.s;
    if (Array.isArray(v)) return v.map(str).join('');
    if (v === null || v === undefined || v === false || v === true) return '';
    return esc(v);
  };
  const html = (s, ...v) => { let o = s[0]; for (let i = 0; i < v.length; i++) o += str(v[i]) + s[i + 1]; return new Safe(o); };
  const raw = (s) => new Safe(String(s ?? ''));
  const ico = (n, c) => raw(window.icon(n, c));
  Object.assign(Z, { Safe, esc, html, raw, ico });

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
  const setHtml = (el, h) => { el.innerHTML = h instanceof Safe ? h.s : esc(h); };
  Object.assign(Z, { $, $$, setHtml });

  /* ------------------------------------------------------------------ *
   * Formatting
   * ------------------------------------------------------------------ */
  const TZ = 'Africa/Dar_es_Salaam';
  const toDate = (v) => {
    if (!v) return null;
    if (v instanceof Date) return v;
    let s = String(v);
    // MySQL DATETIME strings are stored in UTC.
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return new Date(s + 'T00:00:00Z');
    if (/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(:\d{2})?$/.test(s)) s = s.replace(' ', 'T') + 'Z';
    const d = new Date(s);
    return isNaN(d) ? null : d;
  };
  const F = {
    num: (n) => Number(n || 0).toLocaleString('en-US'),
    money: (n, cur = 'TZS') => `${cur} ${Math.round(Number(n || 0)).toLocaleString('en-US')}`,
    date: (v) => { const d = toDate(v); return d ? d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: TZ }) : '—'; },
    time: (v) => { const d = toDate(v); return d ? d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: TZ }) : '—'; },
    dt: (v) => { const d = toDate(v); return d ? `${F.date(d)}, ${F.time(d)}` : '—'; },
    ago: (v) => {
      const d = toDate(v); if (!d) return '—';
      const s = Math.round((Date.now() - d.getTime()) / 1000);
      if (s < 0) return 'in the future';
      if (s < 45) return 'just now';
      if (s < 3600) return `${Math.round(s / 60)} min ago`;
      if (s < 86400) return `${Math.round(s / 3600)} h ago`;
      if (s < 86400 * 7) return `${Math.round(s / 86400)} d ago`;
      return F.date(d);
    },
    daysTo: (v) => { const d = toDate(v); return d ? Math.ceil((d.getTime() - Date.now()) / 86400000) : null; },
    title: (s) => String(s ?? '').replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
    initials: (n) => String(n || '?').trim().split(/\s+/).slice(0, 2).map((p) => p[0]).join('').toUpperCase() || '?',
    km: (n) => (n == null || n === '' ? '—' : `${Number(n).toFixed(1)} km`),
    rating: (n) => (n == null || Number(n) === 0 ? '—' : Number(n).toFixed(2)),
    trunc: (s, n = 60) => { s = String(s ?? ''); return s.length > n ? s.slice(0, n - 1) + '…' : s; }
  };
  Z.F = F; Z.toDate = toDate;

  const STATUS = {
    // generic
    active: 'success', approved: 'success', success: 'success', completed: 'success', delivered: 'success', paid: 'success', resolved: 'success', reviewed: 'success', verified: 'success', online: 'success',
    pending: 'warn', under_review: 'warn', searching: 'warn', processing: 'warn', assigned: 'info', accepted: 'info', arriving: 'info', arrived: 'info', started: 'info', in_progress: 'info', in_transit: 'info', picked_up: 'info', open: 'warn',
    rejected: 'danger', suspended: 'danger', failed: 'danger', cancelled: 'danger', blocked: 'danger', expired: 'danger', dismissed: 'neutral', inactive: 'neutral', offline: 'neutral', superseded: 'neutral', paused: 'neutral'
  };
  Z.badge = (status, label) => {
    const t = STATUS[String(status || '').toLowerCase()] || 'neutral';
    return html`<span class="badge ${t === 'neutral' ? '' : 'badge-' + t}">${label || F.title(status || 'unknown')}</span>`;
  };
  Z.avatar = (name, url, size = '', id = 0) => {
    const c = ((Number(id) || [...String(name || 'x')].reduce((a, ch) => a + ch.charCodeAt(0), 0)) % 6) + 1;
    const safeUrl = Z.safeUrl(url);
    return safeUrl
      ? html`<span class="avatar ${size} av-${c}"><img src="${safeUrl}" alt="" loading="lazy" referrerpolicy="no-referrer"></span>`
      : html`<span class="avatar ${size} av-${c}">${F.initials(name)}</span>`;
  };
  // Only http(s) URLs are ever placed in href/src.
  Z.safeUrl = (u) => {
    if (!u || typeof u !== 'string') return '';
    try { const x = new URL(u, location.origin); return /^https?:$/.test(x.protocol) ? x.href : ''; } catch (_) { return ''; }
  };
  Z.userCell = (name, sub, url, id) => html`<div class="cell-user">${Z.avatar(name, url, '', id)}<div style="min-width:0"><b>${name || '—'}</b><span>${sub ?? ''}</span></div></div>`;
  Z.parseJson = (v) => { if (v == null) return null; if (typeof v === 'object') return v; try { return JSON.parse(v); } catch (_) { return null; } };
  Z.debounce = (fn, ms = 250) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
  Z.download = (name, text, type = 'text/csv;charset=utf-8') => {
    const url = URL.createObjectURL(new Blob(['\ufeff' + text], { type }));
    const a = document.createElement('a'); a.href = url; a.download = name; document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
  };
  Z.csvCell = (v) => { let s = String(v ?? ''); if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; return `"${s.replace(/"/g, '""')}"`; };

  /* ------------------------------------------------------------------ *
   * API client — real backend only. Session lives in sessionStorage unless
   * the operator chose "Keep me signed in" (localStorage).
   * ------------------------------------------------------------------ */
  const SKEY = 'zenjigo_admin_session';
  const base = () => {
    let b = (Z.cfg.apiBase || '').trim();
    if (!b && /^\/admin(\/|$)/.test(location.pathname)) b = location.origin + '/api/v1';
    return b.replace(/\/+$/, '');
  };
  class ApiError extends Error { constructor(m, status, body) { super(m); this.status = status; this.body = body; } }
  const store = {
    get() {
      for (const s of [sessionStorage, localStorage]) {
        try { const v = JSON.parse(s.getItem(SKEY) || 'null'); if (v && v.accessToken) return v; } catch (_) {}
      }
      return null;
    },
    set(v, remember) {
      const keep = remember ?? store.remembered();
      try { sessionStorage.removeItem(SKEY); localStorage.removeItem(SKEY); } catch (_) {}
      try { (keep ? localStorage : sessionStorage).setItem(SKEY, JSON.stringify(v)); } catch (_) {}
    },
    remembered() { try { return !!localStorage.getItem(SKEY); } catch (_) { return false; } },
    clear() { try { sessionStorage.removeItem(SKEY); localStorage.removeItem(SKEY); } catch (_) {} }
  };
  let refreshing = null;
  async function refresh() {
    const s = store.get();
    if (!s || !s.refreshToken) throw new ApiError('Session expired. Please sign in again.', 401);
    if (!refreshing) {
      refreshing = (async () => {
        const r = await fetch(base() + '/auth/refresh', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ refreshToken: s.refreshToken }) });
        const j = await r.json().catch(() => ({}));
        const d = j.data || j;
        if (!r.ok || !d.accessToken) throw new ApiError('Session expired. Please sign in again.', 401);
        store.set({ ...s, accessToken: d.accessToken, refreshToken: d.refreshToken || s.refreshToken });
        return d.accessToken;
      })().finally(() => { setTimeout(() => (refreshing = null), 0); });
    }
    return refreshing;
  }
  const cache = new Map();
  async function request(path, { method = 'GET', body, query, retry = true, auth = true } = {}) {
    const b = base();
    if (!b) throw new ApiError('API address is not configured. Set apiBase in assets/js/config.js.', 0);
    let url = b + path;
    if (query) { const q = new URLSearchParams(); Object.entries(query).forEach(([k, v]) => v != null && v !== '' && q.set(k, v)); const qs = q.toString(); if (qs) url += (url.includes('?') ? '&' : '?') + qs; }
    const headers = { Accept: 'application/json' };
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    const s = store.get();
    if (auth && s) headers.Authorization = `Bearer ${s.accessToken}`;
    let res;
    try { res = await fetch(url, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined, credentials: 'omit' }); }
    catch (e) { throw new ApiError('Cannot reach the server. Check your connection and try again.', 0); }
    if (res.status === 401 && auth && retry && s) {
      try { await refresh(); return request(path, { method, body, query, retry: false, auth }); }
      catch (e) { store.clear(); window.dispatchEvent(new CustomEvent('zg:logout', { detail: { expired: true } })); throw e; }
    }
    const json = await res.json().catch(() => null);
    if (!res.ok || (json && json.success === false)) {
      let msg = (json && json.message) || `Request failed (${res.status})`;
      if (json && Array.isArray(json.errors) && json.errors.length) msg = json.errors.map((e) => e.msg || e.message || e).join(' · ');
      if (res.status === 429) msg = 'Too many requests. Please wait a moment and try again.';
      throw new ApiError(msg, res.status, json);
    }
    return json && json.data !== undefined ? json.data : json;
  }
  Z.api = {
    base, request, store, ApiError,
    get(path, opts = {}) {
      const key = path + JSON.stringify(opts.query || {});
      const hit = cache.get(key);
      if (!opts.fresh && hit && Date.now() - hit.t < (opts.ttl ?? 20000)) return Promise.resolve(hit.d);
      return request(path, { query: opts.query }).then((d) => { cache.set(key, { t: Date.now(), d }); return d; });
    },
    post: (p, b) => request(p, { method: 'POST', body: b ?? {} }).finally(() => cache.clear()),
    patch: (p, b) => request(p, { method: 'PATCH', body: b ?? {} }).finally(() => cache.clear()),
    del: (p, b) => request(p, { method: 'DELETE', body: b ?? {} }).finally(() => cache.clear()),
    clearCache: () => cache.clear(),
    async login(email, password) { return request('/auth/admin/login', { method: 'POST', body: { email, password }, auth: false }); },
    async verifyOtp(email, code, remember) {
      const d = await request('/auth/admin/verify-otp', { method: 'POST', body: { email, code }, auth: false });
      store.set(d, !!remember); cache.clear(); return d;
    },
    async logout() {
      const s = store.get();
      try { if (s) await request('/auth/logout', { method: 'POST', body: { refreshToken: s.refreshToken || '' }, retry: false }); } catch (_) {}
      store.clear(); cache.clear();
    }
  };

  /* ------------------------------------------------------------------ *
   * Actions: declarative click handling (no inline handlers → strict CSP).
   * <button data-act="name" data-id="3"> → Z.acts.name(dataset, el, event)
   * ------------------------------------------------------------------ */
  document.addEventListener('click', async (e) => {
    const el = e.target.closest('[data-act]');
    if (!el || el.disabled) return;
    const fn = Z.acts[el.dataset.act];
    if (!fn) return;
    if (el.tagName === 'A') e.preventDefault();
    try { await fn(el.dataset, el, e); } catch (err) { if (err && err.name !== 'Cancelled') Z.toast(err.message || 'Something went wrong', 'error'); }
  });
  Z.act = (name, fn) => { Z.acts[name] = fn; };

  /* ------------------------------------------------------------------ *
   * Toasts
   * ------------------------------------------------------------------ */
  Z.toast = (message, type = 'success', title) => {
    let host = $('#toasts'); if (!host) { host = document.createElement('div'); host.id = 'toasts'; host.className = 'toasts'; host.setAttribute('aria-live', 'polite'); document.body.append(host); }
    const t = document.createElement('div'); t.className = `toast ${type}`; t.setAttribute('role', type === 'error' ? 'alert' : 'status');
    setHtml(t, html`${ico(type === 'error' ? 'alert' : type === 'warn' ? 'info' : 'checkCircle')}<div><b>${title || (type === 'error' ? 'Something went wrong' : type === 'warn' ? 'Heads up' : 'Done')}</b><span>${message}</span></div>`);
    host.append(t); setTimeout(() => t.remove(), type === 'error' ? 7000 : 4200);
  };

  /* ------------------------------------------------------------------ *
   * Overlays: modal + drawer (stackable, Esc closes top-most)
   * ------------------------------------------------------------------ */
  const stack = []; let lockCount = 0;
  const lock = (on) => { lockCount += on ? 1 : -1; document.body.style.overflow = lockCount > 0 ? 'hidden' : ''; };
  function overlay({ kind, title, subtitle, body, footer, size = '', dismissible = true, onClose }) {
    const o = document.createElement('div');
    o.className = 'overlay' + (kind === 'drawer' ? ' right' : '');
    const box = document.createElement('div');
    box.className = (kind === 'drawer' ? 'drawer ' : 'modal ') + size;
    box.setAttribute('role', 'dialog'); box.setAttribute('aria-modal', 'true');
    setHtml(box, html`<div class="m-head"><div style="min-width:0"><h3>${title}</h3>${subtitle ? html`<p>${subtitle}</p>` : ''}</div>${dismissible ? html`<button class="iconbtn" data-close aria-label="Close">${ico('x')}</button>` : ''}</div><div class="m-body" data-body>${body || ''}</div>${footer ? html`<div class="m-foot" data-foot>${footer}</div>` : ''}`);
    o.append(box); document.body.append(o); lock(true);
    const prevFocus = document.activeElement;
    const h = {
      el: box, overlay: o, closed: false,
      body: (b) => { const x = $('[data-body]', box); if (b !== undefined) setHtml(x, b); return x; },
      foot: (f) => { let x = $('[data-foot]', box); if (!x) { x = document.createElement('div'); x.className = 'm-foot'; x.setAttribute('data-foot', ''); box.append(x); } if (f !== undefined) setHtml(x, f); return x; },
      title: (t) => { $('.m-head h3', box).textContent = t; },
      close(result) {
        if (h.closed) return; h.closed = true;
        const i = stack.indexOf(h); if (i >= 0) stack.splice(i, 1);
        o.remove(); lock(false);
        try { prevFocus && prevFocus.focus && prevFocus.focus(); } catch (_) {}
        onClose && onClose(result);
      }
    };
    o.addEventListener('mousedown', (e) => { if (e.target === o && dismissible) h.close(); });
    box.addEventListener('click', (e) => { if (e.target.closest('[data-close]')) h.close(); });
    stack.push(h);
    setTimeout(() => { const f = $('[autofocus],input:not([type=hidden]):not([readonly]),select,textarea', $('[data-body]', box)); (f || $('[data-close]', box) || box).focus && (f || $('[data-close]', box) || box).focus(); }, 30);
    return h;
  }
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && stack.length) { const top = stack[stack.length - 1]; if (top.overlay.querySelector('[data-close]')) top.close(); }
    if (e.key === 'Tab' && stack.length) {
      const box = stack[stack.length - 1].el;
      const f = $$('a[href],button:not([disabled]),input:not([disabled]):not([type=hidden]),select,textarea,[tabindex]:not([tabindex="-1"])', box).filter((x) => x.offsetParent !== null);
      if (!f.length) return;
      if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f[f.length - 1].focus(); }
      else if (!e.shiftKey && document.activeElement === f[f.length - 1]) { e.preventDefault(); f[0].focus(); }
    }
  });
  Z.modal = (o) => overlay({ ...o, kind: 'modal' });
  Z.drawer = (o) => overlay({ ...o, kind: 'drawer' });
  Z.closeAll = () => [...stack].forEach((h) => h.close());

  /**
   * Confirm dialog. Resolves { reason } on confirm, or null on cancel.
   * opts: title, message, confirmLabel, tone('danger'|'warn'|'ok'), reason:{label,required,placeholder,presets[]}, typeToConfirm
   */
  Z.confirm = (opts) => new Promise((resolve) => {
    const { title, message, confirmLabel = 'Confirm', tone = 'warn', reason, typeToConfirm, icon: ic } = opts;
    let done = false;
    const m = Z.modal({
      title: '', size: 'sm',
      body: html`<div class="confirm-ico ${tone === 'danger' ? 'danger' : tone === 'ok' ? 'ok' : ''}">${ico(ic || (tone === 'ok' ? 'checkCircle' : 'alert'))}</div>
        <h3 style="margin-bottom:6px">${title}</h3><p class="muted">${message || ''}</p>
        ${reason ? html`<div class="field" style="margin-top:16px"><label for="cf-reason">${reason.label || 'Reason'}${reason.required ? html`<span class="req">*</span>` : ''}</label>
          <textarea id="cf-reason" class="textarea" maxlength="${reason.max || 500}" placeholder="${reason.placeholder || ''}"></textarea>
          ${reason.presets ? html`<div class="chips" style="margin-top:6px">${reason.presets.map((p) => html`<button type="button" class="chip" data-preset="${p}">${p}</button>`)}</div>` : ''}
          <div class="err" id="cf-err"></div></div>` : ''}
        ${typeToConfirm ? html`<div class="field" style="margin-top:16px"><label for="cf-type">Type <b class="mono">${typeToConfirm}</b> to confirm</label><input id="cf-type" class="input" autocomplete="off"></div>` : ''}`,
      footer: html`<button class="btn" data-close>Cancel</button><button class="btn ${tone === 'danger' ? 'btn-danger' : 'btn-primary'}" id="cf-ok">${confirmLabel}</button>`,
      onClose: () => { if (!done) resolve(null); }
    });
    const box = m.el; const ok = $('#cf-ok', box);
    // remove empty header title spacing
    $('.m-head', box).style.paddingBottom = '0'; $('.m-head h3', box).remove();
    box.addEventListener('click', (e) => { const p = e.target.closest('[data-preset]'); if (p) { const t = $('#cf-reason', box); t.value = p.dataset.preset; t.focus(); } });
    if (typeToConfirm) { ok.disabled = true; $('#cf-type', box).addEventListener('input', (e) => { ok.disabled = e.target.value.trim() !== typeToConfirm; }); }
    ok.addEventListener('click', () => {
      let r = '';
      if (reason) {
        r = ($('#cf-reason', box).value || '').trim();
        if (reason.required && r.length < (reason.min || 3)) { const er = $('#cf-err', box); er.textContent = `Please provide a reason (at least ${reason.min || 3} characters).`; er.style.display = 'block'; $('#cf-reason', box).focus(); return; }
      }
      done = true; m.close(); resolve({ reason: r });
    });
  });

  /* Run an async action on a button with a spinner + error toast. */
  Z.busy = async (btn, fn) => {
    if (btn) { btn.classList.add('is-loading'); btn.disabled = true; }
    try { return await fn(); } finally { if (btn) { btn.classList.remove('is-loading'); btn.disabled = false; } }
  };
  Z.spinBtn = (label, cls = 'btn-primary', attrs = '') => html`<button class="btn ${cls}" ${raw(attrs)}><span class="spin"></span>${label}</button>`;

  /* Standard empty / error / loading blocks */
  Z.empty = (title, text, icon = 'inbox', action) => html`<div class="empty"><div class="ring">${ico(icon)}</div><h4>${title}</h4><p>${text || ''}</p>${action || ''}</div>`;
  Z.errorBlock = (err, retryAct = 'reload') => html`<div class="empty"><div class="ring" style="background:var(--danger-50);color:var(--danger)">${ico('alert')}</div><h4>We couldn’t load this</h4><p>${err && err.message ? err.message : 'Unexpected error'}</p><button class="btn" style="margin-top:14px" data-act="${retryAct}">${ico('refresh')} Try again</button></div>`;
  Z.skeleton = (rows = 6) => html`<div style="padding:8px 0">${Array.from({ length: rows }, () => html`<div class="skeleton sk-row"></div>`)}</div>`;
  Z.kv = (pairs) => html`<dl class="kv">${pairs.filter(Boolean).map(([k, v]) => html`<dt>${k}</dt><dd>${v === null || v === undefined || v === '' ? raw('<span class="faint">—</span>') : v}</dd>`)}</dl>`;
})();

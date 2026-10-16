(() => {
  'use strict';
  const SESSION_KEY = 'zenjigo_admin_session';
  const cfg = window.ZENJIGO_ADMIN_CONFIG || {};
  const base = (cfg.apiBase || localStorage.getItem('zenjigo-api-url') || 'http://localhost:5000/api/v1').replace(/\/$/, '');

  function session() {
    try { return JSON.parse(localStorage.getItem(SESSION_KEY) || 'null'); } catch { return null; }
  }
  function saveSession(v) { localStorage.setItem(SESSION_KEY, JSON.stringify(v)); }
  function clearSession() { localStorage.removeItem(SESSION_KEY); }

  async function request(path, opts = {}) {
    const s = session();
    const headers = { ...(opts.headers || {}) };
    if (!(opts.body instanceof FormData)) headers['Content-Type'] = headers['Content-Type'] || 'application/json';
    if (s?.accessToken) headers.Authorization = `Bearer ${s.accessToken}`;

    let res = await fetch(base + path, { ...opts, headers });

    if (res.status === 401 && s?.refreshToken) {
      const rr = await fetch(base + '/auth/refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken: s.refreshToken })
      });
      if (rr.ok) {
        const j = await rr.json();
        const data = j.data || j;
        saveSession({ ...s, accessToken: data.accessToken, refreshToken: data.refreshToken || s.refreshToken });
        headers.Authorization = `Bearer ${data.accessToken}`;
        res = await fetch(base + path, { ...opts, headers });
      } else {
        clearSession();
        throw new Error('Session expired. Please sign in again.');
      }
    }

    const json = await res.json().catch(() => ({ success: false, message: 'Invalid server response' }));
    if (!res.ok || json.success === false) {
      throw new Error(json.message || `HTTP ${res.status}`);
    }
    return json.data !== undefined ? json.data : json;
  }

  async function login(email, password) {
    const d = await request('/auth/admin/login', {
      method: 'POST',
      body: JSON.stringify({ email, password })
    });
    return d;
  }

  async function verifyOtp(email, code) {
    const d = await request('/auth/admin/verify-otp', {
      method: 'POST',
      body: JSON.stringify({ email, code })
    });
    saveSession(d);
    return d;
  }

  async function logout() {
    const s = session();
    try {
      await request('/auth/logout', {
        method: 'POST',
        body: JSON.stringify({ refreshToken: s?.refreshToken || '' })
      });
    } catch (_) {}
    clearSession();
  }

  const get = (p) => request(p);
  const post = (p, b) => request(p, { method: 'POST', body: JSON.stringify(b) });
  const patch = (p, b) => request(p, { method: 'PATCH', body: JSON.stringify(b) });
  const put = (p, b) => request(p, { method: 'PUT', body: JSON.stringify(b) });
  const del = (p) => request(p, { method: 'DELETE' });

  window.ZenjiGOAdminAPI = {
    base, session, saveSession, clearSession, request,
    login, verifyOtp, logout, get, post, patch, put, del
  };
  // Back-compat alias used by older snippets
  window.ZENJIGO_API = (path, options = {}) => request(path, options);
})();

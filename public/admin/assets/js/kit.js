(() => {
  'use strict';
  const { html, raw, ico, esc, $, $$, setHtml, F } = window.Z;
  const Z = window.Z;
  let uid = 0;

  /* ================================================================== *
   * FORMS
   * ================================================================== */
  const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
  const flat = (def) => (def.sections ? def.sections.flatMap((s) => s.fields) : def.fields || []).filter((f) => f && f.name);

  function control(f, v, id) {
    const common = `id="${esc(id)}" name="${esc(f.name)}"${f.required ? ' aria-required="true"' : ''}${f.readonly ? ' readonly' : ''}${f.disabled ? ' disabled' : ''}${f.autocomplete ? ` autocomplete="${esc(f.autocomplete)}"` : ' autocomplete="off"'}`;
    const ph = f.placeholder ? ` placeholder="${esc(f.placeholder)}"` : '';
    const val = v == null ? '' : v;
    switch (f.type) {
      case 'textarea':
        return html`<textarea class="textarea" ${raw(common)}${raw(ph)} rows="${f.rows || 3}"${f.maxLength ? raw(` maxlength="${+f.maxLength}"`) : ''}>${val}</textarea>`;
      case 'select':
        return html`<select class="select" ${raw(common)}>${f.placeholder !== undefined ? html`<option value="">${f.placeholder}</option>` : ''}${(f.options || []).map((o) => html`<option value="${o.value}" ${String(o.value) === String(val) ? raw('selected') : ''}>${o.label}</option>`)}</select>`;
      case 'radio':
        return html`<div class="seg" role="radiogroup">${(f.options || []).map((o, i) => html`<label><input type="radio" name="${f.name}" value="${o.value}" ${String(o.value) === String(val) ? raw('checked') : ''} ${f.disabled ? raw('disabled') : ''}><span>${o.label}${o.desc ? html`<small>${o.desc}</small>` : ''}</span></label>`)}</div>`;
      case 'switch':
        return html`<div class="switch"><div><b>${f.label}</b>${f.hint ? html`<span>${f.hint}</span>` : ''}</div><label class="tgl"><input type="checkbox" ${raw(common)} ${val ? raw('checked') : ''}><i></i></label></div>`;
      case 'password':
        return html`<div class="input-wrap"><input class="input" type="password" ${raw(common)}${raw(ph)} style="padding-right:44px"><button type="button" class="iconbtn suf" data-toggle-pass aria-label="Show password" tabindex="-1">${ico('eye')}</button></div>${f.strength ? html`<div class="strength"><i></i></div>` : ''}`;
      case 'money':
        return html`<div class="input-wrap"><span class="pre">${f.prefix || 'TZS'}</span><input class="input has-pre" type="number" inputmode="decimal" step="${f.step || 1}" ${f.min != null ? raw(`min="${+f.min}"`) : ''} ${f.max != null ? raw(`max="${+f.max}"`) : ''} value="${val}" ${raw(common)}${raw(ph)}></div>`;
      case 'number':
        return html`<div class="input-wrap">${f.prefix ? html`<span class="pre">${f.prefix}</span>` : ''}<input class="input ${f.prefix ? 'has-pre' : ''}" type="number" inputmode="decimal" step="${f.step || 1}" ${f.min != null ? raw(`min="${+f.min}"`) : ''} ${f.max != null ? raw(`max="${+f.max}"`) : ''} value="${val}" ${raw(common)}${raw(ph)}></div>`;
      case 'date': return html`<input class="input" type="date" value="${val}" ${raw(common)}>`;
      case 'datetime': return html`<input class="input" type="datetime-local" value="${val}" ${raw(common)}>`;
      default: {
        const t = ['email', 'tel', 'text', 'url'].includes(f.type) ? f.type : 'text';
        return html`<input class="input" type="${t}" value="${val}" ${raw(common)}${raw(ph)}${f.maxLength ? raw(` maxlength="${+f.maxLength}"`) : ''}${t === 'tel' ? raw(' inputmode="tel"') : ''}>`;
      }
    }
  }

  class Form {
    constructor(def) { this.def = def; this.id = 'form' + ++uid; this.vals = def.values || {}; }
    fields() { return flat(this.def); }
    fieldHtml(f) {
      const id = `${this.id}_${f.name}`;
      const span = f.col || 12;
      if (f.type === 'switch') return html`<div class="field c-${span}" data-field="${f.name}">${control(f, this.vals[f.name], id)}<div class="err"></div></div>`;
      return html`<div class="field c-${span}" data-field="${f.name}">
        <label for="${id}">${f.label}${f.required ? html`<span class="req">*</span>` : html`<span class="faint" style="font-weight:400"> · optional</span>`}</label>
        ${control(f, this.vals[f.name], id)}
        ${f.hint ? html`<div class="hint">${f.hint}</div>` : ''}<div class="err"></div></div>`;
    }
    html() {
      const secs = this.def.sections || [{ fields: this.def.fields || [] }];
      return html`<form id="${this.id}" novalidate autocomplete="off"><div class="form-error" data-form-error role="alert">${ico('alert')}<span></span></div>
        ${secs.map((s) => html`<div class="form-section">${s.title ? html`<header><h4>${s.title}</h4>${s.desc ? html`<p>${s.desc}</p>` : ''}</header>` : ''}<div class="form-grid">${s.fields.filter(Boolean).map((f) => this.fieldHtml(f))}</div></div>`)}
        <button type="submit" class="sr-only" tabindex="-1">Submit</button></form>`;
    }
    bind(root) {
      const form = (this.el = $('#' + this.id, root));
      const run = () => this.applyVisibility();
      form.addEventListener('input', (e) => {
        const n = e.target.name; const f = this.fields().find((x) => x.name === n);
        if (f) { this.clearError(f.name); if (f.strength) this.strength(e.target); }
        run(); this.def.onChange && this.def.onChange(this.values(true), n);
      });
      form.addEventListener('change', run);
      form.addEventListener('focusout', (e) => { const f = this.fields().find((x) => x.name === e.target.name); if (f && e.target.value !== '') this.validateField(f); });
      form.addEventListener('click', (e) => {
        const t = e.target.closest('[data-toggle-pass]'); if (!t) return;
        const inp = t.parentElement.querySelector('input'); const show = inp.type === 'password';
        inp.type = show ? 'text' : 'password'; setHtml(t, ico(show ? 'eyeOff' : 'eye'));
      });
      form.addEventListener('submit', (e) => { e.preventDefault(); this.def.onSubmitEnter && this.def.onSubmitEnter(); });
      run(); return this;
    }
    applyVisibility() {
      const v = this.values(true);
      this.fields().forEach((f) => { if (!f.showIf) return; const w = $(`[data-field="${f.name}"]`, this.el); if (w) w.classList.toggle('hidden', !f.showIf(v)); });
    }
    strength(input) {
      const bar = input.closest('.field').querySelector('.strength i'); if (!bar) return;
      const p = input.value; let s = 0;
      if (p.length >= 10) s++; if (p.length >= 14) s++; if (/[a-z]/.test(p) && /[A-Z]/.test(p)) s++; if (/\d/.test(p)) s++; if (/[^A-Za-z0-9]/.test(p)) s++;
      bar.style.width = (s / 5) * 100 + '%'; bar.style.background = s <= 2 ? 'var(--danger)' : s <= 3 ? 'var(--warn)' : 'var(--brand)';
    }
    el$(name) { return this.el.querySelector(`[name="${name}"]`); }
    visible(f) { const w = $(`[data-field="${f.name}"]`, this.el); return !(w && w.classList.contains('hidden')); }
    values(silent) {
      const out = {};
      this.fields().forEach((f) => {
        if (f.type === 'radio') { const c = this.el.querySelector(`input[name="${f.name}"]:checked`); out[f.name] = c ? c.value : ''; return; }
        const el = this.el$(f.name); if (!el) return;
        let v;
        if (f.type === 'switch') v = el.checked;
        else if (f.type === 'number' || f.type === 'money') v = el.value === '' ? null : Number(el.value);
        else if (f.type === 'password') v = el.value;
        else v = el.value.trim();
        if (!silent && f.transform && v !== '' && v !== null) v = f.transform(v);
        out[f.name] = v;
      });
      if (!silent) this.fields().forEach((f) => { if (f.showIf && !f.showIf(out)) delete out[f.name]; });
      return out;
    }
    setError(name, msg) { const w = $(`[data-field="${name}"]`, this.el); if (!w) return; w.classList.add('invalid'); $('.err', w).textContent = msg; }
    clearError(name) { const w = $(`[data-field="${name}"]`, this.el); if (w) w.classList.remove('invalid'); }
    formError(msg) { const b = $('[data-form-error]', this.el); if (!b) return; $('span', b).textContent = msg || ''; b.classList.toggle('show', !!msg); if (msg) b.scrollIntoView({ block: 'nearest' }); }
    check(f, v, all) {
      const empty = v === '' || v === null || v === undefined || (f.type === 'switch' ? false : false);
      if (f.required && (empty || (f.type === 'radio' && !v))) return `${f.label} is required.`;
      if (empty) return null;
      if (f.type === 'email' && !EMAIL.test(v)) return 'Enter a valid email address.';
      if (f.type === 'tel') { const d = String(v).replace(/[\s\-()]/g, ''); if (!/^\+?\d{9,15}$/.test(d)) return 'Enter a valid phone number, e.g. +255 7XX XXX XXX.'; }
      if (f.type === 'url' && !/^https?:\/\/\S+\.\S+/.test(v)) return 'Enter a valid URL starting with https://';
      if (f.minLength && String(v).length < f.minLength) return `${f.label} must be at least ${f.minLength} characters.`;
      if (f.maxLength && String(v).length > f.maxLength) return `${f.label} must be at most ${f.maxLength} characters.`;
      if ((f.type === 'number' || f.type === 'money')) {
        if (!Number.isFinite(v)) return 'Enter a valid number.';
        if (f.min != null && v < f.min) return `Must be at least ${f.min}.`;
        if (f.max != null && v > f.max) return `Must be at most ${f.max}.`;
      }
      if (f.pattern && !new RegExp(f.pattern).test(v)) return f.patternMsg || 'Invalid format.';
      if (f.validate) return f.validate(v, all) || null;
      return null;
    }
    validateField(f) { const all = this.values(true); const m = this.check(f, all[f.name], all); m ? this.setError(f.name, m) : this.clearError(f.name); return !m; }
    validate() {
      this.formError('');
      const all = this.values(true); let first = null;
      this.fields().forEach((f) => {
        if (f.showIf && !f.showIf(all)) { this.clearError(f.name); return; }
        const m = this.check(f, all[f.name], all);
        if (m) { this.setError(f.name, m); first = first || f; } else this.clearError(f.name);
      });
      if (first) { const el = this.el$(first.name); el && el.focus && el.focus(); }
      return !first;
    }
  }
  Z.Form = Form;

  /** Modal containing a form. Resolves with the onSubmit result, or null when cancelled. */
  Z.formModal = (o) => new Promise((resolve) => {
    const form = new Form(o);
    let result = null;
    const m = Z.modal({
      title: o.title, subtitle: o.subtitle, size: o.size || 'lg',
      body: form.html(),
      footer: html`${o.extraFooter || ''}<button class="btn" data-close>Cancel</button>${Z.spinBtn(o.submitLabel || 'Save', o.tone === 'danger' ? 'btn-danger' : 'btn-primary', 'data-submit')}`,
      onClose: () => resolve(result)
    });
    form.bind(m.el);
    const btn = $('[data-submit]', m.el);
    const submit = async () => {
      if (!form.validate()) return;
      await Z.busy(btn, async () => {
        try { result = (await o.onSubmit(form.values())) ?? true; m.close(); }
        catch (err) { form.formError(err.message || 'Could not save. Please try again.'); if (err.status === 409 || err.status === 400) {/* keep form open */} }
      });
    };
    btn.addEventListener('click', submit); form.def.onSubmitEnter = (e) => { if (document.activeElement && document.activeElement.tagName !== 'TEXTAREA') submit(); };
    $('form', m.el).addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.tagName === 'INPUT' && e.target.type !== 'submit') { e.preventDefault(); submit(); } });
  });

  /** Multi-step wizard in a modal. steps: [{title, desc, sections|fields}] + automatic review step. */
  Z.wizard = (o) => new Promise((resolve) => {
    const steps = o.steps; const total = steps.length + 1; let i = 0; let values = { ...(o.values || {}) }; let form = null; let result = null;
    const m = Z.modal({ title: o.title, subtitle: o.subtitle, size: o.size || 'lg', body: '', footer: '', onClose: () => resolve(result) });
    const all = steps.flatMap((s) => flat(s));
    const label = (f, v) => {
      if (v === '' || v == null) return raw('<span class="faint">Not provided</span>');
      if (f.type === 'password') return '••••••••';
      if (f.type === 'select' || f.type === 'radio') { const op = (f.options || []).find((x) => String(x.value) === String(v)); return op ? op.label : v; }
      if (f.type === 'switch') return v ? 'Yes' : 'No';
      if (f.type === 'money') return F.money(v);
      return v;
    };
    function render() {
      const head = html`<div class="steps">${[...steps.map((s) => s.title), 'Review'].map((t, n) => html`<div class="step ${n < i ? 'done' : n === i ? 'active' : ''}"><span class="n">${n < i ? ico('check') : n + 1}</span><span class="t">${t}</span></div>`)}</div>`;
      if (i < steps.length) {
        form = new Form({ ...steps[i], values });
        m.body(html`${head}${steps[i].desc ? html`<p class="muted" style="margin-bottom:16px">${steps[i].desc}</p>` : ''}${form.html()}`);
        form.bind(m.el);
      } else {
        form = null;
        const groups = steps.map((s) => html`<div class="section-title">${s.title}</div>${Z.kv(flat(s).filter((f) => !f.showIf || f.showIf(values)).map((f) => [f.label, label(f, values[f.name])]))}`);
        m.body(html`${head}<div class="form-error" data-form-error role="alert">${ico('alert')}<span></span></div>${o.reviewIntro || ''}${groups}`);
      }
      const last = i === steps.length;
      m.foot(html`${i > 0 ? html`<button class="btn" data-w="back" style="margin-right:auto">${ico('chevL')} Back</button>` : html`<button class="btn" data-close style="margin-right:auto">Cancel</button>`}
        ${last ? Z.spinBtn(o.submitLabel || 'Submit', 'btn-primary', 'data-w="submit"') : html`<button class="btn btn-primary" data-w="next">Continue ${ico('chevR')}</button>`}`);
      $('.m-body', m.el).scrollTop = 0;
    }
    m.el.addEventListener('click', async (e) => {
      const b = e.target.closest('[data-w]'); if (!b) return;
      const w = b.dataset.w;
      if (w === 'back') { if (form) values = { ...values, ...form.values(true) }; i--; render(); }
      else if (w === 'next') { if (!form.validate()) return; values = { ...values, ...form.values() }; i++; render(); }
      else if (w === 'submit') {
        await Z.busy(b, async () => {
          try { result = (await o.onSubmit(values)) ?? true; m.close(); }
          catch (err) { const bx = $('[data-form-error]', m.el); $('span', bx).textContent = err.message; bx.classList.add('show'); }
        });
      }
    });
    m.el.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.tagName === 'INPUT') { e.preventDefault(); const n = $('[data-w="next"]', m.el); n && n.click(); } });
    render();
  });

  /* ================================================================== *
   * DATA TABLE — client-side search / filter / sort / paginate / export
   * ================================================================== */
  class Table {
    constructor(o) {
      this.o = o; this.id = 'tbl' + ++uid; this.rows = o.rows || []; this.page = 1; this.size = o.pageSize || 15;
      this.q = ''; this.sort = o.defaultSort || null; this.filters = {}; this.tab = o.tabs ? (o.defaultTab || o.tabs[0].key) : null;
      (o.filters || []).forEach((f) => (this.filters[f.key] = ''));
    }
    get filtered() {
      const { o } = this; let r = this.rows;
      if (o.tabs) { const t = o.tabs.find((x) => x.key === this.tab); if (t && t.fn) r = r.filter(t.fn); }
      (o.filters || []).forEach((f) => { const v = this.filters[f.key]; if (v) r = r.filter((row) => f.fn(row, v)); });
      if (this.q) { const q = this.q.toLowerCase(); r = r.filter((row) => (o.search ? o.search(row) : JSON.stringify(row)).toString().toLowerCase().includes(q)); }
      if (this.sort) {
        const c = o.columns.find((x) => x.key === this.sort.key);
        if (c) { const g = typeof c.sort === 'function' ? c.sort : (row) => row[c.key]; const d = this.sort.dir === 'asc' ? 1 : -1;
          r = [...r].sort((a, b) => { let x = g(a), y = g(b); if (x == null) return 1; if (y == null) return -1; if (typeof x === 'string') { x = x.toLowerCase(); y = String(y).toLowerCase(); } return x > y ? d : x < y ? -d : 0; }); }
      }
      return r;
    }
    mount(el) {
      this.el = el; const { o } = this;
      setHtml(el, html`${o.tabs ? html`<div class="tabs" data-tabs></div>` : ''}
        <div class="toolbar">
          ${o.search ? html`<div class="tsearch">${ico('search')}<input class="input" data-q placeholder="${o.searchPlaceholder || 'Search…'}" aria-label="Search"></div>` : ''}
          ${(o.filters || []).map((f) => html`<select class="select" style="width:auto;min-width:140px" data-filter="${f.key}" aria-label="${f.label}"><option value="">${f.label}: All</option>${f.options.map((x) => html`<option value="${x.value ?? x}">${x.label ?? F.title(x)}</option>`)}</select>`)}
          <div style="margin-left:auto" class="row">${o.toolbar || ''}${o.onRefresh ? html`<button class="btn btn-sm" data-t="refresh" title="Refresh">${ico('refresh')}<span>Refresh</span></button>` : ''}${o.export !== false ? html`<button class="btn btn-sm" data-t="export" title="Export CSV">${ico('download')}<span>Export</span></button>` : ''}</div>
        </div>
        <div class="tbl-wrap" data-body></div><div class="pager" data-pager></div>`);
      el.addEventListener('input', (e) => { if (e.target.matches('[data-q]')) { this.q = e.target.value.trim(); this.page = 1; this.draw(); } });
      el.addEventListener('change', (e) => { const f = e.target.dataset.filter; if (f) { this.filters[f] = e.target.value; this.page = 1; this.draw(); } if (e.target.matches('[data-size]')) { this.size = +e.target.value; this.page = 1; this.draw(); } });
      el.addEventListener('click', (e) => {
        const t = e.target.closest('[data-tab]'); if (t) { this.tab = t.dataset.tab; this.page = 1; this.draw(); return; }
        const th = e.target.closest('th[data-sort]'); if (th) { const k = th.dataset.sort; this.sort = this.sort && this.sort.key === k ? { key: k, dir: this.sort.dir === 'asc' ? 'desc' : 'asc' } : { key: k, dir: 'asc' }; this.draw(); return; }
        const pg = e.target.closest('[data-page]'); if (pg) { this.page = +pg.dataset.page; this.draw(); return; }
        const tb = e.target.closest('[data-t]'); if (tb) { if (tb.dataset.t === 'export') this.export(); if (tb.dataset.t === 'refresh') o.onRefresh(); return; }
        if (e.target.closest('button,a,input,select,label,[data-act],[data-stop]')) return;
        const tr = e.target.closest('tr[data-i]'); if (tr && o.onRow) o.onRow(this.view[+tr.dataset.i]);
      });
      el.addEventListener('keydown', (e) => { if (e.key === 'Enter') { const tr = e.target.closest('tr[data-i]'); if (tr && o.onRow && e.target === tr) o.onRow(this.view[+tr.dataset.i]); } });
      this.draw(); return this;
    }
    setRows(rows) { this.rows = rows; this.draw(); }
    draw() {
      const { o } = this; const all = this.filtered; const pages = Math.max(1, Math.ceil(all.length / this.size));
      if (this.page > pages) this.page = pages;
      const start = (this.page - 1) * this.size; const view = (this.view = all.slice(start, start + this.size));
      if (o.tabs) {
        setHtml($('[data-tabs]', this.el), html`${o.tabs.map((t) => { const n = t.fn ? this.rows.filter(t.fn).length : this.rows.length; return html`<button class="tab ${t.key === this.tab ? 'active' : ''}" data-tab="${t.key}">${t.label}<span class="c ${t.hot && n ? 'hot' : ''}">${n}</span></button>`; })}`);
      }
      const body = $('[data-body]', this.el);
      if (!all.length) {
        setHtml(body, this.rows.length ? Z.empty('No matches', 'Try adjusting your search or filters.', 'search') : (o.empty || Z.empty('Nothing here yet', '', 'inbox')));
      } else {
        setHtml(body, html`<table class="tbl"><thead><tr>${o.columns.map((c) => { const s = c.sort !== false && c.label; const cur = this.sort && this.sort.key === c.key; return html`<th ${s ? raw(`class="sortable" data-sort="${esc(c.key)}"`) : ''} ${c.align === 'right' ? raw('style="text-align:right"') : ''} ${cur ? raw(`aria-sort="${this.sort.dir === 'asc' ? 'ascending' : 'descending'}"`) : ''}>${c.label}${cur ? html`<span class="arr">${this.sort.dir === 'asc' ? '▲' : '▼'}</span>` : ''}</th>`; })}</tr></thead>
          <tbody>${view.map((row, i) => html`<tr data-i="${i}" ${o.onRow ? raw('class="clickable" tabindex="0"') : ''}>${o.columns.map((c) => html`<td ${c.align === 'right' ? raw('style="text-align:right"') : ''} ${c.nowrap ? raw('class="nowrap"') : ''}>${c.render ? c.render(row) : (row[c.key] ?? '—')}</td>`)}</tr>`)}</tbody></table>`);
      }
      setHtml($('[data-pager]', this.el), all.length ? html`<div>Showing <b>${start + 1}–${Math.min(start + this.size, all.length)}</b> of <b>${all.length}</b>${all.length !== this.rows.length ? html` <span class="faint">(filtered from ${this.rows.length})</span>` : ''}</div>
        <div class="btns"><select class="select" data-size style="width:auto;height:32px">${[15, 25, 50, 100].map((n) => html`<option value="${n}" ${n === this.size ? raw('selected') : ''}>${n} / page</option>`)}</select>
        <button class="btn btn-sm btn-icon" data-page="${this.page - 1}" ${this.page <= 1 ? raw('disabled') : ''} aria-label="Previous page">${ico('chevL')}</button><span>Page ${this.page} / ${pages}</span>
        <button class="btn btn-sm btn-icon" data-page="${this.page + 1}" ${this.page >= pages ? raw('disabled') : ''} aria-label="Next page">${ico('chevR')}</button></div>` : '');
      if (this.o.onDraw) this.o.onDraw(this);
    }
    export() {
      const cols = this.o.columns.filter((c) => c.label && c.csv !== false);
      const lines = [cols.map((c) => Z.csvCell(c.label)).join(',')];
      this.filtered.forEach((r) => lines.push(cols.map((c) => Z.csvCell(c.csv ? c.csv(r) : r[c.key])).join(',')));
      Z.download(`${this.o.exportName || 'export'}-${new Date().toISOString().slice(0, 10)}.csv`, lines.join('\r\n'));
      Z.toast(`${this.filtered.length} rows exported.`);
    }
  }
  Z.Table = Table;

  /* ================================================================== *
   * CHARTS (dependency-free SVG)
   * ================================================================== */
  const nice = (m) => { if (m <= 4) return 4; const p = Math.pow(10, Math.floor(Math.log10(m))); const n = m / p; return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p; };
  const short = (n) => (n >= 1e6 ? (n / 1e6).toFixed(n % 1e6 ? 1 : 0) + 'M' : n >= 1e3 ? (n / 1e3).toFixed(n % 1e3 ? 1 : 0) + 'k' : String(Math.round(n)));
  Z.chart = {
    bars({ labels, series, height = 230, fmt = (n) => n }) {
      const W = 640, H = height, L = 38, B = 26, T = 10, R = 8; const n = labels.length;
      const totals = labels.map((_, i) => series.reduce((a, s) => a + (s.values[i] || 0), 0));
      const max = nice(Math.max(1, ...totals)); const bw = (W - L - R) / n; const bar = Math.min(26, bw * 0.62);
      const y = (v) => T + (H - T - B) * (1 - v / max);
      const grid = [0, 1, 2, 3, 4].map((g) => { const v = (max / 4) * g; return html`<line class="grid-l" x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}"/><text x="${L - 6}" y="${y(v) + 4}" text-anchor="end">${short(v)}</text>`; });
      const bars = labels.map((lb, i) => { let acc = 0; const x = L + bw * i + (bw - bar) / 2;
        return html`<g>${series.map((s) => { const v = s.values[i] || 0; if (!v) return ''; const y0 = y(acc + v), h = y(acc) - y0; acc += v; return html`<rect x="${x}" y="${y0}" width="${bar}" height="${Math.max(h, 1)}" rx="3" style="fill:${s.color}"><title>${lb} · ${s.name}: ${fmt(v)}</title></rect>`; })}
        ${i % Math.ceil(n / 7) === 0 ? html`<text x="${x + bar / 2}" y="${H - 8}" text-anchor="middle">${lb}</text>` : ''}</g>`; });
      return html`<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Bar chart">${grid}${bars}</svg>`;
    },
    line({ labels, values, color = 'var(--brand)', height = 230, fmt = (n) => n }) {
      const W = 640, H = height, L = 44, B = 26, T = 12, R = 10; const n = labels.length; const max = nice(Math.max(1, ...values));
      const x = (i) => L + ((W - L - R) * i) / Math.max(1, n - 1); const y = (v) => T + (H - T - B) * (1 - v / max);
      const pts = values.map((v, i) => `${x(i)},${y(v)}`); const gid = 'g' + ++uid;
      const grid = [0, 1, 2, 3, 4].map((g) => { const v = (max / 4) * g; return html`<line class="grid-l" x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}"/><text x="${L - 6}" y="${y(v) + 4}" text-anchor="end">${short(v)}</text>`; });
      return html`<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Line chart"><defs><linearGradient id="${gid}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" style="stop-color:${color};stop-opacity:.28"/><stop offset="1" style="stop-color:${color};stop-opacity:0"/></linearGradient></defs>
        ${grid}<polygon points="${L},${y(0)} ${pts.join(' ')} ${x(n - 1)},${y(0)}" style="fill:url(#${gid})"/><polyline points="${pts.join(' ')}" style="fill:none;stroke:${color};stroke-width:2.5;stroke-linejoin:round;stroke-linecap:round"/>
        ${values.map((v, i) => html`<circle cx="${x(i)}" cy="${y(v)}" r="3.5" style="fill:var(--surface);stroke:${color};stroke-width:2"><title>${labels[i]}: ${fmt(v)}</title></circle>${i % Math.ceil(n / 7) === 0 ? html`<text x="${x(i)}" y="${H - 8}" text-anchor="middle">${labels[i]}</text>` : ''}`)}</svg>`;
    },
    donut({ items, size = 150, center }) {
      const total = items.reduce((a, b) => a + b.value, 0); const r = 54, c = 2 * Math.PI * r; let off = 0;
      const segs = total ? items.filter((i) => i.value > 0).map((it) => { const len = (it.value / total) * c; const s = html`<circle cx="70" cy="70" r="${r}" fill="none" style="stroke:${it.color}" stroke-width="18" stroke-dasharray="${len} ${c - len}" stroke-dashoffset="${-off}" transform="rotate(-90 70 70)"><title>${it.label}: ${it.value}</title></circle>`; off += len; return s; }) : html`<circle cx="70" cy="70" r="${r}" fill="none" style="stroke:var(--surface-3)" stroke-width="18"/>`;
      return html`<div class="donut-wrap"><svg viewBox="0 0 140 140" width="${size}" height="${size}" role="img" aria-label="Distribution chart">${segs}<text x="70" y="68" text-anchor="middle" style="font-size:22px;font-weight:700;fill:var(--text)">${center ?? total}</text><text x="70" y="86" text-anchor="middle" style="font-size:10.5px;fill:var(--text-3)">total</text></svg>
        <div class="donut-legend">${items.map((it) => html`<div><i style="width:10px;height:10px;border-radius:3px;background:${it.color};display:inline-block"></i>${it.label}<b>${it.value}</b></div>`)}</div></div>`;
    }
  };
})();

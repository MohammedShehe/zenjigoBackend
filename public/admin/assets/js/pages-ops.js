(() => {
  'use strict';
  const Z = window.Z; const { html, raw, ico, $, $$, setHtml, F } = Z;
  const get = (p, o) => Z.api.get(p, o);

  const TYPE_LABEL = { boda: 'Boda', bajaji: 'Bajaji', taxi: 'Taxi' };
  const typeBadge = (t) => html`<span class="badge nodot ${t === 'taxi' ? 'badge-info' : t === 'bajaji' ? 'badge-violet' : 'badge-warn'}">${TYPE_LABEL[t] || F.title(t)}</span>`;
  Z.typeBadge = typeBadge;
  const pageHead = (t, p, actions) => html`<div class="page-head"><div><h2>${t}</h2>${p ? html`<p>${p}</p>` : ''}</div><div class="actions">${actions || ''}</div></div>`;
  Z.pageHead = pageHead;

  /* ============================== Dashboard ============================== */
  Z.pages.dashboard = {
    title: 'Dashboard', subtitle: 'Platform health and what needs your attention',
    async render(ctx) {
      const [d, rides, audit] = await Promise.all([get('/admin/dashboard', { fresh: true }), get('/admin/rides', { ttl: 10000 }), get('/admin/audit-logs', { ttl: 10000 }).catch(() => [])]);
      if (!ctx.alive()) return; Z.dash = d;
      const q = d.queues; const hour = new Date().getHours();
      const labels = d.trend.map((t) => { const x = Z.toDate(t.day); return x.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', timeZone: 'UTC' }); });
      const comp = d.trend.map((t) => t.completed), canc = d.trend.map((t) => t.cancelled), other = d.trend.map((t) => Math.max(0, t.rides - t.completed - t.cancelled));
      const sc = { completed: 'var(--brand)', cancelled: 'var(--danger)', started: 'var(--info)', accepted: 'var(--violet)', arriving: 'var(--violet)', arrived: 'var(--violet)', searching: 'var(--warn)' };
      const attention = [
        ['Driver applications', q.driverApplications, 'drivers', 'id', 'warm'], ['Documents to review', q.documents, 'documents', 'fileCheck', 'warm'],
        ['Driver change requests', q.changeRequests, 'requests', 'inbox', 'warm'], ['Payout requests', q.payouts, 'withdrawals', 'cash', 'warm'],
        ['Payments awaiting confirmation', q.payments, 'finance', 'card', 'warm'], ['Open safety reports', q.reports, 'reports', 'flag', 'hot'],
        ['Unread support messages', q.supportUnread, 'support', 'chat', 'warm'], ['Documents expiring ≤30 days', q.expiringDocuments, 'documents', 'clock', 'warm'],
        ['Drivers blocked for unpaid commission', q.blockedDrivers, 'finance', 'ban', 'hot'], ['Parcels awaiting a driver', q.parcels, 'parcels', 'package', 'warm'],
        ['Tour bookings to assign', q.tourBookings, 'tours', 'compass', 'warm']
      ];
      const urgent = attention.filter((a) => a[1] > 0).length;
      setHtml(ctx.el, html`
        ${pageHead(`Good ${hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : 'evening'}, ${Z.me.fullName.split(' ')[0]}`, new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Africa/Dar_es_Salaam' }),
          html`<button class="btn" data-act="reload">${ico('refresh')} Refresh</button><a class="btn btn-primary" href="#/live">${ico('radio')} Live operations</a>`)}
        <div class="grid g-4" style="margin-bottom:18px">
          ${[['Rides today', F.num(d.todayRides), `${F.num(d.activeRides)} in progress now`, 'car', ''], ['Revenue today', F.money(d.todayRevenue), `${F.money(d.finance.revenue30d)} last 30 days`, 'cash', 'blue'],
            ['Drivers online', F.num(d.onlineDrivers), `${F.num(d.drivers)} registered drivers`, 'radio', 'violet'], ['Commission (30 days)', F.money(d.finance.commission30d), `${F.money(d.finance.commissionOutstanding)} outstanding`, 'wallet', 'amber']]
            .map(([l, v, s, i, c]) => html`<div class="card kpi"><div class="row between"><span class="label">${l}</span><span class="ico ${c}">${ico(i)}</span></div><div class="value">${v}</div><div class="sub">${s}</div></div>`)}
        </div>
        <div class="grid g-main" style="margin-bottom:18px">
          <div class="card"><div class="card-h"><div><h3>Rides — last 14 days</h3><small>Completed, cancelled and in-flight requests</small></div><div class="legend"><span><i style="background:var(--brand)"></i>Completed</span><span><i style="background:var(--danger)"></i>Cancelled</span><span><i style="background:var(--border-2)"></i>Other</span></div></div>
            <div class="card-b">${Z.chart.bars({ labels, series: [{ name: 'Completed', color: 'var(--brand)', values: comp }, { name: 'Cancelled', color: 'var(--danger)', values: canc }, { name: 'Other', color: 'var(--border-2)', values: other }] })}</div></div>
          <div class="card"><div class="card-h"><div><h3>Needs attention</h3><small>${urgent ? `${urgent} queue${urgent > 1 ? 's' : ''} with work waiting` : 'Everything is up to date'}</small></div></div>
            <div class="card-b" style="display:flex;flex-direction:column;gap:8px;max-height:330px;overflow:auto">${attention.sort((a, b) => b[1] - a[1]).map(([l, n, p, i, t]) => html`<a class="attn ${n ? t : 'zero'}" href="#/${p}"><span class="ico">${ico(i)}</span><span>${l}</span><span class="n">${n}</span></a>`)}</div></div>
        </div>
        <div class="grid g-3" style="margin-bottom:18px">
          <div class="card"><div class="card-h"><div><h3>Revenue — last 14 days</h3><small>Completed ride fares</small></div></div><div class="card-b">${Z.chart.line({ labels, values: d.trend.map((t) => t.revenue), fmt: (n) => F.money(n), height: 200 })}</div></div>
          <div class="card"><div class="card-h"><div><h3>Ride outcomes</h3><small>Last 30 days</small></div></div><div class="card-b">${Z.chart.donut({ items: d.ridesByStatus.map((s) => ({ label: F.title(s.status), value: s.count, color: sc[s.status] || 'var(--text-3)' })) })}</div></div>
          <div class="card"><div class="card-h"><div><h3>Vehicle mix</h3><small>Rides by vehicle type, 30 days</small></div></div><div class="card-b">${Z.chart.donut({ items: d.ridesByType.map((s) => ({ label: TYPE_LABEL[s.type] || s.type, value: s.count, color: s.type === 'taxi' ? 'var(--info)' : s.type === 'bajaji' ? 'var(--violet)' : 'var(--warn)' })) })}</div></div>
        </div>
        <div class="grid g-main">
          <div class="card"><div class="card-h"><h3>Latest rides</h3><a class="btn btn-sm" href="#/rides">View all ${ico('chevR')}</a></div><div class="card-b flush tbl-wrap">${rides.length ? html`<table class="tbl"><thead><tr><th>Ride</th><th>Rider</th><th>Fare</th><th>Status</th><th>When</th></tr></thead><tbody>${rides.slice(0, 8).map((r) => html`<tr class="clickable" data-ride="${r.id}"><td><b class="mono">${r.ride_code}</b><div class="faint" style="font-size:12px">${typeBadge(r.ride_type)}</div></td><td>${r.riderName}</td><td>${F.money(r.final_fare ?? r.estimated_fare)}</td><td>${Z.badge(r.status)}</td><td class="muted nowrap">${F.ago(r.created_at)}</td></tr>`)}</tbody></table>` : Z.empty('No rides yet', 'Rides will appear here as riders book trips.', 'car')}</div></div>
          <div class="card"><div class="card-h"><h3>Recent admin activity</h3><a class="btn btn-sm" href="#/audit">Audit log ${ico('chevR')}</a></div><div class="card-b">${audit.length ? html`<ul class="timeline">${audit.slice(0, 7).map((a) => html`<li><b>${F.title(a.action)}</b><small>${a.adminName || 'Admin'} · ${F.ago(a.created_at)}</small></li>`)}</ul>` : Z.empty('No activity recorded', '', 'clock')}</div></div>
        </div>`);
      ctx.el.addEventListener('click', (e) => { const t = e.target.closest('[data-ride]'); if (t) Z.openRide(t.dataset.ride); });
    }
  };

  /* ============================== Rides ============================== */
  Z.openRide = async (id) => {
    const h = Z.drawer({ title: 'Ride details', subtitle: 'Loading…', size: 'lg', body: Z.skeleton(8) });
    try {
      const { ride: r, events } = await get(`/admin/rides/${id}`, { fresh: true });
      h.title(`Ride ${r.ride_code}`); $('.m-head p', h.el).innerHTML = '';
      const steps = [['Requested', r.requested_at || r.created_at], ['Accepted', r.accepted_at], ['Arrived', r.arrived_at], ['Started', r.started_at], ['Completed', r.completed_at], ['Cancelled', r.cancelled_at]].filter((s) => s[1]);
      const fare = Number(r.final_fare ?? r.estimated_fare ?? 0);
      let pinShown = false;
      h.body(html`<div class="row wrap" style="gap:8px;margin-bottom:14px">${Z.badge(r.status)}${typeBadge(r.ride_type)}<span class="badge nodot">${F.title(r.payment_method)}</span>${r.promo_code ? html`<span class="badge nodot badge-violet">Promo ${r.promo_code}</span>` : ''}</div>
        ${r.status === 'cancelled' && r.cancel_reason ? html`<div class="banner danger" style="margin-bottom:14px">${ico('xCircle')}<div><b>Cancelled</b><span>${r.cancel_reason}</span></div></div>` : ''}
        <div class="section-title">Route</div><div class="route"><div><b>${r.pickup_address}</b><small>Pickup · ${Number(r.pickup_lat).toFixed(5)}, ${Number(r.pickup_lng).toFixed(5)}</small></div><div class="to"><b>${r.destination_address}</b><small>Destination · ${Number(r.destination_lat).toFixed(5)}, ${Number(r.destination_lng).toFixed(5)}</small></div></div>
        <div class="section-title">People</div>
        <div class="grid g-2"><div class="card card-b" style="padding:14px">${Z.userCell(r.riderName, r.riderPhone, null, r.rider_id)}<a class="btn btn-sm" style="margin-top:10px" href="#/riders/${r.rider_id}" data-close>View rider</a></div>
          <div class="card card-b" style="padding:14px">${r.driver_id ? html`${Z.userCell(r.driverName, r.driverPhone, null, r.driver_id)}<a class="btn btn-sm" style="margin-top:10px" href="#/drivers/${r.driver_id}" data-close>View driver</a>` : html`<span class="muted">No driver assigned</span>`}</div></div>
        <div class="section-title">Fare</div>
        ${Z.kv([['Estimated fare', F.money(r.estimated_fare)], ['Final fare', r.final_fare != null ? F.money(r.final_fare) : null], ['Discount', Number(r.discount) ? '− ' + F.money(r.discount) : null], ['Tip', Number(r.tip) ? F.money(r.tip) : null], ['Cancellation fee', Number(r.cancellation_fee) ? `${F.money(r.cancellation_fee)} ${r.cancellation_fee_applied ? '(applied)' : '(not applied)'}` : null], ['Total paid', F.money(r.total_paid)], ['Distance / time', `${F.km(r.estimated_distance_km)} · ${r.estimated_duration_min ?? '—'} min`]])}
        <div class="section-title">Trip PIN</div><div class="row"><span class="mono" id="pinVal" style="font-size:16px;letter-spacing:.2em">••••</span><button class="btn btn-sm" id="pinBtn">${ico('eye')} Reveal</button><span class="faint" style="font-size:12px">Share only with the rider or driver if they ask support.</span></div>
        <div class="section-title">Timeline</div><ul class="timeline">${steps.map(([l, t]) => html`<li class="${l === 'Cancelled' ? 'bad' : ''}"><b>${l}</b><small>${F.dt(t)}</small></li>`)}</ul>
        ${events.length ? html`<div class="section-title">System events</div><ul class="timeline">${events.map((e) => { const p = Z.parseJson(e.payload); return html`<li class="muted"><b>${F.title(e.event_type)}</b><small>${F.dt(e.created_at)}${p && p.status ? ' · ' + p.status : ''}</small></li>`; })}</ul>` : ''}`);
      $('#pinBtn', h.el).addEventListener('click', (ev) => { pinShown = !pinShown; $('#pinVal', h.el).textContent = pinShown ? r.trip_pin : '••••'; ev.currentTarget.lastChild.textContent = pinShown ? ' Hide' : ' Reveal'; });
    } catch (e) { h.body(Z.errorBlock(e)); }
  };
  Z.pages.rides = {
    title: 'Rides', subtitle: 'Every ride request on the platform',
    async render(ctx) {
      const load = async (fresh) => get('/admin/rides', { fresh });
      const rows = await load(); if (!ctx.alive()) return;
      const t = new Z.Table({
        rows, exportName: 'rides', search: (r) => `${r.ride_code} ${r.riderName} ${r.driverName || ''} ${r.pickup_address} ${r.destination_address}`, searchPlaceholder: 'Search code, rider, driver, place…',
        tabs: [{ key: 'all', label: 'All' }, { key: 'live', label: 'In progress', fn: (r) => ['searching', 'accepted', 'arriving', 'arrived', 'started'].includes(r.status) }, { key: 'done', label: 'Completed', fn: (r) => r.status === 'completed' }, { key: 'cx', label: 'Cancelled', fn: (r) => r.status === 'cancelled' }],
        filters: [{ key: 'type', label: 'Vehicle', options: ['boda', 'bajaji', 'taxi'], fn: (r, v) => r.ride_type === v }, { key: 'pay', label: 'Payment', options: ['cash', 'wallet', 'momo', 'bank', 'card'], fn: (r, v) => r.payment_method === v }],
        defaultSort: { key: 'created', dir: 'desc' }, onRow: (r) => Z.openRide(r.id), onRefresh: async () => { t.setRows(await load(true)); Z.toast('Rides refreshed.'); },
        columns: [
          { key: 'ride_code', label: 'Ride', render: (r) => html`<b class="mono">${r.ride_code}</b>` },
          { key: 'riderName', label: 'Rider', render: (r) => r.riderName }, { key: 'driverName', label: 'Driver', render: (r) => r.driverName || html`<span class="faint">Unassigned</span>`, csv: (r) => r.driverName || '' },
          { key: 'ride_type', label: 'Type', render: (r) => typeBadge(r.ride_type) },
          { key: 'route', label: 'Route', sort: false, render: (r) => html`<div style="max-width:280px"><div style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${r.pickup_address}</div><div class="faint" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">→ ${r.destination_address}</div></div>`, csv: (r) => `${r.pickup_address} -> ${r.destination_address}` },
          { key: 'fare', label: 'Fare', sort: (r) => Number(r.final_fare ?? r.estimated_fare), render: (r) => html`<b>${F.money(r.final_fare ?? r.estimated_fare)}</b>`, csv: (r) => r.final_fare ?? r.estimated_fare },
          { key: 'payment_method', label: 'Payment', render: (r) => F.title(r.payment_method) },
          { key: 'status', label: 'Status', render: (r) => Z.badge(r.status) },
          { key: 'created', label: 'Requested', sort: (r) => r.created_at, render: (r) => html`<span class="nowrap">${F.dt(r.created_at)}</span>`, csv: (r) => r.created_at }
        ]
      });
      setHtml(ctx.el, html`${pageHead('Rides', `${F.num(rows.length)} most recent rides`)}<div class="card" id="tbl"></div>`); t.mount($('#tbl', ctx.el));
    }
  };

  /* ============================== Live operations ============================== */
  /* Google Maps JavaScript API — key is fetched from the backend (admin-authenticated), never hard-coded. */
  let gmapsP;
  const loadGoogleMaps = () => gmapsP || (gmapsP = new Promise(async (res, rej) => {
    if (window.google && window.google.maps) return res(window.google.maps);
    let key = '';
    try { const c = await get('/admin/maps-config', { fresh: true }); key = (c && c.key) || ''; } catch (e) { gmapsP = null; return rej(new Error('Could not load the map configuration (' + (e && e.message ? e.message : 'unknown error') + '). If this says “not found”, the backend has not been redeployed with the new /admin/maps-config route.')); }
    if (!key) { gmapsP = null; return rej(new Error('GOOGLE_MAPS_BROWSER_KEY (or GOOGLE_MAPS_API_KEY) is not set on the server.')); }
    window.gm_authFailure = () => { gmapsP = null; const m = document.getElementById('map'); if (m) m.innerHTML = '<div class="empty"><h4>Google Maps rejected the key</h4><p>Enable “Maps JavaScript API”, enable billing, and allow this site in the key’s HTTP-referrer restrictions.</p></div>'; };
    // With loading=async the classes live in libraries; import the ones the live map uses before resolving.
    window.__zgMapsReady = async () => {
      try {
        const m = window.google.maps;
        if (m.importLibrary) await Promise.all([m.importLibrary('maps'), m.importLibrary('core'), m.importLibrary('marker')]);
        res(m);
      } catch (e) { gmapsP = null; rej(new Error('Google Maps libraries failed to load.')); }
    };
    const s = document.createElement('script'); s.async = true; s.defer = true;
    s.src = 'https://maps.googleapis.com/maps/api/js?key=' + encodeURIComponent(key) + '&callback=__zgMapsReady&loading=async&v=weekly';
    s.onerror = () => { gmapsP = null; rej(new Error('Google Maps could not be loaded.')); };
    document.head.append(s);
  }));
  Z.pages.live = {
    title: 'Live operations', subtitle: 'Active rides and online drivers, refreshed automatically',
    async render(ctx) {
      setHtml(ctx.el, html`${pageHead('Live operations', 'Updates every 10 seconds while this page is open', html`<span class="badge badge-success" id="liveState">Live</span><button class="btn" id="livePause">${ico('pause')} Pause</button>`)}
        <div class="grid g-4" style="margin-bottom:18px" id="liveKpi"></div>
        <div class="live-grid"><div class="card"><div class="card-h"><h3>Map</h3><div class="legend"><span><i style="background:#12b76a"></i>Driver</span><span><i style="background:#1570ef"></i>Pickup</span><span><i style="background:#d92d20"></i>Destination</span></div></div><div id="map"></div></div>
        <div class="card"><div class="tabs"><button class="tab active" data-lt="rides">Active rides <span class="c" id="cRides">0</span></button><button class="tab" data-lt="drivers">Drivers online <span class="c" id="cDrivers">0</span></button></div><div class="live-list" id="liveList"></div></div></div>`);
      let G = null, map, markers = [], lines = [], info, data = { rides: [], drivers: [] }, tab = 'rides', paused = false, first = true;
      try { G = await loadGoogleMaps(); } catch (e) { setHtml($('#map', ctx.el), html`<div class="empty"><div class="ring">${ico('pin')}</div><h4>Map unavailable</h4><p>${e.message} The lists on the right still update.</p></div>`); }
      if (!ctx.alive()) return;
      if (G) {
        map = new G.Map($('#map', ctx.el), { center: { lat: -6.165, lng: 39.2 }, zoom: 11, mapTypeControl: false, streetViewControl: false, fullscreenControl: true, clickableIcons: false });
        info = new G.InfoWindow();
      }
      const dot = (c) => ({ path: G.SymbolPath.CIRCLE, scale: 8, fillColor: c, fillOpacity: 1, strokeColor: '#ffffff', strokeWeight: 3 });
      const popup = (lines) => { const d = document.createElement('div'); d.style.color = '#101828'; lines.forEach((l, i) => { const e = document.createElement(i ? 'div' : 'b'); e.textContent = l; d.append(e); }); return d; };
      const addMarker = (pos, color, title, content) => { const m = new G.Marker({ position: pos, map, icon: dot(color), title }); m.addListener('click', () => { info.setContent(content); info.open({ map, anchor: m }); }); markers.push(m); };
      function draw() {
        $('#cRides').textContent = data.rides.length; $('#cDrivers').textContent = data.drivers.length;
        setHtml($('#liveKpi'), html`${[['Active rides', data.rides.length, 'car', ''], ['Searching for a driver', data.rides.filter((r) => r.status === 'searching').length, 'search', 'amber'], ['Trips in progress', data.rides.filter((r) => r.status === 'started').length, 'activity', 'blue'], ['Drivers online', data.drivers.length, 'radio', 'violet']].map(([l, v, i, c]) => html`<div class="card kpi"><div class="row between"><span class="label">${l}</span><span class="ico ${c}">${ico(i)}</span></div><div class="value">${v}</div></div>`)}`);
        if (G && map) {
          markers.forEach((m) => m.setMap(null)); lines.forEach((l) => l.setMap(null)); markers = []; lines = []; const bounds = new G.LatLngBounds(); let n = 0;
          const ok = (p) => Number.isFinite(p.lat) && Number.isFinite(p.lng) && !(p.lat === 0 && p.lng === 0);
          data.drivers.forEach((d) => { const p = { lat: Number(d.lat), lng: Number(d.lng) }; if (!ok(p)) return; bounds.extend(p); n++; addMarker(p, '#12b76a', d.fullName, popup([d.fullName, `${F.title(d.vehicleType || '')} ${d.plateNumber || ''}`, `Updated ${F.ago(d.locationUpdatedAt)}`])); });
          data.rides.forEach((r) => { const a = { lat: Number(r.pickupLat), lng: Number(r.pickupLng) }, z = { lat: Number(r.destinationLat), lng: Number(r.destinationLng) }; if (!ok(a)) return; bounds.extend(a); n++;
            addMarker(a, '#1570ef', `${r.rideCode} pickup`, popup([`${r.rideCode} · ${F.title(r.status)}`, r.pickupAddress, `Rider: ${r.riderName}`]));
            if (ok(z)) { addMarker(z, '#d92d20', `${r.rideCode} destination`, popup([`Destination · ${r.rideCode}`, r.destinationAddress]));
              lines.push(new G.Polyline({ path: [a, z], map, strokeColor: '#98a2b3', strokeOpacity: 0, strokeWeight: 2, icons: [{ icon: { path: 'M 0,-1 0,1', strokeOpacity: 0.9, scale: 2 }, offset: '0', repeat: '10px' }] })); } });
          if (first && n) { map.fitBounds(bounds, 48); G.event.addListenerOnce(map, 'idle', () => { if (map.getZoom() > 14) map.setZoom(14); }); first = false; }
        }
        const list = $('#liveList');
        if (tab === 'rides') setHtml(list, data.rides.length ? html`${data.rides.map((r) => html`<button class="live-item" data-ride="${r.id}"><div class="row between"><b class="mono">${r.rideCode}</b>${Z.badge(r.status)}</div><div style="margin-top:4px">${F.trunc(r.pickupAddress, 38)} → ${F.trunc(r.destinationAddress, 38)}</div><div class="muted" style="font-size:12.5px">${r.riderName} · ${r.driverName || 'No driver yet'} · ${F.money(r.estimatedFare)}</div></button>`)}` : Z.empty('No active rides', 'Rides in progress will show here.', 'car'));
        else setHtml(list, data.drivers.length ? html`${data.drivers.map((d) => html`<button class="live-item" data-drv="${d.id}"><div class="row between"><div class="cell-user">${Z.avatar(d.fullName, null, 'sm', d.id)}<div><b>${d.fullName}</b><span>${F.title(d.vehicleType || '')} · ${d.plateNumber || '—'}</span></div></div><span class="muted">★ ${F.rating(d.rating)}</span></div><div class="faint" style="font-size:12px;margin-top:4px">Location ${F.ago(d.locationUpdatedAt)}</div></button>`)}` : Z.empty('No drivers online', 'Drivers appear when they go online with GPS.', 'radio'));
      }
      async function tick() { try { const r = await get('/admin/live-map', { fresh: true }); if (!ctx.alive()) return; data = r; draw(); const s = $('#liveState'); if (s) { s.className = 'badge badge-success'; s.textContent = 'Live · ' + F.time(new Date()); } } catch (e) { const s = $('#liveState'); if (s) { s.className = 'badge badge-danger'; s.textContent = 'Connection lost'; } } }
      await tick(); const iv = setInterval(() => { if (!paused && !document.hidden) tick(); }, 10000);
      ctx.onLeave(() => { clearInterval(iv); markers.forEach((m) => m.setMap(null)); lines.forEach((l) => l.setMap(null)); map = null; });
      ctx.el.addEventListener('click', (e) => {
        const t = e.target.closest('[data-lt]'); if (t) { tab = t.dataset.lt; $$('[data-lt]').forEach((x) => x.classList.toggle('active', x === t)); draw(); }
        const r = e.target.closest('[data-ride]'); if (r) Z.openRide(r.dataset.ride); const d = e.target.closest('[data-drv]'); if (d) location.hash = `#/drivers/${d.dataset.drv}`;
        if (e.target.closest('#livePause')) { paused = !paused; setHtml($('#livePause'), html`${ico(paused ? 'play' : 'pause')} ${paused ? 'Resume' : 'Pause'}`); }
      });
    }
  };
})();

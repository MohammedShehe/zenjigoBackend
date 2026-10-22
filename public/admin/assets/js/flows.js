(() => {
'use strict';

const API = window.ZenjiGOAdminAPI;
const D = window.ZENJIGO_DATA;
const $ = (s) => document.querySelector(s);
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function input(label, name, type = 'text', value = '', required = true, extra = '') {
  return `<div class="mb-3"><label class="form-label">${esc(label)}</label>
    <input class="form-control" name="${esc(name)}" type="${type}" value="${esc(value)}" ${required ? 'required' : ''} ${extra}></div>`;
}
function select(label, name, options, value = '') {
  return `<div class="mb-3"><label class="form-label">${esc(label)}</label>
    <select class="form-select" name="${esc(name)}" required>
      ${options.map((o) => `<option value="${esc(o)}" ${String(o) === String(value) ? 'selected' : ''}>${esc(o)}</option>`).join('')}
    </select></div>`;
}
function textarea(label, name, value = '', rows = 3) {
  return `<div class="mb-3"><label class="form-label">${esc(label)}</label>
    <textarea class="form-control" name="${esc(name)}" rows="${rows}" required>${esc(value)}</textarea></div>`;
}
function userOptions() {
  const users = [...(D.riders || []).map(u => ({...u, role:'Rider'})), ...(D.drivers || []).map(u => ({...u, role:'Driver'}))];
  return users.map(u => `<option value="${esc(u.dbId || u.id)}">${esc(u.name || 'Unnamed user')} · ${esc(u.role)} · ${esc(u.phone || 'No phone')} (#${esc(u.dbId || u.id)})</option>`).join('');
}

function openModal(eyebrow, title, bodyHtml, footerHtml) {
  $('#modalEyebrow').textContent = eyebrow;
  $('#modalTitle').textContent = title;
  $('#modalBody').innerHTML = bodyHtml;
  $('#modalFooter').innerHTML = footerHtml || '';
  const modal = bootstrap.Modal.getOrCreateInstance($('#genericModal'));
  modal.show();
  return modal;
}
function closeModal() {
  bootstrap.Modal.getInstance($('#genericModal'))?.hide();
}

async function afterMutation(page) {
  await window.syncAll();
  window.renderPage(page || window.currentPage || 'dashboard');
}

/* ---------- Action handlers ---------- */
document.addEventListener('click', async (e) => {
  const btn = e.target.closest('[data-action]');
  if (!btn) return;
  const action = btn.dataset.action;
  const id = btn.dataset.id;
  const status = btn.dataset.status;

  try {
    switch (action) {
      /* Drivers */
      case 'add-driver': {
        openModal('DRIVER', 'Add driver',
          `<form id="flowForm" class="professional-form"><div class="form-intro"><span class="form-icon"><i class="bi bi-person-vcard"></i></span><div><h6>Driver profile</h6><p>Enter the driver's contact and vehicle information.</p></div></div><div class="row g-3"><div class="col-12 col-md-6">${input('Full name', 'fullName')}</div><div class="col-12 col-md-6">${input('Phone number', 'phone', 'tel', '', true, 'placeholder="+255…"')}</div><div class="col-12 col-md-6">${input('Email address', 'email', 'email', '', false)}</div><div class="col-12 col-md-6">${select('Vehicle type', 'vehicleType', ['taxi', 'boda', 'bajaji'])}</div><div class="col-12 col-md-6">${input('Plate number', 'plateNumber')}</div><div class="col-12 col-md-6">${input('Make / model', 'make', 'text', '', false)}</div><div class="col-12 col-md-6">${select('Application status', 'status', ['under_review', 'active'])}</div></div></form>`,
          `<button class="btn btn-primary" data-flow-submit="create-driver"><i class="bi bi-check2-circle me-1"></i>Create driver</button>`);
        break;
      }
      case 'edit-driver': {
        const d = D.drivers.find((x) => String(x.id) === String(id));
        if (!d) return toast('Driver not found', 'danger');
        openModal('DRIVER', 'Edit driver',
          `<form id="flowForm">
            ${input('Full name', 'fullName', 'text', d.name)}
            ${input('Phone', 'phone', 'tel', d.phone)}
            ${input('Email', 'email', 'email', d.email === '—' ? '' : d.email, false)}
            ${select('Vehicle type', 'vehicleType', ['taxi', 'boda', 'bajaji'], (d.vehicle || d.type || 'taxi').toLowerCase())}
            ${input('Plate number', 'plateNumber', 'text', d.plate === '—' ? '' : d.plate)}
            ${input('Make', 'make', 'text', d.make || '', false)}
            ${select('Application status', 'applicationStatus', ['under_review', 'active', 'rejected'], d.status)}
          </form>`,
          `<button class="btn btn-primary" data-flow-submit="update-driver" data-id="${id}">Save changes</button>`);
        break;
      }
      case 'driver-status': {
        if (!confirm(`Set driver #${id} status to "${status}"?`)) return;
        await API.patch(`/admin/drivers/${id}/status`, { status });
        toast('Driver status updated');
        await afterMutation('drivers');
        break;
      }
      case 'delete-driver': {
        if (!confirm('Deactivate this driver? They will be suspended.')) return;
        await API.del(`/admin/drivers/${id}`);
        toast('Driver deactivated');
        await afterMutation('drivers');
        break;
      }

      /* Riders */
      case 'add-rider': {
        openModal('RIDER', 'Add rider',
          `<form id="flowForm">
            ${input('Full name', 'fullName')}
            ${input('Phone', 'phone', 'tel')}
            ${input('Email', 'email', 'email', '', false)}
            ${input('Island', 'island', 'text', 'Unguja', false)}
            ${input('Region / area', 'region', 'text', '', false)}
            ${select('Status', 'status', ['active', 'pending', 'suspended'])}
          </form>`,
          `<button class="btn btn-primary" data-flow-submit="create-rider">Create rider</button>`);
        break;
      }
      case 'edit-rider': {
        const r = D.riders.find((x) => String(x.id) === String(id));
        if (!r) return toast('Rider not found', 'danger');
        openModal('RIDER', 'Edit rider',
          `<form id="flowForm">
            ${input('Full name', 'fullName', 'text', r.name)}
            ${input('Phone', 'phone', 'tel', r.phone)}
            ${input('Email', 'email', 'email', r.email === '—' ? '' : r.email, false)}
            ${input('Island', 'island', 'text', r.island === '—' ? '' : r.island, false)}
            ${input('Region / area', 'region', 'text', r.area === '—' ? '' : r.area, false)}
            ${select('Status', 'status', ['active', 'pending', 'suspended', 'rejected'], r.status)}
          </form>`,
          `<button class="btn btn-primary" data-flow-submit="update-rider" data-id="${id}">Save changes</button>`);
        break;
      }
      case 'rider-status': {
        await API.patch(`/admin/riders/${id}/status`, { status });
        toast('Rider status updated');
        await afterMutation('riders');
        break;
      }
      case 'delete-rider': {
        if (!confirm('Deactivate this rider?')) return;
        await API.del(`/admin/riders/${id}`);
        toast('Rider deactivated');
        await afterMutation('riders');
        break;
      }

      /* Admins */
      case 'add-admin': {
        openModal('ADMIN', 'Add sub-admin',
          `<form id="flowForm">
            ${input('Full name', 'fullName')}
            ${input('Email', 'email', 'email')}
            ${input('Phone', 'phone', 'tel', '', false)}
            ${input('Password', 'password', 'password', '', true, 'minlength="8"')}
            ${select('Status', 'status', ['active', 'suspended'])}
          </form>`,
          `<button class="btn btn-primary" data-flow-submit="create-admin">Create admin</button>`);
        break;
      }
      case 'edit-admin': {
        const a = D.admins.find((x) => String(x.id) === String(id));
        if (!a) return toast('Admin not found', 'danger');
        openModal('ADMIN', 'Edit admin',
          `<form id="flowForm">
            ${input('Full name', 'fullName', 'text', a.name)}
            ${input('Email', 'email', 'email', a.email)}
            ${input('Phone', 'phone', 'tel', a.phone === '—' ? '' : a.phone, false)}
            ${input('New password (optional)', 'password', 'password', '', false, 'minlength="8"')}
            ${select('Status', 'status', ['active', 'suspended'], a.status)}
          </form>`,
          `<button class="btn btn-primary" data-flow-submit="update-admin" data-id="${id}">Save changes</button>`);
        break;
      }
      case 'delete-admin': {
        if (!confirm('Deactivate this admin account?')) return;
        await API.del(`/admin/admins/${id}`);
        toast('Admin deactivated');
        await afterMutation('admins');
        break;
      }

      /* Promos */
      case 'add-promo': {
        openModal('PROMOTION', 'Create promotion',
          `<form id="flowForm">
            ${input('Code', 'code')}
            ${input('Title / description', 'description')}
            ${select('Discount type', 'discountType', ['percent', 'fixed'])}
            ${input('Discount value', 'discountValue', 'number', '10')}
            ${input('Usage limit (blank = unlimited)', 'usageLimit', 'number', '', false)}
            ${select('Applies to', 'appliesTo', ['all', 'ride', 'parcel', 'tour'])}
            ${input('Valid from', 'validFrom', 'date', new Date().toISOString().slice(0, 10))}
            ${input('Valid until', 'validUntil', 'date', '', false)}
          </form>`,
          `<button class="btn btn-primary" data-flow-submit="create-promo">Create</button>`);
        break;
      }
      case 'edit-promo': {
        const p = D.promos.find((x) => String(x.id) === String(id));
        if (!p) return toast('Promo not found', 'danger');
        openModal('PROMOTION', 'Edit promotion',
          `<form id="flowForm">
            ${input('Code', 'code', 'text', p.code)}
            ${input('Description', 'description', 'text', p.description)}
            ${select('Discount type', 'discountType', ['percent', 'fixed'], p.discountType)}
            ${input('Discount value', 'discountValue', 'number', p.discountValue)}
            ${select('Status', 'isActive', ['1', '0'], p.status === 'Active' ? '1' : '0')}
          </form>`,
          `<button class="btn btn-primary" data-flow-submit="update-promo" data-id="${id}">Save</button>`);
        break;
      }
      case 'delete-promo': {
        if (!confirm('Deactivate this promotion?')) return;
        await API.del(`/admin/promos/${id}`);
        toast('Promotion deactivated');
        await afterMutation('promotions');
        break;
      }

      /* Tours */
      case 'add-tour': {
        openModal('TOURS', 'Create tour package',
          `<form id="flowForm">
            ${input('Package name', 'name')}
            ${textarea('Description', 'description')}
            ${input('Base price (TZS)', 'price', 'number', '75000')}
            ${input('Duration (hours)', 'duration', 'number', '4')}
            ${input('Max tourists', 'max', 'number', '6')}
          </form>`,
          `<button class="btn btn-primary" data-flow-submit="create-tour">Create</button>`);
        break;
      }
      case 'edit-tour': {
        const t = D.tours.find((x) => String(x.id) === String(id));
        if (!t) return toast('Tour not found', 'danger');
        openModal('TOURS', 'Edit tour package',
          `<form id="flowForm">
            ${input('Package name', 'name', 'text', t.name)}
            ${textarea('Description', 'description', t.description)}
            ${input('Base price (TZS)', 'price', 'number', t.price)}
            ${input('Duration (hours)', 'duration', 'number', t.duration)}
            ${input('Max tourists', 'max', 'number', t.max)}
            ${select('Status', 'status', ['Active', 'Paused'], t.status)}
          </form>`,
          `<button class="btn btn-primary" data-flow-submit="update-tour" data-id="${id}">Save</button>`);
        break;
      }
      case 'delete-tour': {
        if (!confirm('Deactivate this tour package?')) return;
        await API.del(`/admin/tour-packages/${id}`);
        toast('Tour package deactivated');
        await afterMutation('tours');
        break;
      }

      /* Finance */
      case 'complete-payment': {
        if (!confirm('Mark this payment as successful and credit the wallet?')) return;
        await API.post(`/admin/payments/${id}/complete`, {});
        toast('Payment completed');
        await afterMutation('finance');
        break;
      }
      case 'settle-driver': {
        if (!confirm('Record that this driver has paid the commission they owe (cash / bank, outside the app)?\n\nThis clears their outstanding commission and unblocks them. Mobile-money payments are confirmed automatically — do not use this for those.')) return;
        const reference = prompt('Payment reference / receipt number (optional):') || '';
        await API.post(`/admin/drivers/${id}/settle`, { reference });
        toast('Commission payment recorded');
        await afterMutation('finance');
        break;
      }
      case 'payout-status': {
        await API.patch(`/admin/payouts/${id}/status`, { status });
        toast('Payout status updated');
        await afterMutation('withdrawals');
        break;
      }

      /* Notifications */
      case 'send-notification': {
        openModal('NOTIFICATION', 'Send notification',
          `<form id="flowForm" class="professional-form notification-form"><div class="form-intro"><span class="form-icon"><i class="bi bi-bell"></i></span><div><h6>Compose a notification</h6><p>Choose a registered driver or rider, then write a clear message.</p></div></div><div class="mb-3"><label class="form-label" for="notificationUser">Recipient</label><select id="notificationUser" class="form-select" name="userId" required><option value="">Select a user…</option>${userOptions()}</select><div class="form-text">${(D.riders || []).length + (D.drivers || []).length} available user records loaded.</div></div>${input('Notification title', 'title')}<div class="mb-3"><label class="form-label">Message</label><textarea class="form-control" name="body" rows="4" maxlength="1000" placeholder="Write a helpful, concise message…" required></textarea><div class="form-text">Keep the message clear and actionable.</div></div>${select('Category', 'type', ['admin', 'system', 'ride', 'payment', 'safety'], 'admin')}</form>`,
          `<button class="btn btn-primary" data-flow-submit="send-notification"><i class="bi bi-send me-1"></i>Send notification</button>`);
        break;
      }
    }
  } catch (err) {
    toast(err.message, 'danger');
  }
});

/* ---------- Form submits ---------- */
document.addEventListener('click', async (e) => {
  const btn = e.target.closest('[data-flow-submit]');
  if (!btn) return;
  e.preventDefault();
  e.stopPropagation();
  const form = $('#flowForm');
  if (!form || !form.reportValidity()) return;
  const data = Object.fromEntries(new FormData(form).entries());
  const action = btn.dataset.flowSubmit;
  const id = btn.dataset.id;
  btn.disabled = true;
  btn.classList.add('is-loading');
  const originalButtonHtml = btn.innerHTML;
  btn.innerHTML = '<span class="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>Processing…';

  try {
    switch (action) {
      case 'create-driver':
        await API.post('/admin/drivers', {
          fullName: data.fullName, phone: data.phone, email: data.email || null,
          vehicleType: data.vehicleType, plateNumber: data.plateNumber, make: data.make || null,
          status: data.status, applicationStatus: data.status
        });
        toast('Driver created');
        closeModal();
        await afterMutation('drivers');
        break;

      case 'update-driver':
        await API.patch(`/admin/drivers/${id}`, {
          fullName: data.fullName, phone: data.phone, email: data.email || null,
          vehicleType: data.vehicleType, plateNumber: data.plateNumber, make: data.make || null,
          applicationStatus: data.applicationStatus
        });
        toast('Driver updated');
        closeModal();
        await afterMutation('drivers');
        break;

      case 'create-rider':
        await API.post('/admin/riders', {
          fullName: data.fullName, phone: data.phone, email: data.email || null,
          island: data.island || null, region: data.region || null, status: data.status
        });
        toast('Rider created');
        closeModal();
        await afterMutation('riders');
        break;

      case 'update-rider':
        await API.patch(`/admin/riders/${id}`, {
          fullName: data.fullName, phone: data.phone, email: data.email || null,
          island: data.island || null, region: data.region || null, status: data.status
        });
        toast('Rider updated');
        closeModal();
        await afterMutation('riders');
        break;

      case 'create-admin':
        await API.post('/admin/admins', {
          fullName: data.fullName, email: data.email, phone: data.phone || null,
          password: data.password, status: data.status
        });
        toast('Admin created');
        closeModal();
        await afterMutation('admins');
        break;

      case 'update-admin': {
        const body = { fullName: data.fullName, email: data.email, phone: data.phone || null, status: data.status };
        if (data.password) body.password = data.password;
        await API.patch(`/admin/admins/${id}`, body);
        toast('Admin updated');
        closeModal();
        await afterMutation('admins');
        break;
      }

      case 'create-promo':
        await API.post('/admin/promos', {
          code: data.code, title: data.description || data.code, description: data.description,
          discountType: data.discountType, discountValue: Number(data.discountValue),
          usageLimit: data.usageLimit ? Number(data.usageLimit) : null,
          appliesTo: data.appliesTo,
          validFrom: data.validFrom ? data.validFrom + ' 00:00:00' : undefined,
          validUntil: data.validUntil ? data.validUntil + ' 23:59:59' : undefined
        });
        toast('Promotion created');
        closeModal();
        await afterMutation('promotions');
        break;

      case 'update-promo':
        await API.patch(`/admin/promos/${id}`, {
          code: data.code, description: data.description,
          discountType: data.discountType, discountValue: Number(data.discountValue),
          isActive: data.isActive === '1'
        });
        toast('Promotion updated');
        closeModal();
        await afterMutation('promotions');
        break;

      case 'create-tour':
        await API.post('/admin/tour-packages', {
          name: data.name, description: data.description,
          price: Number(data.price), duration: Number(data.duration), max: Number(data.max)
        });
        toast('Tour package created');
        closeModal();
        await afterMutation('tours');
        break;

      case 'update-tour':
        await API.patch(`/admin/tour-packages/${id}`, {
          name: data.name, description: data.description,
          price: Number(data.price), duration: Number(data.duration), max: Number(data.max),
          status: data.status
        });
        toast('Tour package updated');
        closeModal();
        await afterMutation('tours');
        break;

      case 'send-notification':
        await API.post('/admin/notifications', {
          userId: Number(data.userId), title: data.title.trim(), body: data.body.trim(), type: data.type || 'admin'
        });
        toast('Notification sent');
        closeModal();
        await afterMutation('notifications');
        break;
    }
  } catch (err) {
    toast(err.message, 'danger');
  } finally {
    btn.disabled = false;
    btn.classList.remove('is-loading');
    btn.innerHTML = originalButtonHtml;
  }
});
})();

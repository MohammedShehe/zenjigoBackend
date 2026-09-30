(() => {
'use strict';
const D = window.ZENJIGO_DATA;
const $ = (s, r=document) => r.querySelector(s);
const $$ = (s, r=document) => [...r.querySelectorAll(s)];
const money = n => 'TZS ' + Number(n||0).toLocaleString();
const esc = s => String(s ?? '').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
const state = JSON.parse(localStorage.getItem('zenjigo-admin-state') || '{}');
const saveState = () => localStorage.setItem('zenjigo-admin-state', JSON.stringify(state));

function toast(message, type='success') {
  const host = $('#toastHost'); if (!host) return;
  const el = document.createElement('div');
  el.className = 'toast border-0 shadow-sm'; el.setAttribute('role','alert');
  el.innerHTML = `<div class="toast-body d-flex align-items-center gap-2"><i class="bi ${type==='danger'?'bi-exclamation-circle-fill text-danger':'bi-check-circle-fill text-success'}"></i><span class="flex-grow-1">${esc(message)}</span><button class="btn-close" data-bs-dismiss="toast"></button></div>`;
  host.appendChild(el); new bootstrap.Toast(el,{delay:2600}).show(); el.addEventListener('hidden.bs.toast',()=>el.remove());
}
function modal(title, body, footer='', eyebrow='WORKFLOW') {
  $('#modalEyebrow').textContent = eyebrow;
  $('#modalTitle').textContent = title;
  $('#modalBody').innerHTML = body;
  $('#modalFooter').innerHTML = footer || `<button class="btn btn-light btn-sm" data-bs-dismiss="modal">Close</button>`;
  bootstrap.Modal.getOrCreateInstance($('#genericModal')).show();
}
function closeModal(){ bootstrap.Modal.getInstance($('#genericModal'))?.hide(); }
function input(label,name,type='text',value='',required=true,extra='') { return `<div class="mb-3"><label class="form-label">${label}</label><input class="form-control" name="${name}" type="${type}" value="${esc(value)}" ${required?'required':''} ${extra}></div>`; }
function select(label,name,opts,value='') { return `<div class="mb-3"><label class="form-label">${label}</label><select class="form-select" name="${name}">${opts.map(o=>`<option ${o===value?'selected':''}>${esc(o)}</option>`).join('')}</select></div>`; }
function submitFooter(label='Save changes', cls='btn-primary') { return `<button class="btn btn-light btn-sm" data-bs-dismiss="modal">Cancel</button><button class="btn ${cls} btn-sm" data-flow-submit>${label}</button>`; }
function formData(){ const f=$('#modalBody form'); return f ? Object.fromEntries(new FormData(f).entries()) : {}; }
function requireForm() { const f=$('#modalBody form'); if (!f) return true; if (!f.reportValidity()) return false; return true; }
function renderCurrent(){ const active=$('#sideNav .nav-link.active'); if(active) active.click(); }
function download(name, rows) {
  if(!rows.length){ toast('There is no data to export.','danger'); return; }
  const keys=Object.keys(rows[0]); const q=v=>'"'+String(v??'').replace(/"/g,'""')+'"';
  const csv=[keys.map(q).join(','),...rows.map(r=>keys.map(k=>q(r[k])).join(','))].join('\n');
  const a=document.createElement('a'); a.href=URL.createObjectURL(new Blob([csv],{type:'text/csv'})); a.download=name; document.body.appendChild(a); a.click(); URL.revokeObjectURL(a.href); a.remove(); toast(`${name} downloaded.`);
}
function currentRecordFromModal(collection){ const title=$('#modalTitle').textContent; return collection.find(x=>title.includes(x.id)||title===x.name) || collection[0]; }

let submitHandler=null;
function setFlow(title,body,footer,label,handler,eyebrow='WORKFLOW') { submitHandler=handler; modal(title,`<form>${body}</form>`,footer||submitFooter(label),eyebrow); }
document.addEventListener('click', e=>{ const b=e.target.closest('[data-flow-submit]'); if(!b) return; e.preventDefault(); if(!requireForm()) return; submitHandler?.(formData(),b); }, true);

function promotionFlow(existing=null){
  setFlow(existing?`Edit ${existing.code}`:'Create promotion',
    input('Promo code','code','text',existing?.code||'',true,'maxlength="24"')+
    input('Description','description','text',existing?.description||'')+
    select('Service','service',['Rides','Parcel','Tours','All services'],existing?.service||'Rides')+
    select('Discount type','discountType',['Percentage','Fixed amount'],existing?.discount?.includes('%')?'Percentage':'Fixed amount')+
    input('Discount value','discountValue','number',existing?parseInt(existing.discount):20,true,'min="1"')+
    input('Usage limit','limit','number',existing?parseInt((existing.usage||'0 / 1000').split('/')[1]):1000,true,'min="1"')+
    `<div class="row g-3"><div class="col-md-6">${input('Starts','start','date','2026-09-21')}</div><div class="col-md-6">${input('Ends','end','date','2026-10-21')}</div></div>`,
    '', existing?'Save promotion':'Create promotion', data=>{
      const discount=data.discountType==='Percentage'?`${data.discountValue}%`:`TZS ${Number(data.discountValue).toLocaleString()}`;
      (async()=>{
        try{
          if(existing){ toast('Promotion editing is available after the backend update endpoint is configured.','danger'); return; }
          await window.ZENJIGO_API('/admin/promos',{method:'POST',body:JSON.stringify({code:data.code,title:data.code,description:data.description,discountType:data.discountType==='Percentage'?'percent':'fixed',discountValue:Number(data.discountValue),usageLimit:Number(data.limit),perUserLimit:1,validFrom:data.start+' 00:00:00',validUntil:data.end+' 23:59:59',appliesTo:data.service==='Rides'?'ride':data.service==='Parcel'?'parcel':data.service==='Tours'?'tour':'all'})});
          closeModal(); toast('Promotion created.'); window.location.reload();
        }catch(e){toast(e.message,'danger');}
      })();
    }, 'PROMOTION');
}
function notificationFlow(){
  setFlow('Create notification',
    select('Audience','audience',['All users','All riders','All drivers','Online drivers','Selected users'])+
    input('Title','title')+
    `<div class="mb-3"><label class="form-label">Message</label><textarea class="form-control" name="message" rows="5" required></textarea></div>`+
    select('Action','action',['Open app','Open promotions','Open wallet','Open support chat'])+
    select('Delivery','delivery',['Send now','Schedule date/time'])+
    input('Schedule time','schedule','datetime-local','',false),
    '', 'Queue notification', data=>{ state.notifications=state.notifications||[]; state.notifications.unshift({...data,created:new Date().toISOString()}); saveState(); closeModal(); toast('Notification queued successfully.'); }, 'NOTIFICATION');
}
function adminFlow(name=null){
  const existing=name && name!=='You';
  setFlow(existing?`Manage ${name}`:'Invite admin',
    input('Full name','name','text',existing?name:'')+input('Email','email','email',existing?(name==='Neema Said'?'ops@zenjigo.com':'finance@zenjigo.com'):'')+
    select('Role','role',['Operations Admin','Finance Admin','Support Admin','Safety Admin','Read-only Analyst'], existing?(name==='Omar Juma'?'Finance Admin':'Operations Admin'):'Operations Admin')+
    `<label class="form-label">Permissions</label><div class="row g-2 mb-3">${['Rides','Drivers','Riders','Finance','Withdrawals','Chat','Safety','Promotions','Pricing','Audit logs'].map(p=>`<div class="col-6"><label class="form-check"><input class="form-check-input" type="checkbox" name="perm_${p}" checked><span class="form-check-label">${p}</span></label></div>`).join('')}</div>`+
    `<label class="form-check mb-2"><input class="form-check-input" type="checkbox" name="twofa" checked><span class="form-check-label">Require 2FA</span></label>`,
    '', existing?'Save access':'Send invitation', data=>{ state.admins=state.admins||[]; state.admins.push({...data,updated:new Date().toISOString()}); saveState(); closeModal(); toast(existing?'Admin access updated.':'Admin invitation sent.'); }, 'ACCESS CONTROL');
}
function driverCreateFlow(){
  setFlow('Add driver', input('Full name','name')+input('Phone','phone','tel')+input('Email','email','email')+select('Vehicle type','type',['Taxi','Boda','Bajaji'])+input('Vehicle','vehicle')+input('Plate number','plate')+select('Initial status','status',['Under Review','Active']), '', 'Create driver', data=>{
    (async()=>{try{toast('Driver creation is handled through the driver registration flow. Use the mobile registration to create a verified application.','danger');}catch(e){toast(e.message,'danger');}})();
  }, 'DRIVER');
}
function riderCreateFlow(){
  setFlow('Add rider', input('Full name','name')+input('Phone','phone','tel')+input('Email','email','email')+select('Island','island',['Unguja','Pemba'])+input('Area','area')+input('Opening wallet balance','wallet','number','0',true,'min="0"'), '', 'Create rider', data=>{
    (async()=>{try{await window.ZENJIGO_API('/admin/riders',{method:'POST',body:JSON.stringify({fullName:data.name,phone:data.phone,email:data.email,island:data.island,district:data.area,status:'active'})});closeModal();toast('Rider created.');location.reload();}catch(e){toast(e.message,'danger');}})();
  }, 'RIDER');
}
function parcelFlow(){
  setFlow('Create parcel booking', input('Sender / rider','rider')+input('Recipient phone','recipient','tel')+input('Pickup','pickup')+input('Drop-off','drop')+input('Weight (kg)','weight','number','1',true,'min="0.1" step="0.1"')+select('Assign driver','driver',['Unassigned',...D.drivers.map(d=>d.name)]), '', 'Create booking', data=>{
    D.parcels.unshift({id:`PRC-${8822+D.parcels.length}`,rider:data.rider,driver:data.driver==='Unassigned'?'—':data.driver,pickup:data.pickup,drop:data.drop,recipient:data.recipient,weight:`${data.weight} kg`,time:'Just now',status:data.driver==='Unassigned'?'Pending':'Assigned'}); closeModal(); toast('Parcel booking created.'); renderCurrent();
  }, 'PARCEL');
}
function tourFlow(existing=null){
  setFlow(existing?'Edit tour package':'Create tour package', input('Package name','package','text',existing?.package||'')+input('Duration','duration','text','4 hours')+input('Base price (TZS)','price','number',existing?.price||75000,true,'min="0"')+input('Maximum tourists','max','number','6',true,'min="1"')+`<div class="mb-3"><label class="form-label">Description</label><textarea class="form-control" name="description" rows="4" required>${esc(existing?.description||'')}</textarea></div>`+select('Status','status',['Active','Draft','Paused'],'Active'), '', existing?'Save package':'Create package', data=>{ state.tourPackages=state.tourPackages||[]; state.tourPackages.push({...data,updated:new Date().toISOString()}); saveState(); closeModal(); toast(existing?'Tour package updated.':'Tour package created.'); }, 'TOURS');
}
function incidentFlow(){
  setFlow('Create safety incident', select('Source','source',['Rider','Driver','Admin','System'])+input('Reporter','reporter')+input('Reported user','against')+input('Ride ID','ride','text','ZG-')+select('Priority','priority',['Low','Medium','High','Critical'])+input('Reason','reason')+`<div class="mb-3"><label class="form-label">Initial notes</label><textarea class="form-control" name="notes" rows="4" required></textarea></div>`, '', 'Create incident', data=>{ D.reports.unshift({id:`RPT-${882+D.reports.length}`,source:data.source,reporter:data.reporter,against:data.against,reason:data.reason,ride:data.ride,created:'Just now',priority:data.priority,status:'Open'}); closeModal(); toast('Safety incident created.'); renderCurrent(); }, 'TRUST & SAFETY');
}
function commissionFlow(){ setFlow('Commission rules', input('Driver share (%)','driverShare','number',state.driverShare||80,true,'min="0" max="100"')+input('ZenjiGO commission (%)','commission','number',state.commission||20,true,'min="0" max="100"')+input('Withdrawal fee (TZS)','fee','number',state.withdrawalFee||1000,true,'min="0"'), '', 'Save rules', data=>{ if(Number(data.driverShare)+Number(data.commission)!==100){toast('Driver share and commission must total 100%.','danger');return;} (async()=>{try{await window.ZENJIGO_API('/admin/settings/driver_commission',{method:'PATCH',body:JSON.stringify({value:{driverShare:Number(data.driverShare),commission:Number(data.commission),withdrawalFee:Number(data.fee)}})});Object.assign(state,{driverShare:data.driverShare,commission:data.commission,withdrawalFee:data.fee});saveState();closeModal();toast('Commission rules saved.');}catch(e){toast(e.message,'danger');}})(); }, 'FINANCE'); }
function referralFlow(){ setFlow('Referral rules', input('Referrer reward (TZS)','reward','number',state.referralReward||5000,true,'min="0"')+select('Qualification','qualification',['Complete first ride','Complete 3 rides','Top up wallet','Register only'])+input('Monthly reward cap (TZS)','cap','number',state.referralCap||50000,true,'min="0"')+`<label class="form-check"><input class="form-check-input" type="checkbox" name="enabled" checked><span class="form-check-label">Referral program enabled</span></label>`, '', 'Save referral rules', data=>{state.referral={...data};saveState();closeModal();toast('Referral rules saved.');}, 'REFERRALS'); }
function incentiveFlow(){ setFlow('Driver incentive', input('Incentive name','name')+select('Metric','metric',['Completed rides','Driver rating','Online hours','Airport rides'])+input('Target','target','number','12',true,'min="1"')+input('Reward (TZS)','reward','number','25000',true,'min="1"')+input('Starts','start','datetime-local')+input('Ends','end','datetime-local'), '', 'Create incentive', data=>{state.incentives=state.incentives||[];state.incentives.unshift(data);saveState();closeModal();toast('Driver incentive created.');}, 'INCENTIVES'); }
function zoneFlow(){ setFlow('Manage zones & geofences', input('Zone name','name','text','Zanzibar Urban/West')+select('Island','island',['Unguja','Pemba'])+input('Radius (km)','radius','number','25',true,'min="1"')+input('Airport surcharge (TZS)','surcharge','number','3000',true,'min="0"')+`<label class="form-check"><input class="form-check-input" type="checkbox" name="active" checked><span class="form-check-label">Zone active</span></label>`, '', 'Save zone', data=>{state.zone=data;saveState();closeModal();toast('Service zone saved.');}, 'SERVICE ZONES'); }
function pricingFlow(type){ setFlow(`Edit ${type} pricing`, input('Base fare (TZS)','base','number',type==='Boda'?2500:type==='Bajaji'?3500:4000,true,'min="0"')+input('Per km (TZS)','perKm','number',type==='Boda'?800:type==='Bajaji'?1100:1500,true,'min="0"')+input('Minimum fare (TZS)','min','number',type==='Boda'?3500:type==='Bajaji'?5000:7000,true,'min="0"')+input('Driver commission (%)','commission','number','20',true,'min="0" max="100"')+select('Availability','availability',['Active','Paused']), '', 'Save pricing', data=>{state.pricing=state.pricing||{};state.pricing[type]=data;saveState();closeModal();toast(`${type} pricing saved.`);}, 'PRICING'); }
function riderSubflow(kind){ const r=currentRecordFromModal(D.riders); if(kind==='Ride history'){ modal(`${r.name} · Ride history`, `<div class="table-wrap"><table class="table"><thead><tr><th>Ride</th><th>Route</th><th>Fare</th><th>Status</th></tr></thead><tbody>${D.rides.filter(x=>x.rider===r.name).map(x=>`<tr><td>${x.id}</td><td>${esc(x.from)} → ${esc(x.to)}</td><td>${money(x.fare)}</td><td>${esc(x.status)}</td></tr>`).join('')||'<tr><td colspan="4" class="text-center muted">No rides found</td></tr>'}</tbody></table></div>`,'','RIDER ACTIVITY'); }
 else if(kind==='Saved locations') modal(`${r.name} · Saved locations`,`<div class="list-group"><div class="list-group-item"><b>Home</b><br><small>${esc(r.area)}, ${esc(r.island)}</small></div><div class="list-group-item"><b>Work</b><br><small>Stone Town, Zanzibar</small></div></div>`,'','RIDER');
 else if(kind==='Payment methods') modal(`${r.name} · Payment methods`,`<div class="doc-grid"><div class="doc-card"><i class="bi bi-wallet2"></i><div><b>ZenjiGO Wallet</b><span>${money(r.wallet)} available</span></div></div><div class="doc-card"><i class="bi bi-phone"></i><div><b>M-Pesa</b><span>${esc(r.phone)}</span></div></div><div class="doc-card"><i class="bi bi-credit-card"></i><div><b>Visa •••• 1842</b><span>Tokenized card</span></div></div></div>`,'','PAYMENTS');
 else modal(`${r.name} · Wallet ledger`,`<div class="table-wrap"><table class="table"><thead><tr><th>Transaction</th><th>Type</th><th>Amount</th><th>Status</th></tr></thead><tbody>${D.transactions.filter(x=>x.user.includes(r.name.split(' ')[0])).map(x=>`<tr><td>${x.id}</td><td>${x.type}</td><td>${money(x.amount)}</td><td>${x.status}</td></tr>`).join('')||'<tr><td colspan="4" class="text-center muted">No wallet activity</td></tr>'}</tbody></table></div>`,'','WALLET');
}
function messageUser(name,role='User'){ closeModal(); const nav=$('[data-page="chat"]'); nav?.click(); setTimeout(()=>{ toast(`Support conversation with ${name} is ready.`); const composer=$('.chat-composer input'); if(composer){composer.value=`Hello ${name}, `;composer.focus();}},50); }

const handlers = [
  [/Operations report exported|Ride data exported|Finance ledger exported|Withdrawal report exported|Audit logs exported/i, (m)=>{ if(/Ride data/.test(m))download('zenjigo-rides.csv',D.rides); else if(/Finance/.test(m))download('zenjigo-finance.csv',D.transactions); else if(/Withdrawal/.test(m))download('zenjigo-withdrawals.csv',D.withdrawals); else if(/Audit/.test(m)) download('zenjigo-audit.csv',[{time:'10:54 PM',actor:'Super Admin',action:'Viewed ride tracking',entity:'ZG-10482',result:'Success'},{time:'10:51 PM',actor:'Super Admin',action:'Approved withdrawal',entity:'WDR-7084',result:'Success'}]); else download('zenjigo-operations.csv',[...D.rides.map(r=>({type:'Ride',id:r.id,status:r.status,amount:r.fare})),...D.parcels.map(p=>({type:'Parcel',id:p.id,status:p.status,amount:''}))]);}],
  [/Promotion builder opened/i,()=>promotionFlow()], [/Promotion editor opened/i,(m,b)=>{const tr=b.closest('tr');promotionFlow(D.promos.find(p=>tr?.textContent.includes(p.code))||D.promos[0]);}],
  [/Notification composer opened/i,()=>notificationFlow()], [/Notification queued successfully/i,()=>notificationFlow()],
  [/Admin invitation composer opened/i,()=>adminFlow()], [/Admin access editor opened/i,(m,b)=>adminFlow(b.closest('tr')?.querySelector('.table-user b')?.textContent||'Admin')],
  [/Driver creation form/i,()=>driverCreateFlow()], [/Rider creation form/i,()=>riderCreateFlow()], [/Parcel booking created/i,()=>parcelFlow()], [/New tour package form/i,()=>tourFlow()], [/Package editor opened/i,()=>tourFlow({package:'Half-Day Stone Town',price:75000})],
  [/Incident form opened/i,()=>incidentFlow()], [/Commission settings saved/i,()=>commissionFlow()], [/Referral settings updated/i,()=>referralFlow()], [/Driver incentive builder opened/i,()=>incentiveFlow()], [/Service zone editor opened/i,()=>zoneFlow()],
  [/pricing editor opened/i,(m)=>pricingFlow(m.split(' pricing')[0])],
  [/Platform settings saved/i,()=>{ const values={}; $$('#content input,#content select').forEach((el,i)=>values[el.name||el.id||`field${i}`]=el.type==='checkbox'?el.checked:el.value); state.settings=values;saveState();toast('Platform settings saved locally.');}],
  [/Service configuration saved/i,()=>{state.services=$$('#content input[type=checkbox]').map(x=>x.checked);saveState();toast('Service configuration saved.');}],
  [/Ride history opened/i,()=>riderSubflow('Ride history')], [/Saved locations opened/i,()=>riderSubflow('Saved locations')], [/Payment methods opened/i,()=>riderSubflow('Payment methods')], [/Wallet ledger opened/i,()=>riderSubflow('Wallet ledger')],
  [/Support conversation opened/i,()=>messageUser(currentRecordFromModal(D.riders).name,'Rider')], [/Support chat opened for (.+)/i,(m)=>messageUser(m.match(/for (.+)\./)?.[1]||'Driver','Driver')],
  [/Driver profile opened/i,()=>{const d=D.drivers[0]; window.ZAdmin? document.querySelector('[data-page="drivers"]')?.click():null; setTimeout(()=>document.querySelector(`[data-kind="driver"][data-id="${d.id}"]`)?.click(),50)}],
  [/Call integration point/i,()=>{ const name=$('.chat-head .table-user b')?.textContent||'user'; modal(`Call ${name}`,`<div class="text-center py-4"><i class="bi bi-telephone-outbound fs-1 text-primary"></i><h5 class="mt-3">Start support call?</h5><p class="muted">This frontend flow records the call intent and opens the device dialer when a real phone endpoint is connected.</p></div>`,`<button class="btn btn-light btn-sm" data-bs-dismiss="modal">Cancel</button><button class="btn btn-primary btn-sm" data-call-confirm>Start call</button>`,'SUPPORT CALL');}],
  [/Attachment picker ready/i,()=>{ const inp=document.createElement('input'); inp.type='file'; inp.accept='image/*,.pdf'; inp.onchange=()=>inp.files[0]&&toast(`${inp.files[0].name} attached.`); inp.click();}],
  [/Conversation escalated/i,()=>{state.escalations=(state.escalations||0)+1;saveState();toast('Conversation escalated to Operations.');}],
  [/Live parcel tracking opened/i,()=>{$('[data-page="live"]')?.click();toast('Parcel highlighted on live operations map.');}], [/Tour tracking\/details opened/i,()=>{$('[data-page="live"]')?.click();toast('Tour highlighted on live operations map.');}],
  [/Ride flagged/i,()=>{const r=currentRecordFromModal(D.rides);r.flagged=true;closeModal();toast(`${r.id} flagged for investigation.`);}],
  [/Driver access suspended/i,()=>{const d=currentRecordFromModal(D.drivers);d.status=d.status==='Suspended'?'Active':'Suspended';closeModal();toast(`${d.name} is now ${d.status.toLowerCase()}.`);renderCurrent();}],
  [/Rider account restriction updated/i,()=>{const r=currentRecordFromModal(D.riders);r.status=r.status==='Restricted'?'Active':'Restricted';closeModal();toast(`${r.name} is now ${r.status.toLowerCase()}.`);renderCurrent();}],
  [/Case escalated/i,()=>{const r=currentRecordFromModal(D.reports);r.status='Investigating';closeModal();toast('Case escalated to safety review.');renderCurrent();}],
  [/Case resolved/i,()=>{const r=currentRecordFromModal(D.reports);r.status='Resolved';closeModal();toast('Case resolved and audit entry created.');renderCurrent();}],
  [/Driver application approved/i,()=>{const a=currentRecordFromModal(D.applications);a.status='Approved';closeModal();toast('Driver application approved.');renderCurrent();}],
  [/Application rejected/i,()=>{const a=currentRecordFromModal(D.applications);a.status='Rejected';closeModal();toast('Application rejected.');renderCurrent();}],
  [/Withdrawal approved/i,()=>{const w=currentRecordFromModal(D.withdrawals);w.status='Approved';closeModal();toast('Withdrawal approved for payout processing.');renderCurrent();}],
  [/Withdrawal rejected/i,()=>{const w=currentRecordFromModal(D.withdrawals);w.status='Rejected';closeModal();toast('Withdrawal rejected and balance retained.');renderCurrent();}]
];

document.addEventListener('click', e=>{
  const b=e.target.closest('.action-toast'); if(!b) return;
  const message=b.dataset.message||''; const h=handlers.find(([rx])=>rx.test(message)); if(!h) return;
  e.preventDefault(); e.stopImmediatePropagation(); h[1](message,b);
}, true);

document.addEventListener('click',e=>{
  if(e.target.closest('[data-call-confirm]')){closeModal();toast('Call request started.');}
  const self=e.target.closest('button.tiny-btn:not(.action-toast):not(.open-detail)'); if(self && self.textContent.trim()==='You'){e.preventDefault();modal('Super Admin profile',`<div class="detail-grid"><div class="detail-item"><span>Name</span><b>Super Admin</b></div><div class="detail-item"><span>Email</span><b>admin@zenjigo.com</b></div><div class="detail-item"><span>Role</span><b>Super Admin</b></div><div class="detail-item"><span>2FA</span><b>Enabled</b></div></div><button class="btn btn-outline-primary btn-sm mt-3" data-profile-settings>Open profile settings</button>`,'','PROFILE');}
  if(e.target.closest('[data-profile-settings]')){closeModal();$('[data-page="settings"]')?.click();}
},true);

function enhancePage(){
  // Filters: status/category selects filter visible table rows using option text.
  $$('.toolbar select').forEach(sel=>{ sel.onchange=()=>{ const value=sel.value.toLowerCase(); $$('tbody tr').forEach(tr=>{ const search=$('#pageSearch')?.value.toLowerCase()||''; const text=tr.textContent.toLowerCase(); const statusOk=value.startsWith('all ')||text.includes(value); const searchOk=!search||text.includes(search); tr.classList.toggle('d-none',!(statusOk&&searchOk)); }); }; });
  // Chat: make conversation list selectable and send composer messages for real.
  $$('.chat-item').forEach((item,i)=>item.onclick=()=>{$$('.chat-item').forEach(x=>x.classList.remove('active'));item.classList.add('active');const c=D.chats[i];const head=$('.chat-head .table-user b');if(head)head.textContent=c.name;const sub=$('.chat-head .table-user span');if(sub)sub.textContent=`${c.role} • online`;});
  const send=$('.chat-composer .btn-primary'), box=$('.chat-composer input'); if(send&&box){ const fn=()=>{const msg=box.value.trim();if(!msg)return; const area=$('.chat-messages'); area.insertAdjacentHTML('beforeend',`<div class="bubble mine">${esc(msg)}<small>Now • Sending</small></div>`);box.value='';area.scrollTop=area.scrollHeight;setTimeout(()=>{const s=$('.chat-messages .bubble.mine:last-child small');if(s)s.textContent='Now • Sent';},300);}; send.onclick=e=>{e.preventDefault();e.stopImmediatePropagation();fn()}; box.onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();fn()}}; }
}
const observer=new MutationObserver(()=>enhancePage()); observer.observe($('#content'),{childList:true,subtree:false}); enhancePage();

// Preserve settings toggles and form changes locally, making the static frontend stateful.
document.addEventListener('change',e=>{if(!e.target.closest('#content'))return; if(e.target.matches('input[type=checkbox],select')){state.ui=state.ui||{};state.ui[`${document.querySelector('#sideNav .active')?.dataset.page||'page'}:${e.target.closest('.setting-row')?.textContent.trim().slice(0,40)||e.target.name||e.target.value}`]=e.target.type==='checkbox'?e.target.checked:e.target.value;saveState();}},true);

// Global search covers operational IDs and people instead of redirecting every query to rides.
document.addEventListener('keydown', e=>{
  if(e.target?.id!=='globalSearch' || e.key!=='Enter') return;
  const q=e.target.value.trim().toLowerCase(); if(!q) return;
  e.preventDefault(); e.stopImmediatePropagation();
  const items=[
    ...D.rides.map(x=>({type:'Ride',id:x.id,title:`${x.rider} → ${x.driver}`,sub:`${x.from} → ${x.to}`,page:'rides',kind:'ride'})),
    ...D.drivers.map(x=>({type:'Driver',id:x.id,title:x.name,sub:`${x.vehicle} • ${x.plate}`,page:'drivers',kind:'driver'})),
    ...D.riders.map(x=>({type:'Rider',id:x.id,title:x.name,sub:`${x.area}, ${x.island}`,page:'riders',kind:'rider'})),
    ...D.parcels.map(x=>({type:'Parcel',id:x.id,title:x.rider,sub:`${x.pickup} → ${x.drop}`,page:'parcels'})),
    ...D.tours.map(x=>({type:'Tour',id:x.id,title:x.customer,sub:x.package,page:'tours'})),
    ...D.withdrawals.map(x=>({type:'Withdrawal',id:x.id,title:x.driver,sub:`${x.method} • ${money(x.amount)}`,page:'withdrawals',kind:'withdraw'})),
  ].filter(x=>`${x.type} ${x.id} ${x.title} ${x.sub}`.toLowerCase().includes(q)).slice(0,12);
  modal(`Search results for “${esc(e.target.value.trim())}”`, items.length?`<div class="list-group">${items.map(x=>`<button type="button" class="list-group-item list-group-item-action" data-global-result data-page="${x.page}" data-kind="${x.kind||''}" data-id="${x.id}"><div class="d-flex justify-content-between"><b>${esc(x.title)}</b><span class="badge text-bg-light">${x.type}</span></div><small class="muted">${esc(x.id)} • ${esc(x.sub)}</small></button>`).join('')}</div>`:`<div class="text-center py-5"><i class="bi bi-search fs-2 muted"></i><p class="mt-2 mb-0">No matching rides, users, parcels, tours or withdrawals.</p></div>`,'','GLOBAL SEARCH');
}, true);
document.addEventListener('click',e=>{
  const row=e.target.closest('[data-global-result]'); if(!row)return;
  closeModal(); document.querySelector(`[data-page="${row.dataset.page}"]`)?.click();
  setTimeout(()=>{
    if(row.dataset.kind==='rider') window.ZAdmin?.rider(row.dataset.id);
    else if(row.dataset.kind==='withdraw') window.ZAdmin?.withdraw(row.dataset.id);
    else if(row.dataset.kind) document.querySelector(`[data-kind="${row.dataset.kind}"][data-id="${row.dataset.id}"]`)?.click();
    else { const s=$('#pageSearch'); if(s){s.value=row.dataset.id;s.dispatchEvent(new Event('input'));} }
  },80);
},true);
})();

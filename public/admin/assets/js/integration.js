(() => {
'use strict';
const API=window.ZenjiGOAdminAPI;
const D=window.ZENJIGO_DATA;
let replaying=false,loading=false;
const $=s=>document.querySelector(s);
const escv=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function notify(msg,type='success'){ if(typeof toast==='function') toast(msg,type); else alert(msg); }
function money2(n){return Number(n||0).toLocaleString();}
function mapData(x){
  const drivers=(x.drivers||[]).map(d=>({id:d.id,name:d.fullName,phone:d.phone,email:d.email||'',vehicle:d.vehicleType||'—',plate:d.plateNumber||'—',type:d.vehicleType||'—',rating:d.rating??'—',rides:d.totalRides||0,status:d.applicationStatus||d.status,online:!!d.online,docs:'Server verified'}));
  const riders=(x.riders||[]).map(r=>({id:r.id,name:r.fullName,phone:r.phone,email:r.email||'',island:r.island||'—',area:r.region||r.ward||'—',rides:r.totalRides||0,wallet:Number(r.walletBalance||0),status:r.status,rating:r.rating??'—'}));
  const rides=(x.rides||[]).map(r=>({id:r.ride_code||r.id,rider:r.riderName||'—',driver:r.driverName||'—',type:r.ride_type,from:r.pickup_address,to:r.destination_address,fare:Number(r.final_fare??r.estimated_fare??0),status:r.status,payment:r.payment_method,time:r.created_at,pin:r.trip_pin||'—',distance:`${r.estimated_distance_km||0} km`,eta:`${r.estimated_duration_min||0} min`}));
  const payouts=(x.payouts||[]).map(p=>({id:p.id,driver:p.driverName,method:p.method,account:p.account_details||'',amount:Number(p.amount||0),fee:0,requested:p.created_at,status:p.status}));
  const tx=(x.payments||[]).map(p=>({id:p.id,type:p.provider==='driver_commission'?'Driver commission':'Payment',user:p.userName,method:p.provider,amount:Number(p.amount||0),direction:'Credit',time:p.created_at,status:p.status}));
  const promos=(x.promos||[]).map(p=>({code:p.code,description:p.description||p.title,discount:p.discount_type==='percent'?`${p.discount_value}%`:`TZS ${money2(p.discount_value)}`,service:p.applies_to,usage:`${p.usage_count||0} / ${p.usage_limit||'∞'}`,status:p.is_active?'Active':'Paused'}));
  const tours=(x.tours||[]).map(t=>({id:t.id,customer:'—',package:t.name,tourists:0,pickup:'—',pickupTime:'—',price:Number(t.base_price||0),status:t.is_active?'Active':'Paused'}));
  const parcels=(x.parcels||[]).map(p=>({id:p.parcel_code||p.id,rider:p.riderName,driver:p.driverName||'—',pickup:p.pickup_address,drop:p.delivery_address,recipient:'—',weight:`${p.weight_kg||0} kg`,time:p.created_at,status:p.status}));
  if(x.drivers)D.drivers=drivers;if(x.riders)D.riders=riders;if(x.rides)D.rides=rides;if(x.payouts)D.withdrawals=payouts;if(x.payments)D.transactions=tx;if(x.promos)D.promos=promos;if(x.tours)D.tours=tours;if(x.parcels)D.parcels=parcels;
}
async function loadPageData(page){
  const jobs={
    dashboard:[API.get('/admin/dashboard')],
    rides:[API.get('/admin/rides')],
    drivers:[API.get('/admin/drivers')],
    riders:[API.get('/admin/riders')],
    parcels:[API.get('/admin/parcels')],
    tours:[API.get('/admin/tour-packages')],
    finance:[API.get('/admin/payments'),API.get('/admin/commissions')],
    withdrawals:[API.get('/admin/payouts')],
    promotions:[API.get('/admin/promos')],
    notifications:[API.get('/admin/notifications')],
    chat:[API.get('/admin/conversations')],
    audit:[API.get('/admin/audit-logs')],
    pricing:[API.get('/admin/commission-settings')],
    settings:[API.get('/admin/settings')]
  };
  const a=jobs[page]; if(!a)return;
  try{
    const r=await Promise.all(a);
    if(page==='dashboard') D.dashboard=r[0];
    else if(page==='finance'){D.payments=r[0];D.commissions=r[1];mapData({payments:r[0]});}
    else if(page==='pricing') D.commissionSettings=r[0];
    else if(page==='settings') D.settings=r[0];
    else if(page==='notifications') D.notifications=r[0];
    else if(page==='chat') D.chats=(r[0]||[]).map(c=>({id:c.id,name:c.members||'Conversation',role:c.type,last:c.title||'',time:c.updated_at,unread:0,ride:c.ride_id||'—'}));
    else if(page==='audit') D.audit=r[0];
    else mapData({[page==='withdrawals'?'payouts':page==='promotions'?'promos':page==='tours'?'tours':page==='parcels'?'parcels':page]:r[0]});
  }catch(e){notify(e.message,'danger')}
}
async function replay(page){
  if(loading)return; loading=true;
  await loadPageData(page);
  replaying=true; document.querySelector(`[data-page="${page}"]`)?.click(); setTimeout(()=>{replaying=false;loading=false},50);
}
function setAuthVisible(login){
  $('#authView')?.classList.toggle('d-none',!login);$('#adminApp')?.classList.toggle('d-none',login);
}
async function doLogin(e){
  e.preventDefault(); const email=$('#loginEmail')?.value.trim(),password=$('#loginPassword')?.value||'';
  if(!email||!password){notify('Enter your admin email and password.','danger');return}
  const btn=e.submitter; if(btn){btn.disabled=true}
  try{await API.login(email,password);setAuthVisible(false);replay('dashboard');notify('Signed in to the live ZenjiGO Admin API.')}
  catch(err){notify(err.message,'danger')}
  finally{if(btn)btn.disabled=false}
}
window.addEventListener('load',()=>{
  const form=$('#loginForm'); if(form)form.onsubmit=doLogin;
  const sess=API.session(); if(sess?.accessToken){setAuthVisible(false);replay('dashboard')}
  const logout=()=>{API.logout().finally(()=>{setAuthVisible(true);location.reload()})};
  $('#logoutBtn')?.addEventListener('click',logout,true);$('#logoutDropdown')?.addEventListener('click',logout,true);
  document.querySelectorAll('#sideNav .nav-link[data-page]').forEach(n=>n.addEventListener('click',()=>{if(!replaying) replay(n.dataset.page)},true));
});
// Window capture is intentionally before the original demo's document handlers.
// It prevents mock mutations for core server-backed actions.
window.addEventListener('click',async(e)=>{
  const nav=e.target.closest('#sideNav .nav-link[data-page]');
  if(nav && !replaying){e.preventDefault();e.stopImmediatePropagation();replay(nav.dataset.page);return}
  const b=e.target.closest('.action-toast'); if(!b)return;
  const m=b.dataset.message||'';
  try{
    if(/Driver application approved/i.test(m)){e.preventDefault();e.stopImmediatePropagation();const id=window.__ZENJIGO_DETAIL_ID||null;if(id)await API.patch(`/admin/drivers/${id}/status`,{status:'active'});notify('Driver approval saved to MySQL.');return}
    if(/Application rejected/i.test(m)){e.preventDefault();e.stopImmediatePropagation();const id=window.__ZENJIGO_DETAIL_ID||null;if(id)await API.patch(`/admin/drivers/${id}/status`,{status:'rejected',reason:'Rejected by administrator'});notify('Driver rejection saved to MySQL.');return}
    if(/Withdrawal approved/i.test(m)){e.preventDefault();e.stopImmediatePropagation();const id=window.__ZENJIGO_DETAIL_ID||null;if(id)await API.patch(`/admin/payouts/${id}/status`,{status:'approved'});notify('Withdrawal approval saved to MySQL.');replay('withdrawals');return}
    if(/Withdrawal rejected/i.test(m)){e.preventDefault();e.stopImmediatePropagation();const id=window.__ZENJIGO_DETAIL_ID||null;if(id)await API.patch(`/admin/payouts/${id}/status`,{status:'rejected'});notify('Withdrawal rejection saved to MySQL.');replay('withdrawals');return}
    if(/Driver access suspended/i.test(m)){e.preventDefault();e.stopImmediatePropagation();const id=window.__ZENJIGO_DETAIL_ID||null;if(id)await API.patch(`/admin/drivers/${id}/status`,{status:'rejected',reason:'Access suspended by administrator'});notify('Driver access updated.');replay('drivers');return}
    if(/Commission settings saved/i.test(m)){e.preventDefault();e.stopImmediatePropagation();const inputs=[...document.querySelectorAll('#content input')];const cycle=Number(inputs.find(x=>/cycle|limit/i.test(x.name||x.id||''))?.value||60000);const percent=Number(inputs.find(x=>/commission/i.test(x.name||x.id||''))?.value||20);await API.patch('/admin/commission-settings',{cycleLimit:cycle,percent});notify('Commission settings saved to MySQL.');return}
  }catch(err){notify(err.message,'danger')}
},true);

// Intercept the key flow forms before the demo flow listener.
window.addEventListener('click',async(e)=>{
  const b=e.target.closest('[data-flow-submit]'); if(!b)return;
  const title=$('#modalTitle')?.textContent||''; const eyebrow=$('#modalEyebrow')?.textContent||'';
  if(!/DRIVER|RIDER|PROMOTION|COMMISSION|FINANCE/.test(eyebrow))return;
  try{
    const form=b.closest('.modal-content')?.querySelector('form'); if(!form)return;
    const data=Object.fromEntries(new FormData(form).entries());
    if(/Add rider/i.test(title)){e.preventDefault();e.stopImmediatePropagation();await API.post('/admin/riders',{fullName:data.name,phone:data.phone,email:data.email,island:data.island,region:data.area,wallet:Number(data.wallet||0)});notify('Rider created in MySQL.');bootstrap.Modal.getInstance($('#genericModal'))?.hide();replay('riders');}
    else if(/Add driver/i.test(title)){e.preventDefault();e.stopImmediatePropagation();await API.post('/admin/drivers',{fullName:data.name,phone:data.phone,email:data.email,vehicleType:String(data.type||'taxi').toLowerCase(),plateNumber:data.plate,make:data.vehicle,status:String(data.status||'Active').toLowerCase().replace(' ','_')});notify('Driver created in MySQL.');bootstrap.Modal.getInstance($('#genericModal'))?.hide();replay('drivers');}
    else if(/Create promotion/i.test(title)){e.preventDefault();e.stopImmediatePropagation();const now=new Date();await API.post('/admin/promos',{code:data.code,title:data.description||data.code,description:data.description,discountType:String(data.discountType).toLowerCase().startsWith('percent')?'percent':'fixed',discountValue:Number(data.discountValue),usageLimit:Number(data.limit||0)||null,validFrom:data.start?`${data.start} 00:00:00`:now.toISOString().slice(0,19).replace('T',' '),validUntil:data.end?`${data.end} 23:59:59`:now.toISOString().slice(0,19).replace('T',' '),appliesTo:String(data.service||'Rides').toLowerCase().startsWith('ride')?'ride':String(data.service||'').toLowerCase().startsWith('parcel')?'parcel':String(data.service||'').toLowerCase().startsWith('tour')?'tour':'all'});notify('Promotion created in MySQL.');bootstrap.Modal.getInstance($('#genericModal'))?.hide();replay('promotions');}
  }catch(err){notify(err.message,'danger')}
},true);
})();

(() => {
  'use strict';
  const KEY='zenjigo_admin_session';
  const cfg = window.ZENJIGO_ADMIN_CONFIG || {};
  const base = (cfg.apiBase || 'http://localhost:5000/api/v1').replace(/\/$/,'');
  function session(){ try{return JSON.parse(localStorage.getItem(KEY)||'null')}catch{return null} }
  function saveSession(v){localStorage.setItem(KEY,JSON.stringify(v))}
  function clearSession(){localStorage.removeItem(KEY)}
  async function request(path,opts={}){
    const s=session();
    const headers={'Content-Type':'application/json',...(opts.headers||{})};
    if(s?.accessToken) headers.Authorization=`Bearer ${s.accessToken}`;
    let res=await fetch(base+path,{...opts,headers});
    if(res.status===401 && s?.refreshToken){
      const rr=await fetch(base+'/auth/refresh',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({refreshToken:s.refreshToken})});
      if(rr.ok){const j=await rr.json();saveSession({...s,...j.data});headers.Authorization=`Bearer ${j.data.accessToken}`;res=await fetch(base+path,{...opts,headers});}
    }
    const json=await res.json().catch(()=>({success:false,message:'Invalid server response'}));
    if(!res.ok||json.success===false) throw new Error(json.message||`HTTP ${res.status}`);
    return json.data;
  }
  async function login(email,password){const d=await request('/auth/admin/login',{method:'POST',body:JSON.stringify({email,password})});saveSession(d);return d}
  async function logout(){const s=session();try{await request('/auth/logout',{method:'POST',body:JSON.stringify({refreshToken:s?.refreshToken||''})})}catch{}clearSession()}
  const get=p=>request(p);
  const post=(p,b)=>request(p,{method:'POST',body:JSON.stringify(b)});
  const patch=(p,b)=>request(p,{method:'PATCH',body:JSON.stringify(b)});
  const put=(p,b)=>request(p,{method:'PUT',body:JSON.stringify(b)});
  window.ZenjiGOAdminAPI={base,session,saveSession,clearSession,request,login,logout,get,post,patch,put};
})();
function normalizePhone(phone) {
  let p=String(phone||'').trim().replace(/[^\d+]/g,'');
  if (p.startsWith('00')) p='+'+p.slice(2);
  if (!p.startsWith('+')) p='+255'+p.replace(/^0/,'');
  return p;
}
module.exports={normalizePhone};

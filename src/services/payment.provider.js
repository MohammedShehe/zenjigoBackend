/**
 * Payment provider adapter.
 *
 * Replace this file's HTTP mapping with your actual TZS payment provider.
 * The rest of ZenjiGO does not change. Never store raw card data; store provider
 * tokens/mandates only. For mobile money, use the provider's customer/mandate ID.
 */
const config=require('../config/env');
const crypto=require('crypto');

async function chargeDriverCommission({amount,currency,driverId,paymentMethod}) {
  if(config.payment.provider==='example' || !config.payment.baseUrl || String(config.payment.apiKey||'').includes('CHANGE_ME')) {
    // Development-safe example mode. It records a successful simulated charge.
    return {provider:'example',externalReference:`EXAMPLE-COM-${driverId}-${Date.now()}`};
  }
  // Generic JSON HTTP adapter. Adjust field names/signing to your gateway.
  const body={
    merchantId:config.payment.merchantId,
    amount,currency,
    customerReference:String(driverId),
    paymentMethodToken:paymentMethod.provider_token,
    reference:`ZENJIGO-COM-${driverId}-${Date.now()}`
  };
  const res=await fetch(`${config.payment.baseUrl.replace(/\/$/,'')}/payments/charge`,{
    method:'POST',
    headers:{'content-type':'application/json','authorization':`Bearer ${config.payment.apiKey}`},
    body:JSON.stringify(body)
  });
  const data=await res.json().catch(()=>({}));
  if(!res.ok || data.status==='failed') throw new Error(data.message||'Payment provider rejected the commission payment.');
  return {provider:config.payment.provider,externalReference:data.reference||data.transactionId||body.reference};
}

function verifyWebhook(rawBody, signature) {
  if(!config.payment.webhookSecret) return false;
  const expected=crypto.createHmac('sha256',config.payment.webhookSecret).update(rawBody).digest('hex');
  return crypto.timingSafeEqual(Buffer.from(expected),Buffer.from(signature||''));
}
module.exports={chargeDriverCommission,verifyWebhook};

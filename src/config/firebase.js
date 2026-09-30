const admin = require('firebase-admin');
const fs = require('fs');
const config = require('./env');

let app = null;
function getFirebase() {
  if (app) return app;
  let credential;
  if (config.firebase.serviceAccountPath && fs.existsSync(config.firebase.serviceAccountPath)) {
    credential = admin.credential.cert(require(require('path').resolve(config.firebase.serviceAccountPath)));
  } else if (config.firebase.projectId && config.firebase.clientEmail && config.firebase.privateKey) {
    credential = admin.credential.cert({
      projectId: config.firebase.projectId,
      clientEmail: config.firebase.clientEmail,
      privateKey: config.firebase.privateKey
    });
  } else if (config.nodeEnv !== 'production') {
    return null;
  } else {
    throw new Error('Firebase credentials are not configured.');
  }
  app = admin.initializeApp({ credential });
  return app;
}
async function sendPush(tokens, notification, data = {}) {
  const firebase = getFirebase();
  if (!firebase || !tokens?.length) return { successCount: 0, failureCount: 0 };
  const result = await admin.messaging().sendEachForMulticast({
    tokens: [...new Set(tokens)],
    notification,
    data: Object.fromEntries(Object.entries(data).map(([k,v]) => [k, String(v)]))
  });
  return { successCount: result.successCount, failureCount: result.failureCount };
}
module.exports = { admin, getFirebase, sendPush };

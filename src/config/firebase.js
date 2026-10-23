const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');
const config = require('./env');

let app = null;
function getFirebase() {
  if (app) return app;
  let credential;
  if (config.firebase.serviceAccountPath && fs.existsSync(config.firebase.serviceAccountPath)) {
    credential = admin.credential.cert(require(path.resolve(config.firebase.serviceAccountPath)));
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

/**
 * Multicast FCM with high priority so live-tracking alerts can wake devices.
 */
async function sendPush(tokens, notification, data = {}) {
  const firebase = getFirebase();
  if (!firebase || !tokens?.length) return { successCount: 0, failureCount: 0 };
  const unique = [...new Set(tokens.filter(Boolean))];
  if (!unique.length) return { successCount: 0, failureCount: 0 };

  const stringData = Object.fromEntries(
    Object.entries(data || {}).map(([k, v]) => [k, v == null ? '' : String(v)])
  );

  const result = await admin.messaging().sendEachForMulticast({
    tokens: unique,
    notification: notification
      ? { title: notification.title || '', body: notification.body || '' }
      : undefined,
    data: stringData,
    android: {
      priority: 'high',
      notification: {
        channelId: 'zenjigo_rides',
        sound: 'default',
        defaultVibrateTimings: true,
        priority: 'high'
      }
    },
    apns: {
      headers: { 'apns-priority': '10' },
      payload: {
        aps: {
          sound: 'default',
          contentAvailable: true,
          mutableContent: true
        }
      }
    }
  });
  return { successCount: result.successCount, failureCount: result.failureCount };
}

module.exports = { admin, getFirebase, sendPush };

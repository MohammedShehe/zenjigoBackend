require('dotenv').config();

const requiredInProduction = [
  'JWT_ACCESS_SECRET','JWT_REFRESH_SECRET',
  'SMTP_HOST','SMTP_USER','SMTP_PASSWORD','SMTP_FROM',
  'CLOUDINARY_CLOUD_NAME','CLOUDINARY_API_KEY','CLOUDINARY_API_SECRET'
];

if (process.env.NODE_ENV === 'production') {
  const missing = requiredInProduction.filter((k) => !process.env[k] || process.env[k].includes('CHANGE_ME'));
  const firebaseConfigured = (process.env.FIREBASE_SERVICE_ACCOUNT_PATH && require('fs').existsSync(require('path').resolve(process.env.FIREBASE_SERVICE_ACCOUNT_PATH))) || (process.env.FIREBASE_PROJECT_ID && process.env.FIREBASE_CLIENT_EMAIL && process.env.FIREBASE_PRIVATE_KEY);
  if (!firebaseConfigured) missing.push('FIREBASE_SERVICE_ACCOUNT_PATH or FIREBASE_PROJECT_ID/FIREBASE_CLIENT_EMAIL/FIREBASE_PRIVATE_KEY');
  if (missing.length) throw new Error(`Missing production environment variables: ${missing.join(', ')}`);
}

const csv = (v, fallback='') => (v || fallback).split(',').map(s => s.trim()).filter(Boolean);

module.exports = {
  nodeEnv: process.env.NODE_ENV || 'development',
  port: Number(process.env.PORT || 5000),
  appName: process.env.APP_NAME || 'ZenjiGO',
  apiPrefix: process.env.API_PREFIX || '/api/v1',
  db: {
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT || 3306),
    name: process.env.DB_NAME || 'zenjigo',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    connectionLimit: Number(process.env.DB_CONNECTION_LIMIT || 20)
  },
  jwt: {
    accessSecret: process.env.JWT_ACCESS_SECRET || 'dev-access-secret',
    refreshSecret: process.env.JWT_REFRESH_SECRET || 'dev-refresh-secret',
    accessExpires: process.env.JWT_ACCESS_EXPIRES || '15m',
    refreshExpires: process.env.JWT_REFRESH_EXPIRES || '30d'
  },
  corsOrigins: csv(process.env.CORS_ORIGINS, 'http://localhost:5000,http://127.0.0.1:5000,http://localhost:3000,http://127.0.0.1:3000,http://localhost:5173,http://127.0.0.1:5173,http://localhost:5501,http://127.0.0.1:5501'),
  // NextSMS (replaces Twilio) — Internet SMS + WhatsApp SMS
  nextsms: {
    username: process.env.NEXTSMS_USERNAME,
    password: process.env.NEXTSMS_PASSWORD,
    // Optional pre-computed Basic token: base64(username:password)
    apiKey: process.env.NEXTSMS_API_KEY || '',
    senderId: process.env.NEXTSMS_SENDER_ID || 'NEXTSMS',
    baseUrl: process.env.NEXTSMS_BASE_URL || 'https://messaging-service.co.tz',
    // production | testing  (testing uses /api/.../v2/test/... endpoints)
    environment: process.env.NEXTSMS_ENVIRONMENT || 'production',
    defaultChannel: process.env.NEXTSMS_DEFAULT_CHANNEL || 'sms' // sms | whatsapp
  },
  cloudinary: {
    cloudName: process.env.CLOUDINARY_CLOUD_NAME,
    apiKey: process.env.CLOUDINARY_API_KEY,
    apiSecret: process.env.CLOUDINARY_API_SECRET,
    folder: process.env.CLOUDINARY_FOLDER || 'zenjigo'
  },
  firebase: {
    projectId: process.env.FIREBASE_PROJECT_ID,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    privateKey: (process.env.FIREBASE_PRIVATE_KEY || '').replace(/\\n/g, '\n'),
    serviceAccountPath: process.env.FIREBASE_SERVICE_ACCOUNT_PATH
  },
  security: {
    otpResendSeconds: Number(process.env.OTP_RESEND_SECONDS || 60),
    otpMaxAttempts: Number(process.env.OTP_MAX_ATTEMPTS || 5),
    maxUploadMb: Number(process.env.MAX_UPLOAD_MB || 10),
    rateWindowMs: Number(process.env.RATE_LIMIT_WINDOW_MS || 900000),
    rateMax: Number(process.env.RATE_LIMIT_MAX || 300)
  },
  // PayGrid payment provider (replaces generic example)
  payment: {
    provider: process.env.PAYMENT_PROVIDER || 'paygrid',
    baseUrl: process.env.PAYGRID_API_BASE_URL || process.env.PAYMENT_API_BASE_URL || '',
    apiKey: process.env.PAYGRID_API_KEY || process.env.PAYMENT_API_KEY || '',
    secretKey: process.env.PAYGRID_SECRET_KEY || '',
    merchantId: process.env.PAYGRID_MERCHANT_ID || process.env.PAYMENT_MERCHANT_ID || '',
    webhookSecret: process.env.PAYGRID_WEBHOOK_SECRET || process.env.PAYMENT_WEBHOOK_SECRET || '',
    // Optional: public key for client-side / hosted checkout
    publicKey: process.env.PAYGRID_PUBLIC_KEY || ''
  },
  ride: {
    currency: process.env.CURRENCY || 'TZS',
    countryCode: process.env.DEFAULT_COUNTRY_CODE || '+255',
    timeoutSeconds: Number(process.env.DEFAULT_RIDE_TIMEOUT_SECONDS || 45),
    locationStaleSeconds: Number(process.env.DRIVER_LOCATION_STALE_SECONDS || 60),
    baseFare: Number(process.env.BASE_FARE_TZS || 2500),
    perKm: Number(process.env.PER_KM_FARE_TZS || 900),
    perMinute: Number(process.env.PER_MINUTE_FARE_TZS || 150),
    bookingFee: Number(process.env.BOOKING_FEE_TZS || 500),
    driverCommission: Number(process.env.DRIVER_COMMISSION_PERCENT || 20)
  },
  smtp: {
    host: process.env.SMTP_HOST, port: Number(process.env.SMTP_PORT || 587),
    user: process.env.SMTP_USER, password: process.env.SMTP_PASSWORD,
    from: process.env.SMTP_FROM || 'ZenjiGO <no-reply@example.com>'
  },
  seedAdmin: { email: process.env.SEED_ADMIN_EMAIL, password: process.env.SEED_ADMIN_PASSWORD, phone: process.env.SEED_ADMIN_PHONE || '+255700000001' }
};

const express = require('express');
const path = require('path');
const helmet = require('helmet');
const cors = require('cors');
const compression = require('compression');
const morgan = require('morgan');
const cookieParser = require('cookie-parser');

const config = require('./config/env');
const { globalLimiter } = require('./middleware/rateLimit');
const { auth, roles } = require('./middleware/auth');
const { notFound, errorHandler } = require('./middleware/error');

const app = express();

app.set('trust proxy', 1);

/*
|--------------------------------------------------------------------------
| CORS
|--------------------------------------------------------------------------
|
| CORS_ORIGINS in .env can contain comma-separated origins:
|
| CORS_ORIGINS=http://localhost:5000,http://127.0.0.1:5000,http://localhost:3000
|
| In development we also allow the common local frontend ports.
| In production, configure the exact production domains in .env.
|
*/

const configuredCorsOrigins = Array.isArray(config.corsOrigins)
  ? config.corsOrigins
  : String(config.corsOrigins || '')
      .split(',')
      .map((origin) => origin.trim())
      .filter(Boolean);

const developmentCorsOrigins = [
  'http://localhost:5000',
  'http://127.0.0.1:5000',
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  'http://localhost:3001',
  'http://127.0.0.1:3001',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://localhost:4173',
  'http://127.0.0.1:4173',
  'http://localhost:8080',
  'http://127.0.0.1:8080',
  'http://localhost:5500',
  'http://127.0.0.1:5500',
  'http://localhost:5501',
  'http://127.0.0.1:5501',
  'http://localhost:5502',
  'http://127.0.0.1:5502',
  'http://localhost:5503',
  'http://127.0.0.1:5503',
];

const allowedCorsOrigins = [
  ...new Set([
    ...configuredCorsOrigins,
    ...(config.nodeEnv !== 'production'
      ? developmentCorsOrigins
      : []),
  ]),
];

const corsOptions = {
  origin(origin, callback) {
    /*
     * Requests from Postman, curl, mobile apps, server-to-server calls,
     * etc. may not contain an Origin header.
     */
    if (!origin) {
      return callback(null, true);
    }

    /*
     * Explicit wildcard support.
     */
    if (allowedCorsOrigins.includes('*')) {
      return callback(null, true);
    }

    /*
     * Exact origin match.
     */
    if (allowedCorsOrigins.includes(origin)) {
      return callback(null, true);
    }

    console.warn(`[CORS] Blocked origin: ${origin}`);
    console.warn(
      `[CORS] Allowed origins: ${allowedCorsOrigins.join(', ')}`
    );

    return callback(
      new Error(`CORS origin not allowed: ${origin}`)
    );
  },

  credentials: true,

  methods: [
    'GET',
    'POST',
    'PUT',
    'PATCH',
    'DELETE',
    'OPTIONS',
  ],

  allowedHeaders: [
    'Content-Type',
    'Authorization',
    'X-Requested-With',
    'Accept',
    'Origin',
  ],

  exposedHeaders: [
    'Content-Length',
    'Content-Type',
  ],

  optionsSuccessStatus: 204,
};

app.use(helmet());

app.use(cors(corsOptions));

/*
 * Explicit OPTIONS handling for browser preflight requests.
 */

app.use(compression());

// Capture raw body for payment webhook HMAC verification
app.use(
  express.json({
    limit: '2mb',
    verify: (req, res, buf) => {
      // Always keep a copy; payment routes use it for signature checks
      req.rawBody = buf;
    },
  })
);

app.use(
  express.urlencoded({
    extended: true,
    limit: '2mb',
  })
);

app.use(cookieParser());

app.use(
  morgan(
    config.nodeEnv === 'production'
      ? 'combined'
      : 'dev'
  )
);

app.use(globalLimiter);

/*
|--------------------------------------------------------------------------
| Health Check
|--------------------------------------------------------------------------
*/

app.get('/health', async (req, res) => {
  try {
    await require('./config/db').health();

    res.json({
      success: true,
      status: 'ok',
      service: 'zenjigo-backend',
      time: new Date().toISOString(),
    });
  } catch (e) {
    res.status(503).json({
      success: false,
      status: 'unhealthy',
      message: e.message,
    });
  }
});

/*
|--------------------------------------------------------------------------
| Admin Web
|--------------------------------------------------------------------------
*/

// The admin console is a static SPA. It needs a slightly different CSP from the JSON API
// (map tiles + Leaflet from unpkg); everything else stays locked to same-origin.
app.use('/admin', (req, res, next) => {
  res.setHeader(
    'Content-Security-Policy',
    [
      "default-src 'self'",
      "script-src 'self' https://unpkg.com",
      "style-src 'self' 'unsafe-inline' https://unpkg.com",
      "img-src 'self' data: blob: https:",
      "font-src 'self' data:",
      "connect-src 'self'",
      "frame-src 'self' https://res.cloudinary.com https://docs.google.com",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "frame-ancestors 'none'"
    ].join('; ')
  );
  // OpenStreetMap's tile servers reject requests with no Referer (helmet's default is no-referrer).
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Cache-Control', 'no-cache');
  next();
});
app.use(
  '/admin',
  express.static(
    path.join(__dirname, '../public/admin')
  )
);

/*
|--------------------------------------------------------------------------
| API
|--------------------------------------------------------------------------
*/

const p = config.apiPrefix;
app.get(p, (req, res) => res.json({ success: true, service: 'zenjigo-backend', api: p, health: '/health' }));

/*
|--------------------------------------------------------------------------
| Authentication
|--------------------------------------------------------------------------
*/

app.use(
  `${p}/auth`,
  require('./routes/auth.routes')
);

/*
|--------------------------------------------------------------------------
| Payments
|--------------------------------------------------------------------------
*/

app.use(
  `${p}/payments`,
  require('./routes/payment.routes')
);

/*
|--------------------------------------------------------------------------
| RIDER
|--------------------------------------------------------------------------
*/

app.use(
  `${p}/rider`,
  auth,
  roles('rider'),
  require('./routes/user.routes')
);

app.use(
  `${p}/rider/rides`,
  auth,
  roles('rider'),
  require('./routes/ride.routes')
);

// Online drivers near a lat/lng (map markers for rider booking screen)
app.get(
  `${p}/rider/drivers/nearby`,
  auth,
  roles('rider'),
  require('./controllers/ride.controller').nearbyDrivers
);

app.use(
  `${p}/rider/wallet`,
  auth,
  roles('rider'),
  require('./routes/wallet.routes')
);

app.use(
  `${p}/rider/notifications`,
  auth,
  roles('rider'),
  require('./routes/notification.routes')
);

app.use(
  `${p}/rider/chat`,
  auth,
  roles('rider'),
  require('./routes/chat.routes')
);

app.use(
  `${p}/rider`,
  auth,
  roles('rider'),
  require('./routes/extra.routes')
);

/*
|--------------------------------------------------------------------------
| DRIVER
|--------------------------------------------------------------------------
*/

app.use(
  `${p}/driver`,
  require('./routes/driver.public.routes')
);

app.use(
  `${p}/driver`,
  auth,
  roles('driver'),
  require('./routes/driver.routes')
);

app.use(
  `${p}/driver/chat`,
  auth,
  roles('driver'),
  require('./routes/chat.routes')
);

app.use(
  `${p}/driver/notifications`,
  auth,
  roles('driver'),
  require('./routes/notification.routes')
);

app.use(
  `${p}/driver/rides`,
  auth,
  roles('driver'),
  require('./routes/ride.routes')
);

/*
|--------------------------------------------------------------------------
| ADMIN
|--------------------------------------------------------------------------
*/

app.use(
  `${p}/admin`,
  auth,
  roles('admin'),
  require('./routes/admin.routes')
);

/*
|--------------------------------------------------------------------------
| Uploads
|--------------------------------------------------------------------------
*/

app.use(
  `${p}/upload`,
  auth,
  require('./routes/upload.routes')
);

/*
|--------------------------------------------------------------------------
| Promos
|--------------------------------------------------------------------------
*/

app.use(
  `${p}/promos`,
  auth,
  require('./routes/promo.routes')
);

/*
|--------------------------------------------------------------------------
| 404 / Error Handling
|--------------------------------------------------------------------------
*/

app.use(notFound);
app.use(errorHandler);

module.exports = app;
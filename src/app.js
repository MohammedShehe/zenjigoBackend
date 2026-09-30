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
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://localhost:8080',
  'http://127.0.0.1:8080',
  'http://localhost:5501',
  'http://127.0.0.1:5501',
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

app.use(
  express.json({
    limit: '2mb',
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
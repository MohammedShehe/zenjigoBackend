# ZenjiGO Backend

Production-oriented Node.js + Express + MySQL backend for the ZenjiGO **Rider**, **Driver**, and **Admin** applications.

## Stack
- Node.js 20+
- Express 5
- MySQL 8+
- JWT access/refresh tokens
- Twilio Verify for OTP SMS/WhatsApp
- Cloudinary for images/documents
- Firebase Admin / FCM for push notifications
- Socket.IO for live driver location and chat
- Helmet, CORS, rate limiting, validation, compression
- Transactional MySQL operations for ride assignment and wallet accounting

## 1. Configure
Edit `.env`. The supplied values are examples only.

Required database defaults:
```text
DB_HOST=localhost
DB_PORT=3306
DB_NAME=zenjigo
DB_USER=root
DB_PASSWORD=
```

You must replace the Twilio, Cloudinary, Firebase and JWT example values with your real credentials before production.

## 2. Install
```bash
npm install
```

## 3. Create all tables
```bash
npm run migrate
```
The migration creates `zenjigo` if it does not exist and creates all application tables. Existing data is not deleted by the migration.

## 4. Create the first admin
```bash
npm run seed
```
The admin email/password come from `SEED_ADMIN_EMAIL` and `SEED_ADMIN_PASSWORD`.

**Immediately change the seed admin password and keep `.env` out of source control.**

## 5. Start
Development:
```bash
npm run dev
```
Production:
```bash
npm start
```

Health check:
`GET http://localhost:5000/health`

API base:
`http://localhost:5000/api/v1`

## Authentication
Rider:
1. `POST /auth/rider/send-otp`
2. `POST /auth/rider/verify-otp`
3. Use returned `accessToken` as `Authorization: Bearer <token>`

Driver:
1. `POST /driver/register` (multipart/form-data)
2. Admin reviews the application.
3. `POST /auth/driver/send-otp`
4. `POST /auth/driver/login`

Admin:
`POST /auth/admin/login`

Refresh:
`POST /auth/refresh`

## Main API groups

### Rider
- `/rider/me`
- `/rider/saved-locations`
- `/rider/payment-methods`
- `/rider/rides/quote`
- `/rider/rides`
- `/rider/wallet`
- `/rider/notifications`
- `/rider/chat`
- `/rider/parcels`
- `/rider/tour-packages`
- `/rider/tours`
- `/promos`

### Driver
- `/driver/register`
- `/driver/me`
- `/driver/documents`
- `/driver/online`
- `/driver/location`
- `/driver/ride-requests`
- `/driver/rides/:id/accept`
- `/driver/rides/:id/status`
- `/driver/earnings`
- `/driver/payout`

### Admin
- `/admin/dashboard`
- `/admin/riders`
- `/admin/drivers`
- `/admin/drivers/:id`
- `/admin/drivers/:id/status`
- `/admin/documents/:id/status`
- `/admin/rides`
- `/admin/promos`
- `/admin/payments`
- `/admin/payments/:id/complete`
- `/admin/payouts`
- `/admin/notifications`
- `/admin/tour-packages`
- `/admin/audit-logs`

## Socket.IO
Connect to the same host using the access token:
```js
io("http://localhost:5000", {
  auth: { token: accessToken }
});
```

Events:
- `ride:join` `{ rideId }`
- `ride:location` emitted to ride participants
- `driver:location` `{ rideId, lat, lng, heading, speed }`
- `chat:join` `{ conversationId }`
- `chat:message` `{ conversationId, text, replyToId }`

## Payments
The project specification did not name a concrete mobile-money/card payment gateway. Therefore the backend includes a provider-neutral `payment_transactions` layer and wallet accounting, rather than pretending to implement a gateway that was not specified.

`POST /rider/wallet/topup` creates a pending payment. A real provider webhook/adapter should mark it successful. Admin can complete a pending payment using `/admin/payments/:id/complete` for controlled/manual testing.

Do not treat the manual completion endpoint as a production payment webhook. When you choose your real Tanzania payment provider, implement its signed webhook in a dedicated provider adapter.

## Production checklist
- Set `NODE_ENV=production`.
- Replace all example secrets.
- Use a dedicated MySQL user instead of root.
- Put the API behind HTTPS/reverse proxy.
- Restrict `CORS_ORIGINS` to actual app/web origins.
- Use a real Firebase service account.
- Configure Twilio Verify.
- Configure Cloudinary.
- Configure your actual payment gateway webhook before accepting real wallet money.
- Use a process manager/container orchestration.
- Enable MySQL backups and monitoring.
- Rotate JWT/credential secrets periodically.
- Never commit `.env` or Firebase service-account JSON.

# ZenjiGO Database

The backend uses the existing `users` table for all account types:

- `role='rider'`
- `role='driver'`
- `role='admin'`

There is intentionally **no separate `admins` table**.

## Fresh database

```bash
npm run migrate
npm run seed
```

## Existing database

The migration runner records each SQL file in `schema_migrations`. The business-rule and reconciliation migrations are idempotent and safely add missing columns/indexes without dropping application data.

If an older installation has only `001_initial.sql` recorded but already contains some later tables, run:

```bash
npm run migrate
```

The remaining migrations will be applied and recorded.

## Admin authentication

Admin login is:

1. Email + password
2. Twilio OTP
3. JWT access/refresh tokens

The OTP purpose `admin_login` is included in the schema.

## Driver finance

Default business settings:

- Settlement threshold: TZS 60,000 gross earnings
- ZenjiGO commission: 20%
- Driver share: 80%

Driver earnings are recorded in `driver_earning_ledger`. A driver becomes restricted when a complete TZS 60,000 cycle is earned and the corresponding commission is outstanding.

## Important

Take a database backup before applying production migrations.
Never store raw card/mobile-money credentials. Store only provider-issued payment tokens/mandates.

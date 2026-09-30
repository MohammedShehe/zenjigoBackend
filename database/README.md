# Database

Run:

```bash
npm run migrate
```

The migration is idempotent: it records each applied SQL file in `schema_migrations` and does not drop application tables.

For production, take a MySQL backup before schema changes and run migrations from a controlled deployment process.

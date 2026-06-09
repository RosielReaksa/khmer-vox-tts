# Production Database

Use Supabase/Postgres before accepting real users or real KHQR payments.

## Setup

1. Create a Supabase project.
2. Copy the Supabase Postgres connection string into `.env` as `DATABASE_URL`.
3. Keep `DATABASE_SSL="true"` for Supabase.
4. Run:

```powershell
npm run db:setup
npm run db:check
```

`npm run db:setup` applies `database/schema.sql`.

`npm run db:check` verifies required tables, columns, the expired payment status, and important production environment values.

## Optional Local JSON Migration

If you want to copy local development data from `data/store.json` into Postgres:

```powershell
npm run db:migrate-json -- --dry-run
npm run db:migrate-json
```

The migration is idempotent by record ID. If an email already exists under a different user ID, the migration fails instead of merging accounts.

## Required Tables

- `users`
- `api_keys`
- `token_transactions`
- `generations`
- `payment_orders`

The app also has a production guard: if `NODE_ENV=production` and `DATABASE_URL` is not Postgres, server-side store access fails instead of using `data/store.json`.

# Local development and safety runbook

## Scope

Commands below are for local development only. Never substitute a production URL or database. Do not use populated credential files in terminal output. The root development script checks local database configuration before starting Next.js. Prisma schema tools and seeds must only run after confirming their exact local target and separate approval for data/schema changes.

## Applications and ports

- Root customer/agent/admin app and API: `http://localhost:3000` by default (`PORT` may override it).
- Standalone admin app: `http://localhost:3003` when started with port 3003.
- Local PostgreSQL used by the approved local fixture configuration: database `parthiv_db`, loopback port `5433`.
- The standalone admin app needs `apps/admin/.env.local` with `NEXT_PUBLIC_API_BASE_URL=http://localhost:3000`. Keep local env files untracked and do not paste their contents into logs or tickets.

## Start locally

In one PowerShell terminal from the project directory:

```powershell
npm.cmd run dev
```

In another terminal:

```powershell
Set-Location .\apps\admin
npm.cmd run dev -- --port 3003
```

The root dev script runs `scripts/local-db-guard.ts` before Next.js. The standalone admin app proxies browser `/api/*` requests to its configured backend and enforces localhost in development. Do not use the standalone fixture script as an application startup command.

## Safe checks

Read-only checks that do not require a database connection:

```powershell
node .\node_modules\typescript\bin\tsc --noEmit --incremental false -p .\tsconfig.json
node .\node_modules\typescript\bin\tsc --noEmit --incremental false -p .\apps\admin\tsconfig.json
```

The root `npm test` command runs the checked-in Vitest suites and standalone tests. Current route tests stub database operations and mock payment-provider HTTP calls; the health readiness test uses a mocked Prisma client. Review test changes before execution to confirm they still avoid shared databases and external services. Do not run Prisma migration, push, or seed commands without reviewing the active environment and obtaining approval. The admin dashboard fixture script is write-capable and must not be run again unless separately authorized.

## Health checks and operational logs

The main application exposes two unauthenticated, non-cached health endpoints:

- `GET /api/health/live` returns `200` with `{"status":"alive"}` when the route handler can run. It does not query dependencies, so a database outage does not cause a liveness failure.
- `GET /api/health/ready` runs a lightweight PostgreSQL `SELECT 1` through Prisma. It returns `200` with `{"status":"ready"}` only when that query succeeds, or a generic `503` with `{"status":"not_ready"}` when it fails. The response and logs do not include connection details or error messages.

Both endpoints return `Cache-Control: no-store` and an `X-Request-Id` response header. A valid UUID from the incoming `X-Request-Id` header is preserved; otherwise the application creates one. Configure hosting probes to use liveness and readiness separately only after the deployment platform and its probe behavior are confirmed. Keep readiness intervals modest because each check performs one database query. No provider-specific health-check configuration is checked in.

The main app writes JSON log events to stdout/stderr with a timestamp, severity, event name, and—on observed API routes—route, method, response status, duration, and request ID. Request duration/status logging currently covers health, payment creation, verification, reconciliation, webhooks, and admin refund requests. Next.js route-handler exceptions also produce a sanitized framework error event with the static route template and method; request paths, query strings, headers, and error messages are excluded. A verified Razorpay `payment.failed` webhook and refund failures emit sanitized payment-failure events. Prisma operation failures and Prisma client warnings emit safe database events without raw messages or SQL. These events can support latency and failure counts if the selected host retains and indexes application logs.

This is not an aggregated metrics or alerting system. Request duration/status events remain limited to the wrapped routes; the framework hook reports uncaught route errors but does not measure successful response latency elsewhere. Prisma operation failures are counted at the shared client boundary, while external provider signals remain limited to application events on selected code paths. Provider availability is not probed by readiness. No dashboard, log-retention policy, or alert delivery is configured. Hosting and monitoring provider selection, log retention, and alert thresholds remain pending confirmation.

The standalone admin app is a separate Next.js application. The endpoints above check only the main application. The admin proxy and API client fall back to `https://www.junkitout.in` when `NEXT_PUBLIC_API_BASE_URL` is unset, and the admin UI has an allowlisted Vercel URL. These are configuration clues, not proof that either app is hosted on Vercel. Do not add an admin readiness probe that calls the fallback URL. The senior developer must decide whether the admin app is independently deployed and whether backend availability is a readiness dependency. Until then, use the main-app probes only.

For local checks, start the main app against the approved local database, then call:

```powershell
curl.exe -i http://localhost:3000/api/health/live
curl.exe -i http://localhost:3000/api/health/ready
```

The liveness call does not require a database. Readiness performs only the read-only `SELECT 1`. Use the returned request ID to correlate a failed readiness or payment request with application logs; never paste populated environment values or credentials into logs or tickets.

## Hosting and monitoring provider decision

The repository contains a GitHub Actions CI workflow, the `@vercel/blob` package, `blob.vercel-storage.com` URL handling, a Vercel-looking admin origin allowlist, and the admin backend fallback domain. It contains no deployment workflow, hosting manifest, monitoring SDK, or alert destination. Blob usage and URL allowlists do not establish the application hosting provider. Confirm the root app host, admin app host, PostgreSQL provider, monitoring/log provider, secret manager, and production URLs with the senior developer before configuring probes, log shipping, retention, dashboards, or alerts.

## Database backup and restore

Before production launch, the database owner must confirm automated backup and point-in-time recovery availability, backup frequency, retention, encryption/access controls, restore point selection, recovery point objective (RPO), recovery time objective (RTO), and the operator authorized to restore. Record the provider-specific console/command procedure in the approved operations system; no provider or production endpoint is established in this repository.

Before an approved production migration, verify the most recent backup is complete and restorable, take an on-demand provider snapshot when supported, and record the application release and migration IDs. Do not print database URLs, credentials, or backup tokens. Never use `prisma db push`, `prisma migrate reset`, or seed scripts as a production recovery procedure.

For a restore incident, declare an incident and obtain database-owner approval. Preserve the current database for investigation when feasible. Restore the selected backup to an isolated recovery database first; validate schema/migration state, application invariants, and a small set of read-only operational queries. Estimate data loss against the incident time and RPO. Only the authorized database owner and incident lead may approve production cutover. Keep the application in maintenance/read-only mode while the cutover is coordinated. Provider-specific restore and cutover steps remain pending.

## Migration recovery

Use reviewed, version-controlled Prisma migrations and the approved release procedure. Before deployment, review the SQL for locks, table rewrites, destructive changes, and long-running work; confirm backup and rollback compatibility. From the approved release runner, check migration status with `npx prisma migrate status`, verify the target through the approved secret manager without printing connection values, then use `npx prisma migrate deploy` only as part of the authorized production release. Never run migrations as an ad-hoc troubleshooting step. These commands were documented but not run against any production database.

If a migration fails, stop subsequent migrations and deployments. Preserve the migration output with secrets removed, record the migration ID and database state, and involve the database owner. Do not edit an already-applied migration or reset production. Prefer a reviewed forward corrective migration. Restore from backup only when the incident lead and database owner determine that forward repair is unsafe, accounting for writes made since the recovery point. Exact Prisma command and operator steps must be confirmed for the production environment.

## Deployment rollback

Keep the last known-good immutable application artifact and its release identifier available. If a release fails health checks or produces sustained server/database/payment failures, use the selected host's approved traffic rollback to the last known-good artifact and verify liveness, readiness, and key read-only application flows. A code rollback does not reverse database migrations. Keep schema changes backward-compatible across the rollback window; otherwise coordinate a forward fix or approved database recovery with the database owner. The hosting provider, artifact retention, traffic rollback procedure, and maintenance-mode mechanism are pending confirmation.

## Incident handling and alert signals

For an incident, assign an incident lead, record start time and affected release, classify customer/agent/admin impact, and preserve sanitized request IDs and event names. Check liveness, readiness, API status/duration events, `database.operation.failed`, `database.client.warning`, `payment.provider.failed`, and `payment.provider.refund_failed`. Compare event counts and latency by static route template; do not expose request bodies, query strings, tokens, phone numbers, payment IDs, or database messages in incident notes. Do not send real OTPs, charges, refunds, payouts, or notifications as diagnostics. Reconcile payment/refund state only through the approved provider workflow.

Suggested alert signals are sustained API 5xx rate, route latency percentiles, readiness failures, database operation failures, and verified payment/refund failure events. Thresholds, aggregation, log retention, escalation owner, and delivery destination require senior/provider decisions; none are configured here. Use the release checklist in [production-release-checklist.md](./production-release-checklist.md) before production approval.

## Troubleshooting

- If the root local DB guard rejects configuration, stop and correct the local environment deliberately; do not point the app at a remote host to make it start.
- Standalone admin proxy `503` means backend URL configuration is missing or rejected. Check only whether the variable is set and that its target is local; do not print the value alongside other env vars.
- Admin API `401` means the request lacks a valid session; `403` means the session lacks the required role. Do not weaken server checks to resolve either response.
- Dashboard metrics are API/database-derived. Compare authenticated API status and response shape before assuming data is missing. Existing fixture data should not be recreated.
- A readiness `503` means the main app could not complete its database probe. Check database reachability and credentials through the approved secret manager without printing their values. Liveness `200` alone does not establish database readiness.
- Some older routes and provider integrations still emit unstructured logs or full error objects. Treat raw logs as sensitive, restrict access, and do not forward them externally until they have been reviewed and redacted.

## Incident and external-service handling

For OTP, payment, refund, payout, upload, or notification failures, first inspect local status and sanitized error type. Do not send a real OTP, charge, refund, payout, or notification as a diagnostic. Payment provider state must be reconciled against verified provider data through an approved workflow. A settlement status in this application does not by itself prove a payout transfer occurred.

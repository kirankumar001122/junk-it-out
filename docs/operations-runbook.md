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

Pure tests can be run individually with the repository's local `tsx` executable. Do not run `npm test` casually: its configured payment/pickup suite creates and updates database fixtures and may invoke payment code. Do not run Prisma migration, push, or seed commands without reviewing the active environment and obtaining approval. The admin dashboard fixture script is write-capable and must not be run again unless separately authorized.

## Troubleshooting

- If the root local DB guard rejects configuration, stop and correct the local environment deliberately; do not point the app at a remote host to make it start.
- Standalone admin proxy `503` means backend URL configuration is missing or rejected. Check only whether the variable is set and that its target is local; do not print the value alongside other env vars.
- Admin API `401` means the request lacks a valid session; `403` means the session lacks the required role. Do not weaken server checks to resolve either response.
- Dashboard metrics are API/database-derived. Compare authenticated API status and response shape before assuming data is missing. Existing fixture data should not be recreated.
- There is no dedicated health/readiness endpoint in the inspected route inventory. A protected stats endpoint is not a substitute for an unauthenticated readiness check.
- Error logs are generally designed to emit error types rather than raw exceptions, but some legacy routes log full error objects. Redact sensitive context before sharing logs.

## Incident and external-service handling

For OTP, payment, refund, payout, upload, or notification failures, first inspect local status and sanitized error type. Do not send a real OTP, charge, refund, payout, or notification as a diagnostic. Payment provider state must be reconciled against verified provider data through an approved workflow. A settlement status in this application does not by itself prove a payout transfer occurred.

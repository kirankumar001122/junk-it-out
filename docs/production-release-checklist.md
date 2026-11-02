# Production release readiness

Use this checklist for each production release. A checked item needs evidence in the release record. Hosting, database, and monitoring provider-specific steps are pending senior confirmation.

## Ownership and release scope

- [ ] Senior developer and release operator identified; change has approved PR review.
- [ ] Release commit, application artifact, and database migration IDs recorded.
- [ ] Root app and standalone admin deployment targets and URLs confirmed.
- [ ] Rollback owner, incident lead, and customer communications owner identified.

## Code and validation

- [ ] CI passes on the exact release commit: `npm ci`, `npm test`, root/admin TypeScript checks, and root/admin builds.
- [ ] No test, build, or migration command contacted production or a shared database unexpectedly.
- [ ] Root and admin artifacts were built independently from the committed lockfiles.
- [ ] Dependency/security findings and generated Prisma client state reviewed.
- [ ] Database changes use reviewed Prisma migrations; no production `db push`, reset, or seed is part of release.
- [ ] API contract, authorization, payment idempotency, webhook signature, cancellation, and refund behavior reviewed for the release.

## Environment and secrets

- [ ] Production `DATABASE_URL` and `DIRECT_URL` target the approved PostgreSQL environment and follow the approved pooling/direct-connection policy.
- [ ] `JWT_SECRET` is a production-only secret with approved rotation/rollback handling.
- [ ] Razorpay key ID/secret and webhook secret are configured from the approved secret manager; test and live credentials are not mixed. The root app accepts several legacy aliases (`RAZORPAY_SECRET`, `PAYMENT_KEY_ID`, `PAYMENT_KEY_SECRET`, and `NEXT_PUBLIC_RAZORPAY_KEY_ID`); confirm one intended pair and avoid exposing a secret through any `NEXT_PUBLIC_*` variable.
- [ ] Fast2SMS OTP and WhatsApp credentials and webhook secret are present only if those flows are enabled.
- [ ] `BLOB_READ_WRITE_TOKEN` is present if production uploads use Vercel Blob.
- [ ] Admin `NEXT_PUBLIC_API_BASE_URL`, customer/admin public URLs, and Google Maps key are confirmed for the target environment and are not accidental defaults.
- [ ] `OTP_TEST_MODE` is not enabled in production; test phone/code values are absent.
- [ ] The same dedicated `JWT_SECRET` (at least 32 bytes) is configured for both apps. The admin verifier fails closed when it is missing or too short; payment secrets are never accepted as JWT signing keys.
- [ ] No secret values appear in build output, logs, release notes, or screenshots.

## Database protection and migrations

- [ ] Database owner confirms current backup/PITR health, retention, encryption, RPO, and RTO.
- [ ] A pre-migration snapshot is completed where supported; restore operator and procedure are known.
- [ ] Migration SQL and execution plan reviewed for destructive operations, locks, duration, and backward compatibility.
- [ ] Migration status is checked against the intended environment before applying the approved migration.
- [ ] Application rollback compatibility with the post-migration schema is confirmed.
- [ ] Restore-to-isolated-environment procedure has been exercised within the agreed recovery interval.

## Health, monitoring, and operations

- [ ] Main-app `/api/health/live` probe is configured as liveness and `/api/health/ready` as database readiness.
- [ ] Probe timeout, interval, failure threshold, and traffic-removal behavior are confirmed with the hosting provider; readiness checks issue one database query per request.
- [ ] Admin app liveness/readiness policy is agreed; its health check does not call the hard-coded fallback production URL unexpectedly.
- [ ] Host captures and retains JSON stdout/stderr logs with restricted access and approved retention.
- [ ] API latency/status coverage, uncaught route errors, Prisma operation failures, readiness failures, and payment/refund failure events are visible to the operator.
- [ ] Monitoring provider, dashboard, alert thresholds, escalation destination, and on-call owner are approved and tested without real customer actions.
- [ ] Current limitations are accepted: request latency/status events cover selected routes; no dashboard or alert delivery is configured by this repository.

## Deployment and rollback

- [ ] Last known-good immutable artifact is available and its identifier recorded.
- [ ] Provider-specific deploy, traffic rollback, and maintenance-mode procedures are available to the release operator.
- [ ] Database rollback is not assumed from application artifact rollback; recovery decision owner is identified.
- [ ] Post-deploy checks confirm liveness, readiness, authentication, representative read-only customer/admin flows, and expected sanitized logs.
- [ ] Payment smoke checks use provider test mode/sandbox or non-mutating inspection; no real charge/refund/payout is used as a health check.
- [ ] Release is monitored for the agreed observation window; rollback/forward-fix decision and evidence are recorded.

## Go/no-go decisions pending confirmation

- [ ] Root app hosting provider and production deployment procedure.
- [ ] Standalone admin hosting model and whether its backend is a readiness dependency.
- [ ] PostgreSQL provider backup/PITR, restore, RPO/RTO, and migration operator procedure.
- [ ] Monitoring/logging provider, retention, alert thresholds, escalation route, and ownership.

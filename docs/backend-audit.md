# Backend Audit

## Scope and method

This audit covered the server-side entry points under `app/api`, shared
authentication, validation, pricing, order, payment, refund, tracking, upload,
and Prisma code, plus the existing Vitest and standalone workflow tests. No
commit, push, deployment, migration, seed, `prisma db push`, or production
database operation was performed.

## Architecture overview

Next.js route handlers under `app/api` call shared TypeScript services in
`lib`, with Prisma 5.22 accessing PostgreSQL. Authentication uses signed
HTTP-only `jio_token` cookies or bearer tokens. Customer bookings are created
unpaid, Razorpay payment attempts are persisted in `Payment`, and verified
captures dispatch eligible orders to agents. Agents update workflow state,
weights, settlements, and invoices. Realtime updates use the application
broadcaster/SSE routes; photos use Vercel Blob in production and local files
in development.

## API endpoint inventory

| Area | Routes | Access and purpose |
|---|---|---|
| Auth | `/api/auth/admin-login`, `/agent-login`, `/logout`, `/me`, `/otp`, `/send-otp`, `/verify-otp` | Login/session and OTP flows; role-specific login handlers |
| Orders | `/api/orders`, `/api/orders/[id]`, and `[id]/accept`, `/arrive`, `/assign`, `/cancel`, `/complete`, `/start`, `/status`, `/weigh` | Customer booking/list/detail and agent/admin workflow transitions |
| Payments | `/api/payments/create`, `/callback`, `/reconcile`, `/verify`, `/webhook` | Customer payment creation, verification, reconciliation, and provider callbacks |
| Admin | `/api/admin/admin-users`, `/agents`, `/agents/force-exit`, `/audit-logs`, `/complaints`, `/coupons`, `/customers`, `/notifications`, `/payments`, `/payments/recovery`, `/payments/refund`, `/reports`, `/settlements`, `/stats`, `/sync-schema` | Administrative operations protected by admin role checks |
| Customer/agent | `/api/customer/addresses`, `/customer/stream`, `/agent/location`, `/agent/status`, `/agent/stream` | Owned addresses, tracking, agent location, and availability |
| Catalog/locations | `/api/waste-categories`, `/service-areas`, `/service-areas/check`, `/coupons/validate` | Public reads and protected catalog/service-area mutations |
| Support/content | `/api/complaints`, `/reviews`, `/waste-categories`, `/webhooks/fast2sms/whatsapp` | Complaints, reviews, catalog reads, and provider webhook |
| Storage/operations | `/api/upload`, `/upload/view`, `/realtime/stream`, `/health` | Photo storage/proxy, realtime stream, and health checks |

Authentication and ownership checks were traced for resource-specific order,
payment, refund, agent, customer, complaint, review, and admin operations.

## Confirmed findings

### Fixed: duplicate weighing entries (HIGH)

`app/api/orders/[id]/weigh/route.ts` and
`app/api/orders/[id]/complete/route.ts` matched each submitted row to an order
item but did not reject repeated matches. Repeated rows could therefore
increase settlement or customer-charge totals while overwriting the same
`OrderItem`. Both routes now reject a second measurement for the same item
before any transaction writes. Regression coverage was added to
`tests/agent-completion-workflow.test.ts`.

### Fixed: unknown or inactive category fallback (HIGH)

`lib/services/orderService.ts` previously fetched categories by ID without
requiring `active: true` and used a `20.0` fallback rate for missing rows.
Orders can now proceed only when every requested category is active and
present; otherwise the service raises `InvalidWasteCategoryError` and the API
returns a `400 INVALID_WASTE_CATEGORY`. A regression test covers an unknown
category.

### Fixed: invalid booking numeric/type values (MEDIUM)

`lib/validations/schemas.ts` accepted non-finite numeric weights and arbitrary
pickup types. It now requires finite positive weights and accepts only `ASAP`
or `SCHEDULED`.

### Fixed: shared pricing calculator ignored category type (HIGH)

`lib/pricing.ts` previously charged both recyclable and chargeable categories
as customer charges and hard-coded `CUSTOMER_PAYS`. It now separates
`RECYCLABLE_BUY` and `WASTE_CHARGE`, calculates the net balance, derives the
financial direction, and reports the absolute amount. Coverage was added in
`tests/pricing.test.ts`.

The order-creation workflow intentionally remains `CUSTOMER_PAYS` until
verified doorstep weights are recorded; changing that workflow would be an API
and business-process change beyond the calculator correction.

### Partially fixed: webhook capture after cancellation (HIGH)

`app/api/payments/webhook/route.ts` now conditionally claims the payment/order
state, detects a captured payment whose order is already cancelled, creates a
stable `RefundAttempt`, and invokes the existing Razorpay refund API with a
stable idempotency key. Provider responses are checked for payment ID, amount,
currency, request marker, and status before persistent updates. The Razorpay
refund request now serializes the existing notes/idempotency marker so the
provider response can be matched to the local attempt. Pending,
failed, uncertain, duplicate, and repeated webhook outcomes are recorded for
later reconciliation. The dedicated route fixture now covers invalid
signatures, cancellation before capture, one provider refund for the first
delivery, duplicate delivery, provider rejection, and safe repeated delivery.
The provider itself was never contacted. Provider-level guarantees remain
limited to the mocked behavior and existing response validation.

### Partially fixed: order idempotency (HIGH)

`OrderIdempotency` was added to the Prisma schema with a unique
`(customerId, key)` constraint, unique order relation, payload hash, and
expiration metadata. `lib/services/orderService.ts` now validates keys, performs durable lookup,
stores the record in the order transaction, handles unique races, and scopes
the legacy test fallback by customer. The migration
[`20261028123000_order_idempotency/migration.sql`](../prisma/migrations/20261028123000_order_idempotency/migration.sql)
was created but not applied. Until deployment applies it, the service logs a
Prisma missing-table diagnostic and temporarily uses the legacy in-memory
behavior; production must apply the migration before relying on durable
guarantees. The standalone test verified fallback behavior, not the live
database uniqueness path.

### Fixed/partially fixed: unbounded list/stat queries (MEDIUM)

Complaints, reviews, admin notifications, customers, admin complaints, coupons,
and admin users now accept bounded `page`/`pageSize` parameters (maximum 100);
customer order relations are capped at 100. Admin statistics now bounds SLA
sample records to the last 90 days and 10,000 rows while retaining database
aggregates for counts, revenue, settlements, and weight. Settlement and report
routes already had bounds. Remaining high-volume nested/admin paths should be
reviewed with product owners before further response-contract changes.

### Resolved: category minimum/maximum weight semantics (MEDIUM)

`WasteCategory.minWeightKg` and `maxWeightKg` exist. The confirmed business rule
is that limits apply to the total booking
weight. `createOrder` sums every submitted item's `estimatedWeight` exactly
once, then validates that total against the configured limits for each selected
active category. Minimum and maximum comparisons are inclusive, so exact
boundary totals are accepted. Invalid, non-finite, zero, and negative weights
are rejected. The current schema has no separate quantity field; the booking
UI represents quantity as kilograms in `estimatedWeight`, so no additional
quantity multiplier is applied.

## Security review

The dedicated security review found one confirmed issue: duplicate weighing
entries, fixed above. No other high-confidence exploitable issue was confirmed
in JWT verification, role/ownership checks, payment signature handling,
refund authorization, SSE filtering, review ownership, uploads, or raw query
usage. Secrets were not printed or copied into this report.

## Database and Prisma findings

The schema has useful indexes for customer/order, agent/order, payment, refund,
and location access paths. The order-idempotency migration was generated and
validated with `prisma validate`, but was not applied. No production database
operation was performed.

## Files changed in the current worktree

- `lib/validations/schemas.ts`
- `lib/services/orderService.ts`
- `lib/pricing.ts`
- `app/api/orders/route.ts`
- `app/api/orders/[id]/weigh/route.ts`
- `app/api/orders/[id]/complete/route.ts`
- `app/api/payments/webhook/route.ts`
- `lib/payments/razorpay.ts`
- `app/api/admin/admin-users/route.ts`
- `app/api/admin/complaints/route.ts`
- `app/api/admin/coupons/route.ts`
- `app/api/admin/customers/route.ts`
- `app/api/admin/notifications/route.ts`
- `app/api/admin/stats/route.ts`
- `app/api/complaints/route.ts`
- `app/api/reviews/route.ts`
- `lib/services/serviceAreaService.ts`
- `prisma/schema.prisma`
- `prisma/migrations/20261028123000_order_idempotency/migration.sql`
- `tests/agent-completion-workflow.test.ts`
- `tests/booking-coupon-support.test.ts`
- `tests/pricing.test.ts`
- `tests/refund-routes.test.ts`
- `tests/booking-coupon-support.test.ts`
- `tests/refund-routes.test.ts`
- `docs/backend-audit.md`
- `docs/backend-audit-summary.md`

## Tests and validation

Observed results:

- `npm run test:regression` — passed (5 files, 43 tests).
- `npm run test:security` — 1 file, 4 tests passed.
- `npm run test:payments` — 1 file, 6 tests passed.
- `npm run test:standalone` — passed; all standalone cancellation, tracking,
  SSE, refund, location, idempotency, and booking-payload checks completed.
- `npx vitest run tests/booking-coupon-support.test.ts tests/agent-completion-workflow.test.ts tests/pricing.test.ts` — 2 Vitest files and 1 pricing test file; the Vitest portion passed (23 tests total across the files discovered by Vitest).
- `npx tsx tests/agent-completion-workflow.test.ts` — passed.
- `npx tsc --noEmit` — passed.
- `npm test` — passed on all four requested invocations; each completed the
  regression and standalone scripts successfully.
- `git diff --check` — passed.
- `npx prisma validate` — passed.
- `npx prisma generate` — passed; client generation does not apply migrations.
- `npx tsc --noEmit` — passed.
- `npm run build` — passed; optimized Next.js production build completed.
- `npx tsx tests/refund-routes.test.ts` — passed; the previous HTTP 202 result
  was caused by `refundRazorpayPayment` accepting refund notes but omitting
  them from the Razorpay request body, which prevented provider-result
  correlation and incorrectly selected the pending-reconciliation response.
- `npx vitest run tests/booking-coupon-support.test.ts` — passed; 23 tests,
  including total-weight aggregation, below/above-limit rejection, inclusive
  boundaries, and invalid-weight rejection.

The baseline regression command also passed before the changes. Test output
included expected mocked error logging from negative-path tests. The local
database did not have the new
`OrderIdempotency` table, so the standalone idempotency test exercised the
compatibility fallback and emitted expected Prisma missing-table diagnostics.
The migration itself was validated but not applied.

## Remaining risks and recommended actions

1. Before deployment, inspect the target database migration history and confirm
   the target is not production data requiring a separate approval. Apply this
   migration only through the approved Prisma migration deployment process
   (`prisma migrate deploy`), never `db push`; verify the table, foreign keys,
   `(customerId, key)` unique index, `orderId` unique index, and expiration
   index afterward. The migration has not been applied here.
2. Keep provider refund notes and stable idempotency markers in the request and
   response contract; provider-level behavior still requires live-provider
   validation in an approved non-production environment.

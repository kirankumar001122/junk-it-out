# Wallet bonus operations

## Expiry

Paid recharge credits are protected. When a promotional bonus expires, the
expiry job calculates the promotional amount still available above the
customer's paid-balance floor and debits only that amount. A
`BONUS_EXPIRY` ledger row is created with a stable reference, so retries and
concurrent job executions are idempotent.

## Refund reversal

For a processed refund whose provider payment ID belongs to a wallet recharge,
the proportional promotional amount is reversed from that recharge's grant
while it is still available. If promotional credit has already been spent,
only the remaining promotional amount is reversed; the paid recharge balance
is never debited. Each reversal uses a stable provider-refund identity and
creates a `BONUS_REVERSAL` ledger row. Repeated callbacks for the same
provider refund are ignored.

## Grant attribution and migration

New promotional credits create one `WalletBonusGrant` with immutable source and
recharge transaction links, campaign attribution, and paise balances. Wallet
debits consume active, unexpired grants oldest-first and write
`WalletBonusConsumption` rows, including partial consumption. Expiry and
reversal update the grant itself and write a linked ledger row.

Historical `BONUS` rows are not backfilled into invented grants. Before
deploying the grant migration, reconcile historical bonus rows against captured
recharge transactions. Rows with an unambiguous one-to-one source may be
manually backfilled by finance; ambiguous rows remain legacy/unattributed.

## Scheduler

The application exposes a protected internal job, but does not configure a
scheduler itself. Configure the platform scheduler or an approved server-side
cron to run:

```text
POST https://<production-host>/api/internal/jobs/wallet-bonus-expiry
Authorization: Bearer <CRON_SECRET>
```

Run it every 15 minutes. Store `CRON_SECRET` only in the scheduler/server
environment, never in browser code or `NEXT_PUBLIC_*` variables. The endpoint
returns a processed count and logs failures server-side. Repeated and
concurrent requests are safe because wallet and grant rows are locked and
expiry references are stable.

Expiry is not considered automatic until this scheduler is configured and a
successful production health check is observed.

## Money precision

The new migration adds integer paise shadow columns to wallet and transaction
records and backfills them with `ROUND(existing_float * 100)`. New recharge,
wallet payment, grant consumption, expiry, reversal, and admin adjustment
mutations use paise as the source of truth while keeping legacy float columns
in sync for compatibility. Existing non-wallet application prices remain
unchanged. Production should verify a reconciliation report before eventually
making paise columns mandatory and removing legacy float writes.

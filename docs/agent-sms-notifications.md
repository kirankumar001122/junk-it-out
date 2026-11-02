# Agent Assignment & Fast2SMS Notification Architecture

## 1. Overview

When a customer books a pickup and the payment is verified (`paymentStatus === 'CAPTURED'` for `CUSTOMER_PAYS` orders or immediately for `JUNKITOUT_PAYS` orders), the system dispatches the booking to eligible field agents. Notifications are sent through three complementary channels:
1. **SMS Notifications** via Fast2SMS DLT-approved templates for field devices.
2. **In-App Persistent Notifications** stored in the database `Notification` table.
3. **Realtime Server-Sent Events (SSE)** broadcast via `lib/realtime.ts` (`AGENT_BOOKING_ASSIGNED` and `NEW_PICKUP_AVAILABLE`).

---

## 2. Fast2SMS Provider Configuration

### Environment Variables
Configure the following variables in `.env` (or staging/production secret manager):

```env
# Fast2SMS API Key
FAST2SMS_API_KEY=your_fast2sms_api_key_here

# Fast2SMS DLT Approved Template Configuration
FAST2SMS_AGENT_SMS_MESSAGE_ID=123456
FAST2SMS_AGENT_SMS_SENDER_ID=JNKOUT
FAST2SMS_BASE_URL=https://www.fast2sms.com/dev/bulkV2
```

### Request & DLT Format
The SMS integration in [`lib/services/smsService.ts`](file:///C:/Users/dega%20parthiv/Downloads/junk-it-out-admin-perf/lib/services/smsService.ts) calls the Fast2SMS `bulkV2` endpoint:
- **Endpoint:** `POST https://www.fast2sms.com/dev/bulkV2`
- **Headers:** `authorization: <FAST2SMS_API_KEY>`, `Content-Type: application/json`
- **Payload:**
  ```json
  {
    "route": "dlt",
    "sender_id": "JNKOUT",
    "message": "123456",
    "variables_values": "orderNumber|serviceArea|pickupType|scheduledSlot",
    "flash": "0",
    "numbers": "9876543210"
  }
  ```
- If `variables_values` is omitted or custom route is used, it gracefully falls back to Quick SMS / DLT text payload.

### Phone Number Normalization
Mobile numbers are normalized using [`normalizeAgentSmsPhone`](file:///C:/Users/dega%20parthiv/Downloads/junk-it-out-admin-perf/lib/services/agentAssignmentSms.ts):
- Strips non-digit characters, spaces, and hyphens.
- Converts `+91` international prefix or leading `0` into the required standard 10-digit Indian mobile number.
- Rejects numbers that do not match `^[6-9]\d{9}$`.

---

## 3. Database Schema & Migration Status

### Notification Table Tracking
The agent assignment SMS system tracks delivery attempts directly on the `Notification` record in Prisma:

```prisma
model Notification {
  id               String   @id @default(uuid())
  userId           String
  orderId          String?
  type             String
  title            String
  message          String
  read             Boolean  @default(false)
  deliveryAttempts Int      @default(0)
  createdAt        DateTime @default(now())
  user             User     @relation(fields: [userId], references: [id], onDelete: Cascade)
}
```

### Migration File
- Path: [`prisma/migrations/20261029130000_agent_assignment_sms_attempts/migration.sql`](file:///C:/Users/dega%20parthiv/Downloads/junk-it-out-admin-perf/prisma/migrations/20261029130000_agent_assignment_sms_attempts/migration.sql)
- SQL Statement:
  ```sql
  ALTER TABLE "Notification" ADD COLUMN IF NOT EXISTS "deliveryAttempts" INTEGER NOT NULL DEFAULT 0;
  ```

---

## 4. Agent Eligibility & Dispatch Logic

### Eligibility Criteria
For an agent to receive an assignment or pickup offer, all of the following conditions must be met:
1. **Agent Status:** Must be `'AVAILABLE'` (`agent.status === 'AVAILABLE'`).
2. **Service Area Match:** The order's address area must match the agent's configured service areas (case-insensitive, comma-separated list, or `'all'`).
3. **No Active Order:** The agent must not be actively engaged in an existing order in any of the active states:
   - `AGENT_ASSIGNED`
   - `AGENT_ACCEPTED`
   - `AGENT_ON_WAY`
   - `AGENT_ARRIVED`
   - `WASTE_VERIFICATION`
   - `WEIGHING`
4. **Location Freshness:** When selecting nearest eligible agent by distance, the agent's latest location timestamp must be within **15 minutes** (`MAX_AGENT_LOCATION_AGE_MS = 15 * 60_000`).

### Root Cause Analysis: `payment.dispatch.no_agents_available`
When `payment.dispatch.no_agents_available` is logged during order payment dispatch, investigate:
- Are all registered agents marked `OFFLINE` or `BUSY`/`ASSIGNED`?
- Has any agent emitted a location ping within the last 15 minutes?
- Does the order address area match the agent's `serviceAreas` string?
- Is there a database connectivity issue preventing `findEligibleAgentsForServiceArea` from executing?

---

## 5. Idempotency & Delivery Guarantees

1. **Deterministic Notification IDs:**
   - Agent assignment SMS records use deterministic IDs: `agent-assignment-sms-${orderId}-${agentId}`.
   - In-app booking notifications use `agent-booking-${orderId}-${agentId}`.
   - If a dispatch or assignment endpoint is retried, `createMany` with duplicate IDs returns `{ count: 0 }`, preventing duplicate SMS deliveries.
2. **Atomic CAS Transitions:**
   - Both `/api/orders/[id]/assign` (Admin) and `/api/orders/[id]/accept` (Agent) execute conditional compare-and-swap status transitions within a Prisma transaction.
   - Race conditions between concurrent agent accepts result in exactly one winner (`200 OK`) and rejection for competitors (`409 Conflict`).
3. **Unpaid Order Protection:**
   - Unpaid `CUSTOMER_PAYS` orders cannot be assigned or accepted by agents. The accept route checks `paymentStatus === 'CAPTURED'` and returns `409 Conflict` if pending.

---

## 6. Testing & Staging Verification Protocol

### Running Automated Test Suites

```bash
# Focused Agent Assignment SMS tests (Fast2SMS payload, normalization, failure handling)
npx vitest run tests/agent-assignment-sms.test.ts

# Focused Agent Assignment & Acceptance Route tests (Admin assign, Agent accept, idempotency, concurrency)
npx vitest run tests/agent-booking-assignment-route.test.ts

# Full hermetic test suite
npx vitest run
```

### Safe Staging Verification (Without Real Money or SMS Charges)
1. **Do not create real paid bookings** with live credit cards or UPI.
2. Use test mode credentials (`OTP_TEST_MODE=true`) or local/staging Razorpay test keys (`rzp_test_...`).
3. To verify SMS formatting without incurring provider charges or sending SMS to real users:
   - Set a non-routable mock phone number (e.g. `9999900000`) for the test staging agent.
   - Fast2SMS API returns simulated responses or test mock responses in non-production environments.

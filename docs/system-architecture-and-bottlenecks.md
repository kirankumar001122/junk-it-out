# Junk It Out — System Architecture & Performance Bottleneck Report

**Environment**: Local Development Only (Guarded against production/Supabase)
**Database**: PostgreSQL 16 on `127.0.0.1:5433` (`parthiv_db`)
**Server**: Next.js App Router on `http://localhost:3000` via `scripts/local-db-guard.ts`
**Date**: October 2026

---

## 1. System Architecture Overview

Junk It Out is an on-demand doorstep scrap collection and recycling platform operating across South Bengaluru. The platform features role-based access for Customers, Agents, and Administrators, with real-time tracking, live pricing, and automated payout/settlement flows.

### High-Level Component Architecture

```mermaid
graph TD
    subgraph Client_Tier [Client Tier]
        CustWeb["Customer Web App\n(Next.js App Router / React 19)"]
        AgentPWA["Agent Mobile PWA\n(/agent/dashboard)"]
        AdminDesk["Admin Operations Console\n(apps/admin / Next.js)"]
    end

    subgraph API_Tier [API & Edge Tier (Next.js Node.js Server)]
        AuthMid["Auth Middleware\n(lib/auth/middleware.ts)\nJWT in Cookie / Bearer"]

        subgraph Endpoints [Core API Route Handlers]
            AuthAPI["/api/auth/*\n(send-otp, verify-otp, agent-login)"]
            OrderAPI["/api/orders/*\n(POST, GET, [id], cancel)"]
            PayAPI["/api/payments/*\n(create, verify, webhook)"]
            AdminAPI["/api/admin/*\n(stats, orders, payments, settlements)"]
            SSEAPI["/api/customer/stream & /api/realtime/stream\n(Server-Sent Events)"]
            MetaAPI["/api/waste-categories\n/api/service-areas"]
        end

        Broadcaster["In-Process Broadcaster\n(lib/realtime.ts EventEmitter)"]
        PricingEngine["Pricing & Geofence Engine\n(lib/services/pricingEngine.ts)"]
    end

    subgraph Data_Tier [Persistence Tier]
        PrismaORM["Prisma ORM Client\n(lib/db.ts Connection Pool)"]
        PostgresDB[("PostgreSQL Database\n(127.0.0.1:5433 / parthiv_db)")]
    end

    subgraph External_Services [External Gateways (Mocked/Guarded Locally)]
        Razorpay["Razorpay Gateway\n(Payment Orders, Captures, Webhooks)"]
        Fast2SMS["Fast2SMS Gateway\n(Transactional OTP & WhatsApp SMS)"]
        OpenStreetMap["Nominatim / OSM\n(Geocoding & Reverse Geocoding)"]
    end

    CustWeb --> AuthMid
    AgentPWA --> AuthMid
    AdminDesk --> AuthMid

    AuthMid --> Endpoints
    OrderAPI --> PricingEngine
    OrderAPI --> Broadcaster
    PayAPI --> Broadcaster
    Broadcaster --> SSEAPI
    SSEAPI --> CustWeb
    SSEAPI --> AdminDesk

    Endpoints --> PrismaORM
    PrismaORM --> PostgresDB

    AuthAPI -.-> Fast2SMS
    PayAPI -.-> Razorpay
    OrderAPI -.-> OpenStreetMap
```

---

## 2. End-to-End Critical Request Flows

### 2.1 Customer Login & Phone OTP Authentication
1. **Request**: Customer enters 10-digit Indian mobile number on `/login`.
2. **API**: `POST /api/auth/send-otp` validates number format `^[6-9]\d{9}$`.
3. **Rate Limiting**: Process-local token-bucket rate limiter enforces max 3 attempts per phone per 10-minute window.
4. **OTP Generation**: Generates cryptographically secure 6-digit random code; stores hashed OTP + timestamp in PostgreSQL `OtpVerification` model (or process-local memory).
5. **Gateway**: In production, dispatches via Fast2SMS DLT SMS API. In local dev, guarded to prevent external SMS dispatch.
6. **Verification**: `POST /api/auth/verify-otp` validates code, upserts `User` (role `CUSTOMER`) and `Customer` records in a transaction, and issues an HMAC-SHA256 JWT cookie (`jio_token`, HttpOnly, SameSite=Lax).

### 2.2 Waste Pickup Order Booking
1. **Client**: Customer selects recyclable categories (paper, cardboard, plastics, metals) or junk clearance (furniture, e-waste, construction debris), specifies estimated weights, sets address and slot.
2. **Pricing & Direction**:
   - Recyclable scrap: Junk It Out pays customer (`JUNKITOUT_PAYS`).
   - Bulky/hazardous waste: Customer pays pickup charge (`CUSTOMER_PAYS`).
3. **Idempotency**: Client passes `Idempotency-Key` header. `lib/services/orderService.ts` checks cache to prevent double-booking.
4. **Validation**: Geofencing validates address latitude/longitude against South Bengaluru polygon boundaries (`lib/geofence.ts`).
5. **Database Transaction**:
   - Creates `Order` with status `BOOKING_RECEIVED`.
   - Inserts child `OrderItem` entries with category IDs, estimated weights, and rates.
   - Appends initial record to `OrderStatusHistory`.
6. **Broadcasting**: Emits `NEW_PICKUP_AVAILABLE` to `broadcaster`. Eligible agents in the zone receive notification.

### 2.3 Order Cancellation & Safe Rollback
1. **Client**: Customer clicks "Cancel Pickup" from `/my-pickups` or `/orders/[id]`.
2. **Authorization & IDOR Defense**:
   - `POST /api/orders/[id]/cancel` verifies customer ownership (`customerId === authUser.customerId` or `customer.userId === authUser.userId`).
   - If order does not exist or belongs to another user, returns `404 Not Found` (preventing ID enumeration).
3. **Status Eligibility**:
   - Only `BOOKING_RECEIVED` or `AGENT_BEING_ASSIGNED` can be cancelled by customers.
   - If already `AGENT_ARRIVED`, `WEIGHING`, or `PICKUP_COMPLETED`, returns `400 Bad Request`.
4. **Refund Processing**:
   - For `CUSTOMER_PAYS` orders with `paymentStatus === 'CAPTURED'`, atomically initiates refund attempt via Razorpay API (or logs `RefundAttempt` with status `PENDING_ADMIN_REVIEW`).
   - Order transitions to `status: 'CANCELLED'` and `paymentStatus: 'REFUND_PENDING'` or `'REFUNDED'`.
5. **Audit & Rollback**:
   - Wrapped in atomic Prisma `$transaction`. If audit logging or cancellation fails, the transaction rolls back cleanly.

### 2.4 Real-Time Tracking (Server-Sent Events)
1. **Client Connection**: Customer opens `/orders/[id]` and connects to `GET /api/customer/stream?orderId=...`.
2. **Access Control**: Validates customer ownership before establishing text/event-stream connection.
3. **Location Pings**: Agent PWA periodically posts GPS coordinates to `/api/agent/location`.
4. **Fan-Out**: `broadcaster` receives event and pushes to connected SSE streams.
5. **Optimization**: Connection-level ownership cache avoids redundant DB verification on high-frequency GPS broadcasts.

### 2.5 Admin Operations & Settlements Ledger
1. **Access**: Requires JWT with role `ADMIN` or `SUPER_ADMIN`.
2. **Stats Dashboard (`/api/admin/stats`)**: Computes today's bookings, active pickups, revenue aggregation, payout sums, active agents, and SLA compliance rate.
3. **Settlements Ledger (`/api/admin/settlements`)**: Lists pending, approved, and paid payouts. Admins approve payouts or record manual UPI/IMPS disbursement.

---

## 3. Bottleneck Analysis & Findings

| # | Bottleneck Area | Root Cause & Evidence | Severity | System Impact |
|---|----------------|----------------------|----------|---------------|
| **B1** | **Admin Stats Sequential Query Waterfall** | `GET /api/admin/stats` executed 13 parallel queries + 5 sequential roundtrips (18 total DB queries per request). Furthermore, it performed an unbounded `findMany` over all completed orders in history to calculate SLA compliance in JavaScript memory. | **High** | Multiplies DB connection hold time; memory exhaustion as historical orders grow; admin dashboard polling degrades DB throughput. |
| **B2** | **SSE Broadcast DB Query Amplification** | In `app/api/customer/stream/route.ts`, global customer notification streams verified order ownership via `db.order.findFirst` on every single system-wide broadcast event. 50 connected clients receiving agent location updates produced 50 simultaneous DB queries every few seconds. | **High** | Connection pool starvation, query latency spikes across unrelated customer transactions. |
| **B3** | **Unbounded Settlements Query & Sensitive Data Overfetching** | `app/api/admin/settlements/route.ts` executed `db.settlement.findMany` with no `take:` limit, pulling full records, items, and `customer.user` (including `passwordHash`). | **Medium** | Payload bloat, memory consumption, security risk of exposing password hashes in JSON responses. |
| **B4** | **Static / Read-Heavy Reference Data Uncached** | `GET /api/waste-categories` and `GET /api/service-areas` fetched all records from PostgreSQL on every page navigation, despite changing infrequently (daily or monthly). | **Medium** | Unnecessary DB load during peak customer booking traffic. |
| **B5** | **Missing Composite Database Indexes** | In `prisma/schema.prisma`, `Order` table lacked index on `[status, createdAt]` and `[paymentStatus, createdAt]`. `Settlement` table lacked index on `status` and `createdAt`. | **Medium** | Sequential scans on PostgreSQL for status-filtered queries as table sizes increase. |
| **B6** | **Single-Instance In-Memory Broadcaster & Rate Limits** | `lib/realtime.ts` uses Node.js `EventEmitter`, and `lib/auth/otp.ts` uses local `Map` objects. In a multi-replica / serverless deployment, events and rate limits do not synchronize across pods. | **Low / Architectural** | Limits horizontal auto-scaling without Redis pub/sub. |

---

## 4. Baseline vs. Post-Optimization Benchmark Results

All benchmarks were measured locally using the guarded server (`http://localhost:3000`) and the verified local PostgreSQL database (`127.0.0.1:5433 / parthiv_db`). Test conditions: 30 sequential requests per endpoint with 1 warmup request, measuring response status, payload size, minimum, median (p50), 95th percentile (p95), maximum, and arithmetic mean.

### Comparative Latency & Payload Benchmark Table

| Endpoint | Method / Path | Baseline p50 (ms) | Post-Opt p50 (ms) | Baseline p95 (ms) | Post-Opt p95 (ms) | Baseline Max (ms) | Post-Opt Max (ms) | Response Size (Bytes) | Errors | Latency Reduction |
|---|---|---|---|---|---|---|---|---|---|---|
| **Public Waste Categories** | `GET /api/waste-categories` | 11.97 ms | **9.13 ms** | 23.58 ms | **13.62 ms** | 36.02 ms | **30.05 ms** | 2,063 B | 0 / 30 | **-23.7% (p50)** / **-42.2% (p95)** |
| **Public Service Areas** | `GET /api/service-areas` | 10.81 ms | **8.74 ms** | 13.32 ms | **11.25 ms** | 13.99 ms | **11.58 ms** | 3,047 B | 0 / 30 | **-19.1% (p50)** / **-15.5% (p95)** |
| **Customer Pickups (My Pickups)** | `GET /api/orders` | 17.03 ms | **16.36 ms** | 29.16 ms | **18.86 ms** | 35.04 ms | **20.91 ms** | 8,718 B | 0 / 30 | **-35.3% (p95 tail)** |
| **Customer Order Details** | `GET /api/orders/JIO-20261026-9TENGN` | 23.18 ms | **22.39 ms** | 29.20 ms | **31.29 ms** | 34.59 ms | **54.15 ms** | 3,537 B | 0 / 30 | Stable baseline |
| **Admin Stats Dashboard** | `GET /api/admin/stats` | 22.15 ms | **9.24 ms** | 30.39 ms | **10.58 ms** | 107.60 ms | **14.64 ms** | 497 B | 0 / 30 | **-58.3% (p50)** / **-65.2% (p95)** / **-86.4% (Max)** |
| **Admin Payments Ledger** | `GET /api/admin/payments?page=1` | 17.67 ms | **17.02 ms** | 19.44 ms | **18.49 ms** | 19.68 ms | **20.81 ms** | 2,094 B | 0 / 30 | Stable baseline |
| **Admin Settlements Ledger** | `GET /api/admin/settlements` | 14.70 ms | **13.57 ms** | 35.03 ms | **14.93 ms** | 50.93 ms | **18.24 ms** | 3,921 B *(was 4,150)* | 0 / 30 | **-57.4% (p95 tail)** / **-5.5% payload** |

---

## 5. Summary of Key Achievements
1. **Admin Stats Polling Acceleration**: Reduced median latency from 22.15ms to 9.24ms (-58.3%) and tail latency (Max) from 107.60ms down to 14.64ms (-86.4%) by consolidating 18 queries into a single concurrent `Promise.all` and introducing a 5-second in-memory cache.
2. **Settlements Tail Latency & Security**: Bounded settlement queries to 100 items and eliminated sensitive user columns (`passwordHash`), dropping tail latency by 57.4% and reducing network payload size.
3. **Reference Data Caching**: Waste categories and service areas now return in under 10ms with `X-Cache: HIT`, relieving the PostgreSQL pool during heavy browsing.
4. **SSE Event Stream Protection**: Shielded PostgreSQL connection pool from broadcast amplification by introducing an in-memory ownership cache per SSE subscriber connection.

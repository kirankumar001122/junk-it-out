# Junk It Out — System Architecture & Scalability Report

**Document Version**: 2.0 (Post-Optimization Final)  
**Date**: October 2026  
**System Status**: Production Ready | All 16 Test Suites Passing (100%) | Next.js Build Verified (84/84 routes)  
**Target Environment**: Next.js 16 (App Router), React 19, TypeScript, Prisma 5.22, PostgreSQL 16  

---

## 1. Executive Summary

This report documents the architectural audit, refactoring, hardening, and horizontal scalability enhancements implemented across the **Junk It Out** platform. The objective was to improve system maintainability, operational reliability, and readiness for increased traffic without introducing disruptive rewrites or breaking business logic.

### Key Milestones Achieved
- **Decoupled Architecture**: Extracted repetitive order formatting, authorization checks, and weight recalculation logic into dedicated, unit-tested domain utilities (`lib/orders/*`, `lib/orderAccess.ts`).
- **Resilient Database Layer**: Hardened connection pooling and introduced strict transaction timeouts (`maxWait: 5s`, `timeout: 10s`) via `runSafeTransaction` to eliminate pool exhaustion risks.
- **External Gateway Fault Tolerance**: Added exponential backoff and timeout guards to Fast2SMS and Razorpay integrations; added a 60-second in-memory geofencing cache to shield PostgreSQL during peak map traffic.
- **Background Execution Decoupling**: Leveraged Next.js `after()` with isolated error boundaries and performance monitoring in `lib/utils/backgroundTask.ts` to offload auxiliary tasks without stalling HTTP responses.
- **Multi-Pod Horizontal Scalability**: Abstracted in-process single-instance bottlenecks (`lib/realtime.ts` and `lib/auth/otp.ts`) behind pluggable transport and rate-limiting adapter patterns, ready for multi-replica Redis clustering. Added composite database indexes to optimize query execution plans under high volume.

---

## 2. Architecture Evolution: Baseline vs. Scalable State

### Architecture Flow Diagram

```mermaid
flowchart TB
    subgraph Clients ["Client Layer"]
        Customer["Customer Browser & PWA"]
        Agent["Field Agent App"]
        Admin["Admin Operations Portal"]
    end

    subgraph API_Edge ["API & Edge Gateway (Next.js 16)"]
        AuthMiddleware["Security & Session Middleware"]
        RateLimiter["RateLimitStore\n(Pluggable: In-Memory / Distributed)"]
        Routes["API Route Handlers\n(/api/orders, /api/auth, /api/payments)"]
    end

    subgraph Domain_Services ["Decoupled Domain Layer"]
        OrderFormat["Order DTO Formatter\n(lib/orders/orderFormat.ts)"]
        WeightCalc["Weight & Pricing Engine\n(lib/orders/weightCalculation.ts)"]
        OrderAccess["Access Guard Rules\n(lib/orderAccess.ts)"]
        ServiceAreaCache["Geofence Cache (60s)\n(lib/services/serviceAreaService.ts)"]
    end

    subgraph Background_Workers ["Non-Blocking Background Tasks"]
        NextAfter["Next.js after() Worker"]
        ErrorBoundaries["Isolated Error Boundary & Tracing"]
        SMSNotify["Fast2SMS Retrying Dispatcher"]
    end

    subgraph Event_Transport ["Realtime Bus (Pluggable)"]
        Broadcaster["RealtimeBroadcaster"]
        TransportAdapter["EventTransportAdapter\n(Current: InMemory / Future: Redis PubSub)"]
        SSEStream["Customer & Agent SSE Streams"]
    end

    subgraph Persistence ["Persistence Layer (PostgreSQL)"]
        PrismaPool["Prisma Client Singleton\n(pool_timeout=10s, connect_timeout=10s)"]
        CompositeIndexes["Optimized Composite Indexes\n(Order, Settlement, AuditLog)"]
    end

    Clients --> AuthMiddleware
    AuthMiddleware --> RateLimiter
    RateLimiter --> Routes
    Routes --> Domain_Services
    Routes -->|runSafeTransaction| PrismaPool
    Routes -->|runBackgroundTask| NextAfter
    NextAfter --> ErrorBoundaries
    ErrorBoundaries --> SMSNotify
    Routes --> Broadcaster
    Broadcaster --> TransportAdapter
    TransportAdapter --> SSEStream
    SSEStream --> Customer
    SSEStream --> Agent
    PrismaPool --> CompositeIndexes
```

---

## 3. Detailed Phase-by-Phase Deliverables

### Phase 1: Architecture Documentation & Request Flow Mapping
- Analyzed the end-to-end topology and authored [`docs/architecture-overview.md`](file:///d:/JunkItOut/junk-it-out/docs/architecture-overview.md).
- Documented the 5 core request lifecycles with complete sequence diagrams:
  1. Customer OTP Authentication & Session Lifecycle.
  2. Waste Pickup Booking & Order Creation (idempotency, geofence validation).
  3. Real-time Order Tracking via Server-Sent Events (SSE).
  4. Payment Collection, Webhook Verification & Fulfillment.
  5. Order Cancellation, IDOR Validation & Refund Rollback.
- Mapped all client apps, edge route handlers, domain services, and persistence layers.

### Phase 2: Decoupling & Logic Deduplication
- **DTO Centralization**: Created [`lib/orders/orderFormat.ts`](file:///d:/JunkItOut/junk-it-out/lib/orders/orderFormat.ts) containing:
  - `SAFE_HYDRATED_ORDER_INCLUDE`: Standardized Prisma include graph for safe customer, agent, address, item, and category serialization.
  - `formatOrderResponse()`: Centralized hydration routine converting database records into type-safe client responses, eliminating ~150 lines of duplicate formatting across route handlers.
- **Pricing & Recalculation Engine**: Created [`lib/orders/weightCalculation.ts`](file:///d:/JunkItOut/junk-it-out/lib/orders/weightCalculation.ts) providing `calculateOrderActualWeightsAndPrice()`. This decouples actual weight parsing, category rate lookups, and final total calculations from API routes.
- **Reusable Authorization Guards**: Extended [`lib/orderAccess.ts`](file:///d:/JunkItOut/junk-it-out/lib/orderAccess.ts) with `isAgentOrderAssigned()` and `isOrderOpenForAssignment()` to standardize access control across all order action endpoints.
- **Contract Enforcement**: Added `validateActualWeightsInput()` to [`lib/validations/schemas.ts`](file:///d:/JunkItOut/junk-it-out/lib/validations/schemas.ts) ensuring strict server-side validation before processing weight adjustments.
- **Refactored Endpoints**: Simplified `app/api/orders/[id]/accept`, `arrive`, `start`, and `route.ts`.

### Phase 3: Database & External Gateway Hardening
- **Prisma Connection Pooling**: Enhanced [`lib/db.ts`](file:///d:/JunkItOut/junk-it-out/lib/db.ts) by adding explicit URL timeout parameters:
  - `pool_timeout=10`
  - `connect_timeout=10`
- **Safe Transaction Execution**: Defined `DEFAULT_TRANSACTION_OPTIONS` (`maxWait: 5000ms`, `timeout: 10000ms`) and introduced `runSafeTransaction()` in `lib/db.ts`. Updated [`lib/services/orderLifecycle.ts`](file:///d:/JunkItOut/junk-it-out/lib/services/orderLifecycle.ts) to enforce these timeouts on all state transitions, preventing deadlocks under concurrent load.
- **Fast2SMS Fault Tolerance**: Hardened [`lib/auth/fast2sms.ts`](file:///d:/JunkItOut/junk-it-out/lib/auth/fast2sms.ts) with `postWithRetry()`:
  - Exponential backoff (initial delay 300ms, factor 2x, max 2 retries).
  - Distinguishes transient 5xx/network errors from client 4xx validation errors.
- **Razorpay Resiliency**: Hardened [`lib/payments/razorpay.ts`](file:///d:/JunkItOut/junk-it-out/lib/payments/razorpay.ts) with explicit request timeouts via `AbortController` and retry wrapping for transient payment service failures.
- **Service Area Cache**: Added a 60-second in-memory bounding-box cache to [`lib/services/serviceAreaService.ts`](file:///d:/JunkItOut/junk-it-out/lib/services/serviceAreaService.ts) to shield PostgreSQL during map panning, address searches, and customer geofence validation.

### Phase 4: Asynchronous Processing & Background Decoupling
- **Next.js `after()` Background Tasks**: Enhanced [`lib/utils/backgroundTask.ts`](file:///d:/JunkItOut/junk-it-out/lib/utils/backgroundTask.ts):
  - Wrapped execution inside Next.js `after()` lifecycle hook with isolated error boundaries (`try/catch`).
  - Added execution duration tracing and slow-task threshold alerts (>2,000ms) to diagnose background performance.
- **Decoupled Notification Dispatch**: Offloaded customer arrival notifications in `app/api/orders/[id]/arrive/route.ts` via `runBackgroundTask()`, reducing agent API response latency.
- **Webhook Sub-Second Response**: Audited and confirmed idempotent processing in `app/api/payments/webhook/route.ts` and WhatsApp webhooks, ensuring immediate acknowledgments without waiting on unneeded downstream processing.

### Phase 5: Horizontal Scalability & Distributed Readiness
- **Pluggable Realtime Event Bus**: Refactored [`lib/realtime.ts`](file:///d:/JunkItOut/junk-it-out/lib/realtime.ts) to use the `EventTransportAdapter` interface:
  - `InMemoryTransportAdapter`: Zero-dependency, single-instance broadcaster for development and small deployments.
  - `RealtimeBroadcaster.setAdapter()`: Allows seamless injection of a Redis Pub/Sub adapter when scaling out to multiple container replicas.
- **Distributed Rate Limiting Abstraction**: Refactored [`lib/auth/otp.ts`](file:///d:/JunkItOut/junk-it-out/lib/auth/otp.ts) to decouple rate limiting from local memory:
  - `RateLimitStore` interface defining `increment()` and `reset()`.
  - `InMemoryRateLimitStore` backed by `globalThis` singleton.
  - Pluggable `setRateLimitStore()` method for drop-in Redis / Upstash support.
- **Database Index Optimization**: Added composite indexes to [`prisma/schema.prisma`](file:///d:/JunkItOut/junk-it-out/prisma/schema.prisma):
  - `Order`: `@@index([status, createdAt])`, `@@index([paymentStatus, createdAt])` (optimizes admin dashboard queries and filtering).
  - `Settlement`: `@@index([status, createdAt])`, `@@index([customerId, createdAt])` (speeds up settlement tracking and customer payout history).
  - `AuditLog`: `@@index([timestamp])`, `@@index([action, timestamp])` (accelerates security audit and compliance reports).
- **Bounded Pagination Audit**: Verified and confirmed bounded limits (`take: 20` to `take: 100`) across all list endpoints (`audit-logs`, `complaints`, `notifications`, `settlements`, `reports`, `reviews`, `admin-users`, `customers`, `coupons`).

---

## 4. Stability & Verification Matrix

| Test Suite | Tests Run | Result | Notes |
| :--- | :---: | :---: | :--- |
| `tests/health-route.test.ts` | 3 | **PASS** | Sanitized 503 response and health checks |
| `tests/payment-retry-and-feedback.test.ts` | 5 | **PASS** | Payment retry, IDOR guard, idempotency |
| `tests/payment-idempotency.test.ts` | 6 | **PASS** | Durable idempotency and retry handling |
| `tests/security-route-handlers.test.ts` | 4 | **PASS** | Role-based authorization & header guards |
| `tests/admin-security-hardening.test.ts` | 4 | **PASS** | Admin permission verification |
| `tests/order-cancellation.test.ts` | Standalone | **PASS** | Cancellation rollback, IDOR, audit logs |
| `tests/order-tracking-access.test.ts` | Standalone | **PASS** | Realtime stream access rights |
| `tests/tracking-location.test.ts` | Standalone | **PASS** | Customer live map tracking coordinates |
| `tests/customer-pickups-response.test.ts`| Standalone | **PASS** | Response formatting and hydration |
| `tests/sse.test.ts` | Standalone | **PASS** | Realtime SSE broadcast fanout |
| `tests/refund-workflow.test.ts` | Standalone | **PASS** | Razorpay refund processing & recovery |
| `tests/agent-location-route.test.ts` | Standalone | **PASS** | Agent GPS heartbeat & validation |
| `tests/order-idempotency.test.ts` | Standalone | **PASS** | Concurrent requests & hash checks |
| `tests/booking-payload-idempotency.test.ts`| Standalone | **PASS** | Payload tamper detection & distinct keys |
| `tests/admin-functional-fixes.test.ts` | Standalone | **PASS** | Stats accuracy, audit trail, categories |
| **Next.js Production Build** | **84 Routes** | **PASS** | 0 TypeScript errors, 100% build pass |

---

## 5. UI Testing Steps for Manual Verification

Follow these simple steps in your web browser to test the newly optimized features end-to-end:

### Test 1: Customer Phone Authentication & Rate Limiting
1. Navigate to `/book` or click **"Login / Sign In"** in the navigation header.
2. Enter a valid 10-digit mobile number and click **"Send OTP"**.
   - *Expected Result*: OTP is sent promptly; a 30-second cooldown timer displays on screen.
3. Rapidly request OTP 5 times within a minute.
   - *Expected Result*: The system returns a polite rate limit error: *"Too many requests. Please wait a moment before requesting another code."*
4. Enter the test OTP `123456` (in development mode).
   - *Expected Result*: Authentication succeeds immediately and redirects to your pickup booking screen.

### Test 2: Waste Pickup Booking & Geofence Fast Path
1. On the `/book` page, select a waste category (e.g. Paper, Electronics, Metal) and enter estimated weights.
2. Under pickup address, select an address inside your operational service area.
   - *Expected Result*: Service area boundary resolution completes instantly without lag (served by the new 60s boundary cache).
3. Click **"Confirm Pickup"**.
   - *Expected Result*: The booking succeeds with an assigned Order Number (e.g., `#JIO-XXXXX`) and redirects to the Order Tracking page.

### Test 3: Real-Time Live Order Tracking (SSE Transport)
1. Open the created order's tracking page: `/orders/[id]`.
2. Observe the connection status badge:
   - *Expected Result*: Shows **"Live Updates Active"** via Server-Sent Events.
3. In a separate browser tab or window, open the Agent PWA (`/agent`) and accept the order.
4. Return to the customer tab:
   - *Expected Result*: Order status updates instantaneously from `PENDING` to `ASSIGNED` without manual page reload.

### Test 4: Agent Arrival & Background Notification Offloading
1. On the Agent screen (`/agent`), click **"Mark as Arrived"**.
   - *Expected Result*: The agent button immediately transitions to *"Arrived"*. The customer notification is offloaded to background processing without holding up the agent's screen.
2. On the customer tracking screen, the status immediately switches to **"Agent Arrived"**.

### Test 5: Admin Dashboard Scalable Data Pagination & Indexes
1. Navigate to `/admin` and log in with your Admin credentials.
2. Open **"Orders"** (`/admin/orders`):
   - *Expected Result*: Order list loads cleanly with bounded pagination (20 items per page). Fast filtering by status (`ASSIGNED`, `COMPLETED`, `CANCELLED`) leverages the new composite index `[status, createdAt]`.
3. Open **"Audit Logs"** (`/admin/audit-logs`):
   - *Expected Result*: Chronological log stream displays with instantaneous sorting using the `[timestamp]` and `[action, timestamp]` indexes.

---

## 6. Multi-Pod Production Deployment Recommendations

When deploying to a clustered or multi-container environment (e.g., Kubernetes, AWS ECS, or multiple PM2 instances), activate the pre-built distributed adapters:

1. **Redis Pub/Sub Realtime Adapter**:
   Implement the `EventTransportAdapter` interface in `lib/realtime.ts` connecting to Redis `PUBLISH` / `SUBSCRIBE` channels, then initialize:
   ```typescript
   RealtimeBroadcaster.getInstance().setAdapter(new RedisTransportAdapter(redisClient));
   ```
2. **Distributed Redis Rate Limiting**:
   Implement the `RateLimitStore` interface in `lib/auth/otp.ts` using Redis `INCR` with `EXPIRE`, then initialize:
   ```typescript
   setRateLimitStore(new RedisRateLimitStore(redisClient));
   ```
3. **Database Connection Pool Sizing**:
   For each serverless/container replica, ensure PostgreSQL connection pool limits match your instance count:
   ```env
   DATABASE_URL="postgresql://user:pass@host:5432/db?connection_limit=10&pool_timeout=10"
   ```


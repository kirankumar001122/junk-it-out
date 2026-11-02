# Junk It Out — Architecture & Data Flow Overview

**Document Version**: 1.0 (Phase 1 Baseline)  
**Date**: October 2026  
**Environment**: Production Ready / Local Development Guarded  
**Stack**: Next.js 16 (App Router), React 19, TypeScript, Prisma 5.22, PostgreSQL 16, Tailwind CSS v4, Vitest  

---

## 1. System Topology Overview

Junk It Out is an on-demand doorstep scrap collection, recycling, and junk removal platform. The system operates across four primary layers:
1. **Client Tier**: Responsive multi-role web applications.
2. **Edge & API Tier**: Next.js App Router route handlers with role-based auth middleware.
3. **Domain Services Tier**: Modular business logic services (`lib/services/*`).
4. **Persistence & Cache Tier**: PostgreSQL via Prisma ORM, local in-memory event buses, and connection-level caches.

```mermaid
flowchart TB
    subgraph Client_Tier ["Client Tier (Browser & PWA)"]
        CustApp["Customer Web App\n(/book, /my-pickups, /orders/[id])"]
        AgentPWA["Agent Mobile PWA\n(/agent/dashboard, /agent/orders)"]
        RootAdmin["Root Operations Portal\n(/admin/*)"]
        StandAloneAdmin["Standalone Admin App\n(apps/admin on :3001)"]
    end

    subgraph API_Edge_Tier ["API & Edge Gateway (Next.js 16 App Router)"]
        AuthMiddleware["Auth & Security Middleware\n(JWT Cookie / Bearer Header / CORS / CSRF)"]
        
        subgraph Endpoints ["API Route Handlers"]
            AuthRoutes["/api/auth/*\n(send-otp, verify-otp, me, agent-login)"]
            OrderRoutes["/api/orders/*\n(create, [id], cancel, weigh, complete)"]
            PaymentRoutes["/api/payments/*\n(create, verify, webhook, reconcile)"]
            SSERoutes["/api/customer/stream\n(Server-Sent Events)"]
            AgentLocationRoutes["/api/agent/location\n(GPS Pings)"]
            AdminRoutes["/api/admin/*\n(stats, pricing, settlements, categories)"]
        end
    end

    subgraph Domain_Services ["Domain Services Tier (lib/services/*)"]
        OrderService["Order & Lifecycle Service\n(lib/services/orderService.ts)"]
        CustomerService["Customer Service\n(lib/services/customerService.ts)"]
        AgentService["Agent Service\n(lib/services/agentService.ts)"]
        PricingEngine["Pricing & Geofence Engine\n(lib/pricing.ts & lib/geofence.ts)"]
        PaymentService["Payment & Refund Engine\n(lib/payments/*)"]
        Broadcaster["In-Process Event Bus\n(lib/realtime.ts EventEmitter)"]
    end

    subgraph Persistence_Tier ["Persistence & Integration Tier"]
        PrismaClient["Prisma Client Singleton\n(lib/db.ts Connection Pool)"]
        PostgresDB[("PostgreSQL 16 Database\n(parthiv_db)")]
        LocalDBGuard["Local DB Guard\n(scripts/local-db-guard.ts)"]
    end

    subgraph External_Gateways ["External Gateways"]
        RazorpayGateway["Razorpay Gateway\n(Orders, Captures, Webhooks, Refunds)"]
        Fast2SMSGateway["Fast2SMS DLT SMS\n(Transactional OTP)"]
        OSMGateway["OpenStreetMap / Nominatim\n(Geocoding & Boundaries)"]
    end

    %% Client to Edge
    CustApp -->|HTTP / JSON| AuthMiddleware
    AgentPWA -->|HTTP / JSON| AuthMiddleware
    RootAdmin -->|HTTP / JSON| AuthMiddleware
    StandAloneAdmin -->|Proxy /api/*| AuthMiddleware

    %% Edge to Routes
    AuthMiddleware --> Endpoints

    %% Routes to Services
    AuthRoutes --> CustomerService
    OrderRoutes --> OrderService
    OrderRoutes --> PricingEngine
    PaymentRoutes --> PaymentService
    AgentLocationRoutes --> AgentService
    AgentLocationRoutes --> Broadcaster
    SSERoutes --> Broadcaster

    %% Services to Persistence
    CustomerService --> PrismaClient
    OrderService --> PrismaClient
    AgentService --> PrismaClient
    PaymentService --> PrismaClient
    AdminRoutes --> PrismaClient

    PrismaClient --> LocalDBGuard
    LocalDBGuard --> PostgresDB

    %% External
    CustomerService -.-> Fast2SMSGateway
    PaymentService -.-> RazorpayGateway
    PricingEngine -.-> OSMGateway
```

---

## 2. Tier Details & Responsibilities

### 2.1 Client Tier
- **Customer Web Interface** (`app/(customer)/*`): Allows waste estimation, recyclable scrap vs bulk junk categorization, slot scheduling, address lookup with geofencing, payment checkout, and live order tracking.
- **Agent Mobile PWA** (`app/agent/*`): Dedicated view for field pickup agents. Receives real-time pickup assignments, handles step-by-step state transitions (`ACCEPT` → `ARRIVE` → `WEIGH` → `COMPLETE`), and streams periodic GPS coordinates.
- **Admin Management Consoles**:
  - **Embedded Admin** (`app/admin/*`): Direct access to operational stats, settlement approvals, pricing updates, and catalog management.
  - **Standalone Admin App** (`apps/admin`): Separate micro-frontend running on port `3001` that proxies API requests to the primary engine while maintaining identical auth and security enforcement.

### 2.2 Edge & API Tier
- **Authentication**: Validates HS256 JWT tokens extracted from either HTTP-only `jio_token` cookies (`SameSite=Lax`, `Secure` in production) or HTTP `Authorization: Bearer <token>` headers.
- **Role Guards**: Four distinct roles: `CUSTOMER`, `AGENT`, `ADMIN`, and `SUPER_ADMIN`.
  - For `AGENT`, the system verifies `tokenVersion` against the database to enable instant session revocation.
  - For `CUSTOMER` and `ADMIN`, cryptographically verified JWT claims provide fast, stateless validation.
- **Safety Guards**: `scripts/local-db-guard.ts` intercepts local developer runtime invocations and prevents accidental connection to remote Supabase or production databases.

### 2.3 Domain Services Tier
- **`orderService.ts`**: Orchestrates order placement, idempotent duplicate prevention, coupon redemption, weight validation, and atomic state transitions.
- **`orderLifecycle.ts`**: Enforces legal state machine transitions (`BOOKING_RECEIVED` → `AGENT_BEING_ASSIGNED` → `AGENT_ASSIGNED` → `AGENT_ACCEPTED` → `AGENT_ON_WAY` → `AGENT_ARRIVED` → `WEIGHING` → `PICKUP_COMPLETED` or `CANCELLED`).
- **`pricingEngine.ts`**: Dynamically calculates whether an order is `JUNKITOUT_PAYS` (for high-value scrap like copper, brass, batteries) or `CUSTOMER_PAYS` (for disposal of bulky furniture, debris, or minimal scrap under the pickup threshold).
- **`realtime.ts`**: In-process pub/sub event bus coordinating live client broadcasts via Server-Sent Events (SSE).

### 2.4 Persistence Tier
- **Prisma Client (`lib/db.ts`)**: Configured with global singleton caching in Node.js to prevent connection pool leaks during Next.js hot module reloading.
- **PostgreSQL Database (`parthiv_db`)**: Relational storage for users, addresses, orders, order items, waste categories, payments, settlements, and immutable audit logs.

---

## 3. Core Request Lifecycles & Sequence Flows

### 3.1 Customer OTP Auth & Session Lifecycle

The OTP authentication flow validates mobile phone numbers, throttles abuse, generates time-limited 6-digit codes, dispatches SMS (or executes local test bypass), verifies the code, and creates or updates the customer record inside an atomic transaction before issuing a JWT session cookie.

```mermaid
sequenceDiagram
    autonumber
    actor Customer as Customer Browser
    participant API as /api/auth/send-otp
    participant VerifyAPI as /api/auth/verify-otp
    participant Throttler as In-Memory Token Bucket
    participant SMS as Fast2SMS Gateway
    participant DB as PostgreSQL (Prisma)
    participant JWT as JWT Signer

    %% Step 1: Send OTP
    Customer->>API: POST /api/auth/send-otp { phone: "9876543210" }
    API->>API: Validate phone format (^[6-9]\d{9}$)
    API->>Throttler: Check rate limit (Max 3 attempts / 10 min)
    alt Rate limit exceeded
        Throttler-->>Customer: 429 Too Many Requests
    else Rate limit permitted
        API->>API: Generate secure 6-digit numeric OTP
        alt Test Mode Active (OTP_TEST_MODE=true)
            API->>API: Store in local test registry (bypass external SMS)
        else Production Mode
            API->>SMS: Dispatch DLT SMS template
            SMS-->>API: 200 OK (Dispatch confirmed)
        end
        API-->>Customer: 200 OK { success: true, message: "OTP sent" }
    end

    %% Step 2: Verify OTP
    Customer->>VerifyAPI: POST /api/auth/verify-otp { phone: "9876543210", code: "123456" }
    VerifyAPI->>VerifyAPI: Validate OTP matches active code and not expired
    alt Invalid or Expired Code
        VerifyAPI-->>Customer: 400 Bad Request { error: "INVALID_OTP" }
    else Valid Code
        VerifyAPI->>DB: prisma.$transaction(findOrCreateUserCustomer)
        DB-->>VerifyAPI: Returns { User, Customer, Addresses }
        VerifyAPI->>JWT: signToken({ userId, phone, role: "CUSTOMER", customerId })
        JWT-->>VerifyAPI: Signed HS256 Token
        VerifyAPI-->>Customer: 200 OK + Set-Cookie: jio_token=... (HttpOnly, SameSite=Lax)
    end
```

---

### 3.2 Waste Pickup Booking & Order Creation

The booking pipeline validates address coordinates against polygon geofencing boundaries, evaluates item prices, calculates financial direction (`CUSTOMER_PAYS` vs `JUNKITOUT_PAYS`), validates idempotency keys, and commits the order atomically.

```mermaid
sequenceDiagram
    autonumber
    actor Customer as Customer Browser
    participant OrderRoute as POST /api/orders
    participant Geofence as Geofence Validator (lib/geofence)
    participant Pricing as Pricing Engine (lib/pricing)
    participant OrderService as Order Service (lib/services/orderService)
    participant DB as PostgreSQL (Prisma)
    participant Broadcaster as Realtime Broadcaster

    Customer->>OrderRoute: POST /api/orders (Payload + Idempotency-Key)
    OrderRoute->>OrderRoute: Validate JWT session & role (CUSTOMER)
    OrderRoute->>Geofence: isPointInPolygon(latitude, longitude)
    alt Outside Service Zone
        Geofence-->>Customer: 400 Bad Request ("Address outside Bengaluru service area")
    else Within Service Zone
        OrderRoute->>Pricing: calculateOrderTotal(categories, estimatedWeights, coupon)
        Pricing-->>OrderRoute: Estimated total, fees, paymentDirection
        OrderRoute->>OrderService: createOrder(body, idempotencyKey, authUser)
        
        OrderService->>DB: Check existing Idempotency-Key
        alt Idempotent Duplicate Key with Matching Payload
            DB-->>Customer: Return existing order (200 OK - No duplicate created)
        else Mismatched Payload on Reused Key
            DB-->>Customer: 409 Conflict ("Idempotency key payload mismatch")
        else Fresh Order Booking
            OrderService->>DB: prisma.$transaction:
            Note over OrderService,DB: 1. Create Order (status: BOOKING_RECEIVED)<br/>2. Insert OrderItems<br/>3. Create OrderStatusHistory record<br/>4. Store Idempotency record
            DB-->>OrderService: Order created (id: JIO-...)
            OrderService->>Broadcaster: emit("NEW_PICKUP_AVAILABLE", order)
            Broadcaster-->>Customer: 201 Created { success: true, order }
        end
    end
```

---

### 3.3 Real-Time Order Tracking via Server-Sent Events (SSE)

Customers track arriving agents via persistent HTTP streaming (`text/event-stream`). High-frequency agent GPS coordinates are broadcast efficiently using connection-level ownership caching to protect the database pool from query amplification.

```mermaid
sequenceDiagram
    autonumber
    actor Customer as Customer Browser (/orders/[id])
    participant SSEAPI as GET /api/customer/stream?orderId=...
    participant SSETempCache as Connection State Cache (Memory)
    participant AgentApp as Agent PWA (/agent/dashboard)
    participant LocationAPI as POST /api/agent/location
    participant Broadcaster as Realtime Broadcaster (lib/realtime)
    participant DB as PostgreSQL (Prisma)

    %% SSE Connection Establishment
    Customer->>SSEAPI: GET /api/customer/stream?orderId=JIO-123 (jio_token)
    SSEAPI->>DB: Validate order ownership (customerId === authUser.customerId)
    DB-->>SSEAPI: Order valid (assignedAgent: agent_42, status: AGENT_ON_WAY)
    SSEAPI->>SSETempCache: Store connection state: { orderId, agentId: "agent_42" }
    SSEAPI-->>Customer: 200 OK (Content-Type: text/event-stream)
    Note over Customer,SSEAPI: Stream opened. Heartbeat ping sent every 20s.

    %% Agent GPS Location Broadcast
    loop Every 5-10 seconds while en route
        AgentApp->>LocationAPI: POST /api/agent/location { lat: 12.9141, lng: 77.6109 }
        LocationAPI->>DB: Update Agent current location & record AgentLocationLog
        LocationAPI->>Broadcaster: emit("AGENT_LOCATION_UPDATED", { agentId: "agent_42", lat, lng })
        LocationAPI-->>AgentApp: 200 OK
        
        %% Broadcaster distributes to SSE subscribers
        Broadcaster->>SSEAPI: On Event("AGENT_LOCATION_UPDATED")
        SSEAPI->>SSETempCache: Filter check (Does this client listen to agent_42?)
        alt Agent Matches Cached Connection
            SSEAPI-->>Customer: data: {"event": "AGENT_LOCATION_UPDATED", "lat": 12.9141, "lng": 77.6109}\n\n
            Customer->>Customer: Animate agent pin on map
        else Unrelated Client
            Note over SSEAPI: Event safely skipped with ZERO database queries
        end
    end
```

---

### 3.4 Payment Collection, Webhook Verification & Order Fulfillment

For bulky waste disposal (`CUSTOMER_PAYS`), orders require upfront payment. Payment initiation integrates Razorpay, handles client-side checkout completion, and asynchronously reconciles transactions via cryptographically verified webhooks.

```mermaid
sequenceDiagram
    autonumber
    actor Customer as Customer Browser
    participant PayRoute as POST /api/payments/create
    participant RazorpaySDK as Razorpay API Gateway
    participant WebhookRoute as POST /api/payments/webhook
    participant DB as PostgreSQL (Prisma)
    participant Broadcaster as Realtime Broadcaster

    Customer->>PayRoute: POST /api/payments/create { orderId }
    PayRoute->>DB: Verify customer owns order and status is payable
    PayRoute->>RazorpaySDK: orders.create({ amount: total * 100, currency: "INR", receipt: orderNumber })
    RazorpaySDK-->>PayRoute: { id: "order_rzp_123", amount: 15000 }
    PayRoute->>DB: Create Payment record (status: "INITIATED", razorpayOrderId: "order_rzp_123")
    PayRoute-->>Customer: 200 OK { razorpayOrderId, keyId, amount }

    Customer->>Customer: Launch Razorpay Modal & Complete UPI / Card Payment
    RazorpaySDK-->>Customer: Payment success { razorpay_payment_id, razorpay_signature }

    %% Asynchronous Webhook Verification
    RazorpaySDK->>WebhookRoute: POST /api/payments/webhook (Headers + Raw Body + Signature)
    WebhookRoute->>WebhookRoute: Verify HMAC-SHA256 signature against RAZORPAY_WEBHOOK_SECRET
    alt Signature Invalid
        WebhookRoute-->>RazorpaySDK: 400 Bad Request (Invalid signature)
    else Signature Valid
        WebhookRoute->>DB: prisma.$transaction:
        Note over WebhookRoute,DB: 1. Find payment by razorpayOrderId<br/>2. Guard against duplicate replay (idempotent update)<br/>3. Mark payment status: "CAPTURED"<br/>4. Transition Order status: "AGENT_BEING_ASSIGNED"<br/>5. Append OrderStatusHistory
        DB-->>WebhookRoute: Transaction committed
        WebhookRoute->>Broadcaster: emit("PAYMENT_RECEIVED", { orderId, paymentId })
        WebhookRoute->>Broadcaster: emit("NEW_PICKUP_AVAILABLE", order)
        WebhookRoute-->>RazorpaySDK: 200 OK { received: true }
    end
```

---

### 3.5 Order Cancellation, IDOR Validation & Refund Rollback

Customers can cancel bookings prior to agent arrival. The system strictly defends against Insecure Direct Object Reference (IDOR) attacks, checks status eligibility, rolls back pending states, and triggers automatic refunds or admin review tickets.

```mermaid
sequenceDiagram
    autonumber
    actor Customer as Customer Browser
    participant CancelRoute as POST /api/orders/[id]/cancel
    participant OrderAccess as IDOR Guard (lib/orderAccess)
    participant RazorpaySDK as Razorpay Gateway
    participant DB as PostgreSQL (Prisma)
    participant Broadcaster as Realtime Broadcaster

    Customer->>CancelRoute: POST /api/orders/JIO-123/cancel { reason: "Change of schedule" }
    CancelRoute->>CancelRoute: Extract JWT from cookie & verify session
    CancelRoute->>OrderAccess: getOrderIdentifierWhere(id) + verify customer ownership
    
    CancelRoute->>DB: Lookup order by ID or orderNumber
    alt Order Does Not Exist or Belong to Customer
        DB-->>Customer: 404 Not Found (Prevent ID enumeration & IDOR exploit)
    else Order Found & Belongs to Customer
        CancelRoute->>CancelRoute: Check status in CUSTOMER_CANCELLABLE_STATUSES
        alt Status is AGENT_ARRIVED, WEIGHING, or COMPLETED
            CancelRoute-->>Customer: 400 Bad Request ("Order can no longer be cancelled")
        else Status is BOOKING_RECEIVED or AGENT_ASSIGNED
            CancelRoute->>DB: prisma.$transaction:
            alt Order has CAPTURED payment
                CancelRoute->>RazorpaySDK: Initiates refund attempt (idempotent key)
                alt Immediate Gateway Refund Success
                    CancelRoute->>DB: Mark payment: "REFUNDED", Order: "CANCELLED"
                else Gateway Pending / Async Review
                    CancelRoute->>DB: Create RefundRequest (status: "PENDING_ADMIN_REVIEW")
                end
            else No Payment (Recyclable scrap / Unpaid)
                CancelRoute->>DB: Mark order status: "CANCELLED"
            end
            CancelRoute->>DB: Insert OrderStatusHistory & AuditLog
            DB-->>CancelRoute: Transaction committed
            CancelRoute->>Broadcaster: emit("ORDER_STATUS_CHANGED", { orderId, status: "CANCELLED" })
            CancelRoute-->>Customer: 200 OK { success: true, message: "Order cancelled successfully" }
        end
    end
```

---

## 4. UI Testing & Manual Verification Guide

Follow these step-by-step verification procedures in the browser to validate system behavior end-to-end.

### 4.1 Prerequisites
1. Ensure the PostgreSQL local database is running:
   ```powershell
   # Verified running on 127.0.0.1:5433
   ```
2. Start the development server with local database safety guard:
   ```powershell
   npm run dev
   ```
3. Open browser at `http://localhost:3000`.

---

### 4.2 Test Scenario 1: Customer Phone OTP Authentication
1. Navigate to `http://localhost:3000/login`.
2. Enter the local test phone number: `9876543210` (or your configured phone).
3. Click **Send OTP**.
   - **Expected Result**: Success notification displays *"OTP sent successfully"*. (In test mode, console outputs test OTP or `123456`).
4. Enter the 6-digit code `123456` and click **Verify & Continue**.
   - **Expected Result**: Redirects to `/book` or `/my-pickups`. Inspect browser DevTools → Application → Cookies to verify `jio_token` is stored as `HttpOnly`.

---

### 4.3 Test Scenario 2: Waste Pickup Booking & Geofencing
1. Navigate to `http://localhost:3000/book`.
2. **Category Selection**:
   - Select *Paper & Cardboard* (estimated 15 kg).
   - Select *Plastics* (estimated 5 kg).
   - Verify the summary card displays financial direction: *"Junk It Out pays you estimated ₹..."*.
3. **Address & Geofencing**:
   - Set address within South Bengaluru (e.g., *Koramangala 4th Block, Bengaluru*).
   - Select date and time slot.
4. Click **Confirm Booking**.
   - **Expected Result**: Booking is confirmed without errors. Redirects to `/orders/[orderNumber]` or `/my-pickups`. Order status displays `BOOKING_RECEIVED`.

---

### 4.4 Test Scenario 3: Real-Time Order Tracking & SSE Connection
1. Open the created order details page: `http://localhost:3000/orders/[orderNumber]`.
2. Open DevTools → Network tab → Filter by `Fetch/XHR` or `stream`.
3. Locate the request to `/api/customer/stream?orderId=...`:
   - **Headers**: Verify `Content-Type: text/event-stream`.
   - **Status**: `200 OK`.
   - **Messages**: Heartbeat comments `: keepalive` stream every 20 seconds.
4. Simulate agent location updates using an agent session or API call to `/api/agent/location`.
   - **Expected Result**: Tracking pin updates in real-time on the map without full page refresh.

---

### 4.5 Test Scenario 4: Order Cancellation & State Verification
1. From the customer order tracking page (`/orders/[orderNumber]`), click **Cancel Pickup**.
2. Select a cancellation reason (e.g., *"Booked by mistake"*).
3. Confirm the cancellation prompt.
   - **Expected Result**: Status badge immediately updates to `CANCELLED`.
   - Verify refreshing the page maintains the `CANCELLED` status.
   - Verify pickup is updated in `/my-pickups` list.

---

### 4.6 Test Scenario 5: Admin Dashboard & Functional Accuracy
1. Log in with admin credentials or access `http://localhost:3000/admin`.
2. Check the Stats Dashboard:
   - Verify **Total Bookings**, **Active Pickups**, and **Completed Orders** load without console errors.
   - Verify pricing settings under `/admin/pricing` load categories accurately.
3. Verify settlements ledger under `/admin/settlements` loads bounded records without leaking password hashes.


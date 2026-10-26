# API inventory

This matrix lists the route boundaries present in the checked-out repository. Exact request schemas and response types remain defined by each handler. “Role/session” means a signed `jio_token` session is checked in the route or shared helper; the standalone admin proxy does not replace backend authorization. Provider webhooks use provider signatures rather than a browser session.

| Route | Methods | Caller / access boundary | Main behavior |
|---|---|---|---|
| `/api/auth/send-otp` | POST, OPTIONS | Customer/admin/agent login UI; trusted-origin check | Validate phone, send OTP or use guarded local test mode |
| `/api/auth/verify-otp` | POST | Login UI; trusted-origin check and OTP verification | Create/find customer session |
| `/api/auth/admin-login` | POST | Admin UI; OTP plus admin provisioning/role logic | Authenticate admin; review the role-mutation finding in audit |
| `/api/auth/agent-login` | POST | Agent UI; OTP and agent profile | Authenticate agent |
| `/api/auth/me`, `/api/auth/logout`, `/api/auth/otp` | GET/POST as implemented | Session or public login utility | Current user, logout, OTP helper |
| `/api/orders` | GET, POST | Customer ownership for booking; agent assignment scope; admin sees operational set | Create with validation/idempotency; role-filtered list |
| `/api/orders/[id]` | GET | Authenticated owner/assigned agent/admin rules in handler | Order detail |
| `/api/orders/[id]/assign` | POST | Admin/dispatch rule | Transactional agent assignment |
| `/api/orders/[id]/accept`, `/start`, `/arrive`, `/status`, `/weigh`, `/complete`, `/cancel` | POST/PATCH as implemented | Assigned agent or authorized admin; state and ownership checks vary by route | Order lifecycle changes; weighing and completion use transactions |
| `/api/admin/stats` | GET | ADMIN or SUPER_ADMIN | Dashboard counters and financial/weight metrics |
| `/api/admin/agents` | GET, POST, PUT | ADMIN or SUPER_ADMIN | Agent listing, provisioning, status/profile changes |
| `/api/admin/agents/force-exit` | POST | Admin | Agent operational intervention |
| `/api/admin/admin-users` | GET, POST | Admin | Admin account operations |
| `/api/admin/customers` | GET | Admin | Customer roster |
| `/api/admin/complaints` | GET, PATCH | Admin | Complaint listing and resolution |
| `/api/admin/coupons` | GET, POST, PUT | Admin | Coupon management |
| `/api/admin/notifications` | GET | Admin | Notification listing |
| `/api/admin/payments` | GET | Admin | Payment/report view |
| `/api/admin/payments/refund` | POST | Admin; external Razorpay call when a provider payment ID exists | Refund and local status update |
| `/api/admin/settlements` | GET, PATCH | Admin | Settlement listing and status updates; no transfer implementation found |
| `/api/admin/audit-logs` | GET | Admin | Audit history |
| `/api/admin/reports` | GET | Admin | CSV order export |
| `/api/admin/sync-schema` | GET | Admin | Read-only complaint-column diagnostic; no schema mutation |
| `/api/agent/location`, `/api/agent/status` | POST/PUT as implemented | Authenticated agent; location scoped to assigned active order | Location and availability changes |
| `/api/customer/addresses` | GET, POST | Authenticated customer | Address list and save |
| `/api/customer/stream`, `/api/agent/stream`, `/api/realtime/stream` | GET | Customer ownership, agent identity, or admin role respectively | SSE streams; admin stream sends refresh event names only |
| `/api/payments/create` | POST | Authenticated owning customer | Create Razorpay payment order |
| `/api/payments/verify`, `/api/payments/reconcile`, `/api/payments/callback` | POST | Authenticated flow and provider verification rules | Verify/reconcile provider payment and update order |
| `/api/payments/webhook` | POST | Razorpay signature | Provider webhook; idempotent payment/order state handling, with dispatch retry risk noted in audit |
| `/api/waste-categories` | GET, POST, PUT | Public read; admin write | Shared waste types and pricing |
| `/api/service-areas`, `/api/service-areas/check` | GET/POST/PUT as implemented | Public lookup; admin mutation | Service-area coverage/configuration |
| `/api/complaints`, `/api/reviews` | GET/POST as implemented | Customer/session and ownership rules | Support and review operations |
| `/api/upload`, `/api/upload/view` | POST, GET | Auth/session and configured storage | Upload and serve images |
| `/api/webhooks/fast2sms/whatsapp` | POST | Provider webhook validation path | Notification delivery status callback |

## Frontend calling boundaries

- Customer pages and agent pages in the root app call same-origin root API routes.
- The root admin UI calls the same root API.
- The standalone admin UI calls its same-origin catch-all proxy; the proxy forwards to the explicitly configured root backend and relays session credentials. Backend route authorization remains authoritative.
- Payment and Fast2SMS webhook routes are provider-to-server boundaries, not browser APIs.

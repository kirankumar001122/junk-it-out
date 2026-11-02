import assert from 'node:assert/strict';
import { test, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import { GET as getPhotoView } from '../app/api/upload/view/route';
import { GET as getDirectUpload } from '../app/uploads/[filename]/route';
import { getSecurePhotoUrl } from '../lib/utils/photoUrl';
import { db } from '../lib/db';
import { signToken } from '../lib/auth/jwt';
import fs from 'fs/promises';

process.env.JWT_SECRET = 'upload-view-authorization-test-secret-32-bytes';

type Role = 'CUSTOMER' | 'AGENT' | 'ADMIN' | 'SUPER_ADMIN';

const database = db as any;

function createTestToken(role: Role, claims: Record<string, unknown> = {}) {
  return signToken({
    userId: `${role.toLowerCase()}-user-1`,
    phone: '9999999999',
    name: `Test ${role}`,
    role,
    tokenVersion: 1,
    ...claims,
  });
}

function createTestRequest(
  url: string,
  options: { token?: string } = {}
) {
  return new NextRequest(`http://localhost${url}`, {
    method: 'GET',
    headers: {
      ...(options.token ? { Cookie: `jio_token=${options.token}` } : {}),
    },
  });
}

const originalOrderFindUnique = database.order.findUnique;
const originalOrderFindFirst = database.order.findFirst;
const originalAgentFindUnique = database.agent.findUnique;
const originalComplaintFindFirst = database.complaint?.findFirst;
const originalReadFile = fs.readFile;

const TEST_FILENAME = 'waste-photo-1788852069856-7r1sg.jpg';
const TEST_ORDER_ID = 'order-uuid-1001';
const OWNER_CUSTOMER_ID = 'cust-1001';
const OWNER_CUSTOMER_USER_ID = 'customer-user-1';
const ASSIGNED_AGENT_ID = 'agent-1001';
const ASSIGNED_AGENT_USER_ID = 'agent-user-1';

const mockOrder = {
  id: TEST_ORDER_ID,
  customerId: OWNER_CUSTOMER_ID,
  agentId: ASSIGNED_AGENT_ID,
  wastePhotos: JSON.stringify([`/uploads/${TEST_FILENAME}`]),
  customer: { userId: OWNER_CUSTOMER_USER_ID },
  agent: { userId: ASSIGNED_AGENT_USER_ID },
  weightRecords: [],
};

beforeEach(() => {
  // Mock agent.findUnique for agent tokenVersion validation in auth middleware
  database.agent.findUnique = async () => ({ tokenVersion: 1 });
  // Mock fs.readFile so local upload reads return a valid buffer
  (fs as any).readFile = async () => Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]);
});

afterEach(() => {
  database.order.findUnique = originalOrderFindUnique;
  database.order.findFirst = originalOrderFindFirst;
  database.agent.findUnique = originalAgentFindUnique;
  if (database.complaint) database.complaint.findFirst = originalComplaintFindFirst;
  (fs as any).readFile = originalReadFile;
});

test('1. Unauthenticated access denied with 401 and private no-store headers', async () => {
  const req = createTestRequest(`/api/upload/view?url=/uploads/${TEST_FILENAME}`);
  const res = await getPhotoView(req);

  assert.equal(res.status, 401);
  assert.equal(res.headers.get('Cache-Control'), 'private, no-store');
  const body = await res.json();
  assert.equal(body.success, false);
});

test('2. Correct customer access allowed with 200 and private no-store headers', async () => {
  database.order.findFirst = async () => mockOrder;

  const customerToken = createTestToken('CUSTOMER', {
    userId: OWNER_CUSTOMER_USER_ID,
    customerId: OWNER_CUSTOMER_ID,
  });

  const req = createTestRequest(`/api/upload/view?url=/uploads/${TEST_FILENAME}`, {
    token: customerToken,
  });
  const res = await getPhotoView(req);

  assert.equal(res.status, 200);
  assert.equal(res.headers.get('Cache-Control'), 'private, no-store');
  assert.equal(res.headers.get('X-Content-Type-Options'), 'nosniff');
});

test('3. Different customer access denied with 403 and private no-store headers', async () => {
  database.order.findFirst = async () => mockOrder;

  const otherCustomerToken = createTestToken('CUSTOMER', {
    userId: 'other-customer-user-2',
    customerId: 'other-cust-2002',
  });

  const req = createTestRequest(`/api/upload/view?url=/uploads/${TEST_FILENAME}`, {
    token: otherCustomerToken,
  });
  const res = await getPhotoView(req);

  assert.equal(res.status, 403);
  assert.equal(res.headers.get('Cache-Control'), 'private, no-store');
  const body = await res.json();
  assert.equal(body.success, false);
});

test('4. Assigned agent access allowed with 200 and private no-store headers', async () => {
  database.order.findFirst = async () => mockOrder;

  const assignedAgentToken = createTestToken('AGENT', {
    userId: ASSIGNED_AGENT_USER_ID,
    agentId: ASSIGNED_AGENT_ID,
  });

  const req = createTestRequest(`/api/upload/view?url=/uploads/${TEST_FILENAME}`, {
    token: assignedAgentToken,
  });
  const res = await getPhotoView(req);

  assert.equal(res.status, 200);
  assert.equal(res.headers.get('Cache-Control'), 'private, no-store');
});

test('5. Unassigned agent access denied with 403 and private no-store headers', async () => {
  database.order.findFirst = async () => mockOrder;

  const unassignedAgentToken = createTestToken('AGENT', {
    userId: 'other-agent-user-99',
    agentId: 'other-agent-99',
  });

  const req = createTestRequest(`/api/upload/view?url=/uploads/${TEST_FILENAME}`, {
    token: unassignedAgentToken,
  });
  const res = await getPhotoView(req);

  assert.equal(res.status, 403);
  assert.equal(res.headers.get('Cache-Control'), 'private, no-store');
});

test('6. Authorized admin access allowed without order association check', async () => {
  // Even if no order matches in DB, admin is allowed operational access
  database.order.findFirst = async () => null;

  const adminToken = createTestToken('ADMIN', {
    userId: 'admin-user-1',
    adminId: 'admin-1',
  });

  const req = createTestRequest(`/api/upload/view?url=/uploads/${TEST_FILENAME}`, {
    token: adminToken,
  });
  const res = await getPhotoView(req);

  assert.equal(res.status, 200);
  assert.equal(res.headers.get('Cache-Control'), 'private, no-store');
});

test('7. Photo/order ownership mismatch denied with 403 when orderId does not contain photo', async () => {
  // The customer owns TEST_ORDER_ID, but this order does NOT contain the requested photo
  const orderWithoutPhoto = {
    ...mockOrder,
    wastePhotos: JSON.stringify(['/uploads/other-photo.jpg']),
    weightRecords: [],
  };
  database.order.findUnique = async () => orderWithoutPhoto;

  const customerToken = createTestToken('CUSTOMER', {
    userId: OWNER_CUSTOMER_USER_ID,
    customerId: OWNER_CUSTOMER_ID,
  });

  const req = createTestRequest(
    `/api/upload/view?url=/uploads/${TEST_FILENAME}&orderId=${TEST_ORDER_ID}`,
    { token: customerToken }
  );
  const res = await getPhotoView(req);

  assert.equal(res.status, 403);
  assert.equal(res.headers.get('Cache-Control'), 'private, no-store');
  const body = await res.json();
  assert.equal(body.message, 'Photo does not belong to the specified order.');
});

test('8. Missing URL parameter rejected with 400 and private no-store headers', async () => {
  const adminToken = createTestToken('ADMIN');
  const req = createTestRequest('/api/upload/view', { token: adminToken });
  const res = await getPhotoView(req);

  assert.equal(res.status, 400);
  assert.equal(res.headers.get('Cache-Control'), 'private, no-store');
});

test('9. Direct unauthenticated access to /uploads/:filename is denied with 401', async () => {
  const req = createTestRequest(`/uploads/${TEST_FILENAME}`);
  const res = await getDirectUpload(req, { params: Promise.resolve({ filename: TEST_FILENAME }) });

  assert.equal(res.status, 401);
  assert.equal(res.headers.get('Cache-Control'), 'private, no-store');
  const body = await res.json();
  assert.equal(body.success, false);
});

test('10. Direct authenticated access to /uploads/:filename redirects (307) to /api/upload/view', async () => {
  const customerToken = createTestToken('CUSTOMER', {
    userId: OWNER_CUSTOMER_USER_ID,
    customerId: OWNER_CUSTOMER_ID,
  });

  const req = createTestRequest(`/uploads/${TEST_FILENAME}`, { token: customerToken });
  const res = await getDirectUpload(req, { params: Promise.resolve({ filename: TEST_FILENAME }) });

  assert.equal(res.status, 307);
  assert.equal(res.headers.get('Cache-Control'), 'private, no-store');
  const location = res.headers.get('location');
  assert.ok(location?.includes(`/api/upload/view?url=${encodeURIComponent(`/uploads/${TEST_FILENAME}`)}`));
});

test('11. getSecurePhotoUrl wraps legacy local upload paths into /api/upload/view for secure previews', () => {
  const localUrl = `/uploads/${TEST_FILENAME}`;
  const secureUrl = getSecurePhotoUrl(localUrl);

  assert.equal(secureUrl, `/api/upload/view?url=${encodeURIComponent(localUrl)}`);

  // Verifies that already wrapped URLs are preserved without double wrapping
  assert.equal(getSecurePhotoUrl(secureUrl), secureUrl);
});

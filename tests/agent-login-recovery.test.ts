import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';
import { POST as agentLogin } from '../app/api/auth/agent-login/route';
import { POST as logout } from '../app/api/auth/logout/route';
import { PATCH as updateAgentStatus } from '../app/api/agent/status/route';
import { db } from '../lib/db';

(process.env as Record<string, string | undefined>)['NODE_ENV'] = 'development';
process.env.JWT_SECRET = 'agent-login-recovery-test-secret-key-2026';
process.env.OTP_TEST_MODE = 'true';
process.env.OTP_TEST_PHONE = '9000000000';

const database = db as any;
const agent = {
  id: 'agent-login-recovery',
  userId: 'agent-login-user',
  status: 'OFFLINE',
  serviceAreas: 'all',
  tokenVersion: 1,
  user: { name: 'Synthetic Agent' },
};
const user = {
  id: agent.userId,
  phone: '+919000000000',
  name: 'Synthetic Agent',
  role: 'AGENT',
  agent,
};

const originals = {
  userFindFirst: database.user.findFirst,
  agentFindUnique: database.agent.findUnique,
  orderFindFirst: database.order.findFirst,
  orderFindMany: database.order.findMany,
  orderUpdateMany: database.order.updateMany,
  transaction: database.$transaction,
};

let orderAssignmentSideEffects = 0;
database.user.findFirst = async () => user;
database.agent.findUnique = async ({ where }: any) =>
  where.id === agent.id ? { tokenVersion: agent.tokenVersion } : null;
database.order.findFirst = async () => null;
database.order.findMany = async () => {
  orderAssignmentSideEffects += 1;
  return [];
};
database.order.updateMany = async () => {
  orderAssignmentSideEffects += 1;
  throw new Error('agent login must not assign orders');
};
database.$transaction = async (callback: (tx: any) => unknown) => callback({
  order: { findFirst: async () => null },
  agent: {
    update: async ({ data }: any) => {
      agent.status = data.status;
      return { ...agent, user };
    },
  },
});

function loginRequest() {
  return new NextRequest('http://localhost/api/auth/agent-login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone: '9000000000', code: '123456' }),
  });
}

async function run() {
  try {
    const firstLogin = await agentLogin(loginRequest());
    assert.equal(firstLogin.status, 200, 'an operationally offline agent can authenticate');
    assert.equal(orderAssignmentSideEffects, 0, 'agent login must not assign or query orders');

    const firstCookie = firstLogin.headers.get('set-cookie')?.match(/jio_token=([^;]+)/)?.[1];
    assert.ok(firstCookie, 'login should issue the agent session cookie');

    const logoutResponse = await logout(new NextRequest('http://localhost/api/auth/logout', {
      method: 'POST',
      headers: { Cookie: `jio_token=${firstCookie}` },
    }));
    assert.equal(logoutResponse.status, 200);
    assert.match(logoutResponse.headers.get('set-cookie') || '', /jio_token=/);

    const secondLogin = await agentLogin(loginRequest());
    assert.equal(secondLogin.status, 200, 'offline -> logout -> login must remain available');
    assert.equal(orderAssignmentSideEffects, 0, 'repeated login must not assign or query orders');
    const secondCookie = secondLogin.headers.get('set-cookie')?.match(/jio_token=([^;]+)/)?.[1];
    assert.ok(secondCookie);

    const availableResponse = await updateAgentStatus(new NextRequest('http://localhost/api/agent/status', {
      method: 'PATCH',
      headers: {
        Cookie: `jio_token=${secondCookie}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ status: 'AVAILABLE' }),
    }));
    assert.equal(availableResponse.status, 200);
    assert.equal(agent.status, 'AVAILABLE');

    agent.status = 'SUSPENDED';
    const suspendedLogin = await agentLogin(loginRequest());
    assert.equal(suspendedLogin.status, 403, 'administrative suspension still blocks agent login');
  } finally {
    database.user.findFirst = originals.userFindFirst;
    database.agent.findUnique = originals.agentFindUnique;
    database.order.findFirst = originals.orderFindFirst;
    database.order.findMany = originals.orderFindMany;
    database.order.updateMany = originals.orderUpdateMany;
    database.$transaction = originals.transaction;
  }
}

void run().then(() => console.log('Agent offline login recovery scenarios passed.'));

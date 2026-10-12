import test from 'node:test';
import assert from 'node:assert/strict';
import { isAdminPrincipal, isAssignedAgent, isCustomerOrderOwner, isVerifiedCustomerPrincipal } from '../../lib/auth/accessPolicy.ts';
import { validateAgentTokenVersion } from '../../lib/auth/agentTokenVersion.ts';
import { canReceiveAgentEvent, canReceiveCustomerEvent, isAgentPickupTarget } from '../../lib/realtime/accessPolicy.ts';
import { isCustomerStreamRole } from '../../lib/customerAddresses.ts';

test('admin access is limited to admin roles', () => {
  assert.equal(isAdminPrincipal('ADMIN'), true);
  assert.equal(isAdminPrincipal('SUPER_ADMIN'), true);
  assert.equal(isAdminPrincipal('AGENT'), false);
  assert.equal(isAdminPrincipal(undefined), false);
});

test('customer event streams require the customer role and a user ID', () => {
  assert.equal(isCustomerStreamRole('CUSTOMER', 'user-1'), true);
  assert.equal(isCustomerStreamRole('AGENT', 'user-1'), false);
  assert.equal(isCustomerStreamRole('ADMIN', 'user-1'), false);
  assert.equal(isCustomerStreamRole('CUSTOMER', null), false);
});

test('support requires an authenticated customer profile, not a supplied phone', () => {
  assert.equal(isVerifiedCustomerPrincipal('CUSTOMER', 'customer-1'), true);
  assert.equal(isVerifiedCustomerPrincipal('CUSTOMER', null), false);
  assert.equal(isVerifiedCustomerPrincipal('AGENT', 'customer-1'), false);
});

test('order ownership does not cross customer or agent boundaries', () => {
  const order = { customerId: 'customer-1', customer: { userId: 'user-1' } };
  assert.equal(isCustomerOrderOwner({ customerId: 'customer-1' }, order), true);
  assert.equal(isCustomerOrderOwner({ customerId: 'customer-2', userId: 'user-2' }, order), false);
  assert.equal(isAssignedAgent('agent-1', 'agent-1'), true);
  assert.equal(isAssignedAgent('agent-2', 'agent-1'), false);
  assert.equal(isAssignedAgent('agent-1', null), false);
});

test('agent revocation validation rejects stale, missing, and database-error sessions', async () => {
  const agent = { role: 'AGENT', agentId: 'agent-1', tokenVersion: 1 };
  assert.equal(await validateAgentTokenVersion(agent, async () => 2), null);
  assert.equal(await validateAgentTokenVersion(agent, async () => null), null);
  assert.equal(await validateAgentTokenVersion(agent, async () => { throw new Error('database unavailable'); }), null);
  assert.equal(await validateAgentTokenVersion({ role: 'AGENT' }, async () => 1), null);
  assert.deepEqual(await validateAgentTokenVersion(agent, async () => 1), agent);
});

test('realtime streams reject unknown event types and untargeted pickups', () => {
  assert.equal(canReceiveCustomerEvent('AGENT_ASSIGNED'), true);
  assert.equal(canReceiveCustomerEvent('AGENT_LOCATION_UPDATED'), false);
  assert.equal(canReceiveAgentEvent('NEW_PICKUP_AVAILABLE'), true);
  assert.equal(canReceiveAgentEvent('AUDIT_LOG_CREATED'), false);
  assert.equal(isAgentPickupTarget('agent-1', ['agent-1']), true);
  assert.equal(isAgentPickupTarget('agent-1', ['agent-2']), false);
  assert.equal(isAgentPickupTarget('agent-1', null), false);
});

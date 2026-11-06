import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it, afterEach } from 'vitest';
import { retrievePublicKnowledge } from '../lib/ai/publicKnowledge';
import { notifySupportEscalation } from '../lib/ai/supportEscalation';

describe('Customer support integration', () => {
  const originalKnowledgeUrl = process.env.KNOWLEDGE_BASE_URL;
  const originalAppUrl = process.env.NEXT_PUBLIC_APP_URL;
  const originalWebhookUrl = process.env.SUPPORT_ESCALATION_WEBHOOK_URL;

  afterEach(() => {
    if (originalKnowledgeUrl === undefined) delete process.env.KNOWLEDGE_BASE_URL;
    else process.env.KNOWLEDGE_BASE_URL = originalKnowledgeUrl;
    if (originalAppUrl === undefined) delete process.env.NEXT_PUBLIC_APP_URL;
    else process.env.NEXT_PUBLIC_APP_URL = originalAppUrl;
    if (originalWebhookUrl === undefined) delete process.env.SUPPORT_ESCALATION_WEBHOOK_URL;
    else process.env.SUPPORT_ESCALATION_WEBHOOK_URL = originalWebhookUrl;
  });

  it('does not crawl when no approved knowledge-base origin is configured', async () => {
    delete process.env.KNOWLEDGE_BASE_URL;
    delete process.env.NEXT_PUBLIC_APP_URL;
    assert.equal(await retrievePublicKnowledge('what are your pickup hours'), null);
  });

  it('refuses unconfigured escalation delivery', async () => {
    delete process.env.SUPPORT_ESCALATION_WEBHOOK_URL;
    assert.equal(
      await notifySupportEscalation({
        customerName: 'Test customer',
        customerPhone: '+910000000000',
        question: 'I need help',
        summary: 'Test escalation',
        ticketId: 'test-ticket',
      }),
      'not_configured',
    );
  });

  it('mounts the chatbot on the customer home and support pages, not the global layout', async () => {
    const layout = await readFile(new URL('../app/layout.tsx', import.meta.url), 'utf8');
    const homePage = await readFile(new URL('../app/page.tsx', import.meta.url), 'utf8');
    const supportPage = await readFile(new URL('../app/customer/support/page.tsx', import.meta.url), 'utf8');

    assert.equal(layout.includes('CustomerSupportChatWidget'), false);
    assert.equal(homePage.includes('CustomerSupportChatWidget'), true);
    assert.equal(supportPage.includes('CustomerSupportChatWidget'), true);
  });
});

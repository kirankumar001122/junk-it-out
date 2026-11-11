import { db } from '@/lib/db';
import { SupportChatContext } from './supportAgent';

export interface UnresolvedQueryLog {
  query: string;
  reason: string;
  customerId?: string;
  userId?: string;
  phone?: string;
  timestamp: string;
}

/**
 * Persists unresolved customer questions to the database AuditLog
 * so operations and support administrators can review knowledge gaps.
 */
export async function logUnresolvedQuestion(
  query: string,
  context: SupportChatContext = {},
  reason: string = 'NO_APPROVED_KNOWLEDGE_MATCH'
): Promise<void> {
  const sanitizedQuery = (query || '').trim().slice(0, 1000);
  if (!sanitizedQuery) return;

  try {
    const payload: UnresolvedQueryLog = {
      query: sanitizedQuery,
      reason,
      customerId: context.customerId,
      userId: context.userId,
      phone: context.phone,
      timestamp: new Date().toISOString(),
    };

    console.warn(
      JSON.stringify({
        event: 'support.ai.unresolved_query',
        query: sanitizedQuery,
        reason,
        customerId: context.customerId || null,
        phone: context.phone || null,
      })
    );

    await db.auditLog.create({
      data: {
        userId: context.userId || null,
        userName: context.name || context.phone || 'Customer',
        action: 'SUPPORT_UNRESOLVED_QUERY',
        oldValue: reason,
        newValue: JSON.stringify(payload),
      },
    }).catch((err) => {
      console.warn('[UNRESOLVED_QUERY_AUDIT_LOG_ERROR]', err?.message || err);
    });
  } catch (err: any) {
    console.warn('[LOG_UNRESOLVED_QUESTION_FAILED]', err?.message || err);
  }
}

/**
 * Retrieves recently logged unresolved queries for admin review.
 */
export async function getUnresolvedSupportQueries(limit: number = 20) {
  try {
    const logs = await db.auditLog.findMany({
      where: { action: 'SUPPORT_UNRESOLVED_QUERY' },
      orderBy: { timestamp: 'desc' },
      take: limit,
    });
    return logs.map((l) => {
      let details: any = null;
      if (l.newValue) {
        try {
          details = JSON.parse(l.newValue);
        } catch {
          details = null;
        }
      }
      return {
        ...l,
        details,
      };
    });
  } catch {
    return [];
  }
}

/**
 * Persists every conversation turn (user query + assistant reply) to the AuditLog.
 * Ensures complete conversation history is persistently tracked, not only unresolved questions.
 */
export async function logSupportConversationTurn(data: {
  userMessage: string;
  assistantResponse: string;
  context: SupportChatContext;
  channel?: string;
}): Promise<void> {
  const sanitizedUser = (data.userMessage || '').trim().slice(0, 2000);
  const sanitizedReply = (data.assistantResponse || '').trim().slice(0, 10000);
  if (!sanitizedUser) return;

  try {
    const payload = {
      userMessage: sanitizedUser,
      assistantResponse: sanitizedReply,
      customerId: data.context.customerId || null,
      phone: data.context.phone || null,
      channel: data.channel || 'WEB_SUPPORT_CHAT',
      timestamp: new Date().toISOString(),
    };

    await db.auditLog.create({
      data: {
        userId: data.context.userId || null,
        userName: data.context.name || data.context.phone || 'Customer',
        action: 'SUPPORT_CONVERSATION_TURN',
        oldValue: sanitizedUser.slice(0, 500),
        newValue: JSON.stringify(payload),
      },
    }).catch((err) => {
      console.warn('[SUPPORT_CONVERSATION_AUDIT_LOG_ERROR]', err?.message || err);
    });
  } catch (err: any) {
    console.warn('[LOG_CONVERSATION_TURN_FAILED]', err?.message || err);
  }
}

/**
 * Retrieves persisted conversation history for a given customer or session.
 */
export async function getSupportConversationHistory(customerId?: string, limit: number = 20) {
  try {
    const where: any = { action: 'SUPPORT_CONVERSATION_TURN' };
    if (customerId) {
      where.newValue = { contains: customerId };
    }
    const logs = await db.auditLog.findMany({
      where,
      orderBy: { timestamp: 'desc' },
      take: limit,
    });
    return logs.map((l) => {
      let details: any = null;
      if (l.newValue) {
        try {
          details = JSON.parse(l.newValue);
        } catch {
          details = null;
        }
      }
      return { ...l, details };
    });
  } catch {
    return [];
  }
}

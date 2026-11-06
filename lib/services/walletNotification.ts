import { Prisma } from '@prisma/client';
import { db } from '@/lib/db';
import { logStructured } from '@/lib/observability/structuredLogger';

type DbOrTx = Prisma.TransactionClient | typeof db;

export interface CustomerWalletNotificationInput {
  customerId: string;
  type: 'TOPUP' | 'WALLET_DEBIT' | 'MANUAL_CREDIT' | 'MANUAL_DEBIT' | 'REFUND' | string;
  amount: number;
  balanceAfter: number;
  reason?: string | null;
  referenceId?: string | null;
}

export interface AgentWalletNotificationInput {
  agentId: string;
  type: 'CREDIT' | 'DEBIT' | 'REFUND' | 'MANUAL_ADJUSTMENT' | 'PICKUP_EARNINGS' | string;
  amount: number;
  balanceAfter: number;
  reason?: string | null;
  referenceId?: string | null;
}

export interface SubscriptionNotificationInput {
  customerId: string;
  type: 'SUBSCRIPTION_PURCHASE' | 'SUBSCRIPTION_RENEWAL' | 'SUBSCRIPTION_CHANGE' | 'SUBSCRIPTION_CANCEL';
  planName: string;
  price?: number;
  expiryDate?: Date;
  pickupsAllowed?: number;
  reason?: string | null;
}

/**
 * Persists an in-app / database notification for Customer wallet events.
 * Reuses the existing Notification model and schema.
 */
export async function dispatchCustomerWalletNotification(
  client: DbOrTx,
  input: CustomerWalletNotificationInput,
) {
  try {
    const customer = await client.customer.findUnique({
      where: { id: input.customerId },
      include: {
        user: { select: { id: true, phone: true, name: true } },
      },
    });

    if (!customer?.user) return null;

    const formattedAmount = `₹${input.amount.toFixed(2)}`;
    const formattedBalance = `₹${input.balanceAfter.toFixed(2)}`;

    let message = '';
    switch (input.type) {
      case 'TOPUP':
        message = `Your Junk It Out wallet was recharged with ${formattedAmount}. New balance: ${formattedBalance}.`;
        break;
      case 'MANUAL_CREDIT':
        message = `Your wallet was credited with ${formattedAmount} by admin. Reason: ${input.reason || 'Account adjustment'}. New balance: ${formattedBalance}.`;
        break;
      case 'MANUAL_DEBIT':
        message = `Your wallet was debited with ${formattedAmount} by admin. Reason: ${input.reason || 'Account adjustment'}. New balance: ${formattedBalance}.`;
        break;
      case 'WALLET_DEBIT':
        message = `Debited ${formattedAmount} from your wallet for ${input.reason || 'service payment'}. Remaining balance: ${formattedBalance}.`;
        break;
      case 'REFUND':
        message = `Refund of ${formattedAmount} credited to your wallet. Reason: ${input.reason || 'Order refund'}. New balance: ${formattedBalance}.`;
        break;
      default:
        message = `Wallet transaction ${input.type}: ${formattedAmount}. Balance: ${formattedBalance}.`;
    }

    const notification = await client.notification.create({
      data: {
        userId: customer.user.id,
        recipient: customer.user.phone || 'customer',
        type: 'WALLET_TRANSACTION',
        content: message,
        status: 'SENT',
        provider: 'IN_APP',
        deliveryStatus: 'sent',
        statusDescription: input.reason || 'Customer wallet notification',
      },
    });

    logStructured('info', 'wallet.customer.notification_dispatched', {
      databaseModel: 'Notification',
      databaseAction: 'create',
    });

    return notification;
  } catch (error) {
    logStructured('warn', 'wallet.customer.notification_failed', {
      databaseModel: 'Notification',
      databaseAction: 'create',
      errorType: error instanceof Error ? error.name : 'UnknownError',
    });
    return null;
  }
}

/**
 * Persists an in-app / database notification for Agent wallet movements.
 * Reuses the existing Notification model and schema.
 */
export async function dispatchAgentWalletNotification(
  client: DbOrTx,
  input: AgentWalletNotificationInput,
) {
  try {
    const agent = await client.agent.findUnique({
      where: { id: input.agentId },
      include: {
        user: { select: { id: true, phone: true, name: true } },
      },
    });

    if (!agent?.user) return null;

    const formattedAmount = `₹${input.amount.toFixed(2)}`;
    const formattedBalance = `₹${input.balanceAfter.toFixed(2)}`;

    let message = '';
    switch (input.type) {
      case 'PICKUP_EARNINGS':
        message = `Congratulations! You earned ${formattedAmount} for completing pickup. New balance: ${formattedBalance}.`;
        break;
      case 'CREDIT':
        message = `Agent wallet credited with ${formattedAmount}. Reason: ${input.reason || 'Credit adjustment'}. New balance: ${formattedBalance}.`;
        break;
      case 'DEBIT':
        message = `Agent wallet debited with ${formattedAmount}. Reason: ${input.reason || 'Debit adjustment'}. Remaining balance: ${formattedBalance}.`;
        break;
      case 'REFUND':
        message = `Refund adjustment of ${formattedAmount} processed on your agent wallet. New balance: ${formattedBalance}.`;
        break;
      case 'MANUAL_ADJUSTMENT':
        message = `Admin adjustment of ${formattedAmount} applied to your agent wallet. Reason: ${input.reason || 'Admin adjustment'}. New balance: ${formattedBalance}.`;
        break;
      default:
        message = `Agent wallet update: ${input.type} of ${formattedAmount}. Balance: ${formattedBalance}.`;
    }

    const notification = await client.notification.create({
      data: {
        userId: agent.user.id,
        recipient: agent.user.phone || 'agent',
        type: 'AGENT_WALLET_TRANSACTION',
        content: message,
        status: 'SENT',
        provider: 'IN_APP',
        deliveryStatus: 'sent',
        statusDescription: input.reason || 'Agent wallet notification',
      },
    });

    logStructured('info', 'wallet.agent.notification_dispatched', {
      databaseModel: 'Notification',
      databaseAction: 'create',
    });

    return notification;
  } catch (error) {
    logStructured('warn', 'wallet.agent.notification_failed', {
      databaseModel: 'Notification',
      databaseAction: 'create',
      errorType: error instanceof Error ? error.name : 'UnknownError',
    });
    return null;
  }
}

/**
 * Persists an in-app / database notification for Customer Subscription events.
 */
export async function dispatchSubscriptionNotification(
  client: DbOrTx,
  input: SubscriptionNotificationInput,
) {
  try {
    const customer = await client.customer.findUnique({
      where: { id: input.customerId },
      include: {
        user: { select: { id: true, phone: true, name: true } },
      },
    });

    if (!customer?.user) return null;

    let message = '';
    const expiryStr = input.expiryDate ? input.expiryDate.toLocaleDateString('en-IN') : '';

    switch (input.type) {
      case 'SUBSCRIPTION_PURCHASE':
        message = `Your ${input.planName} subscription is active! Doorstep pickup fee waived for ${input.pickupsAllowed || 4} pickups until ${expiryStr}.`;
        break;
      case 'SUBSCRIPTION_RENEWAL':
        message = `Your ${input.planName} subscription has been renewed successfully until ${expiryStr}.`;
        break;
      case 'SUBSCRIPTION_CHANGE':
        message = `Your plan has been changed to ${input.planName}! Valid until ${expiryStr}.`;
        break;
      case 'SUBSCRIPTION_CANCEL':
        message = `Your ${input.planName} subscription has been cancelled. Reason: ${input.reason || 'Customer request'}.`;
        break;
    }

    const notification = await client.notification.create({
      data: {
        userId: customer.user.id,
        recipient: customer.user.phone || 'customer',
        type: 'SUBSCRIPTION',
        content: message,
        status: 'SENT',
        provider: 'IN_APP',
        deliveryStatus: 'sent',
        statusDescription: input.reason || 'Subscription status update',
      },
    });

    logStructured('info', 'subscription.notification_dispatched', {
      databaseModel: 'Notification',
      databaseAction: 'create',
    });

    return notification;
  } catch (error) {
    logStructured('warn', 'subscription.notification_failed', {
      databaseModel: 'Notification',
      databaseAction: 'create',
      errorType: error instanceof Error ? error.name : 'UnknownError',
    });
    return null;
  }
}

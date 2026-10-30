import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { getAdminAuthorizationStatus, getAuthUser } from '@/lib/auth/middleware';
import { successResponse, errorResponse } from '@/lib/utils/apiResponse';

import { getCachedAdminStats, setCachedAdminStats } from '@/lib/cache/adminStatsCache';

export async function GET(req: NextRequest) {
  try {
    const authUser = await getAuthUser(req);
    const authorizationStatus = getAdminAuthorizationStatus(authUser);
    if (authorizationStatus === 401) {
      return errorResponse('UNAUTHORIZED', 'Authentication is required.', 401);
    }
    if (authorizationStatus === 403) {
      return errorResponse('FORBIDDEN', 'Admin access required.', 403);
    }

    // Short-lived in-memory cache to absorb rapid concurrent dashboard polling bursts
    const bypassCache = req.headers.get('cache-control') === 'no-cache' || process.env.NODE_ENV === 'test';
    const cachedPayload = !bypassCache ? getCachedAdminStats() : null;
    if (cachedPayload) {
      const res = successResponse(cachedPayload);
      res.headers.set('Cache-Control', 'private, max-age=10');
      res.headers.set('X-Cache', 'HIT');
      return res;
    }

    // Calculate start & end of TODAY in Asia/Kolkata (IST) timezone
    const now = new Date();
    const kolkataDateStr = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Kolkata',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(now);

    const startOfDay = new Date(`${kolkataDateStr}T00:00:00+05:30`);
    const endOfDay = new Date(`${kolkataDateStr}T23:59:59.999+05:30`);
    const slaWindowStart = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);

    // Execute independent aggregation and metric queries using allSettled to distinguish failures from genuine zeroes
    const settledResults = await Promise.allSettled([
      // 0: Order status groups
      db.order.groupBy({
        by: ['status'],
        _count: { _all: true },
      }),
      // 1: Agent status groups
      db.agent.groupBy({
        by: ['status'],
        _count: { _all: true },
      }),
      // 2: Settlement groups
      db.settlement.groupBy({
        by: ['status'],
        _sum: { amount: true },
      }),
      // 3: Today's bookings count
      db.order.count({
        where: { createdAt: { gte: startOfDay, lte: endOfDay } },
      }),
      // 4: Unassigned bookings awaiting agent dispatch
      db.order.count({
        where: {
          agentId: null,
          status: { in: ['BOOKING_RECEIVED', 'AGENT_BEING_ASSIGNED'] },
        },
      }),
      // 5: Customer count
      db.customer.count(),
      // 6: Total revenue from captured customer payments
      db.payment.aggregate({
        _sum: { amount: true },
        where: { status: { in: ['CAPTURED', 'SETTLEMENT_COMPLETED'] } },
      }),
      // 7: Total weight collected
      db.orderItem.aggregate({
        _sum: { actualWeight: true },
        where: { actualWeight: { not: null } },
      }),
      // 8: SLA completion dates
      db.order.findMany({
        where: {
          status: { in: ['PICKUP_COMPLETED', 'SETTLEMENT_COMPLETED'] },
          updatedAt: { gte: slaWindowStart },
        },
        select: { createdAt: true, updatedAt: true },
        take: 200,
      }),
    ]);

    // Check query failures
    const failedIndices = settledResults
      .map((r, i) => (r.status === 'rejected' ? i : -1))
      .filter((i) => i !== -1);

    // If core database queries failed completely, never silently return fake zeroes
    if (failedIndices.length >= 5 || (failedIndices.includes(0) && failedIndices.includes(2) && failedIndices.includes(6))) {
      return errorResponse(
        'DATABASE_ERROR',
        'Failed to calculate dashboard metrics due to database query failure.',
        500
      );
    }

    const partialErrors: string[] = [];
    if (failedIndices.includes(0)) partialErrors.push('orders');
    if (failedIndices.includes(1)) partialErrors.push('agents');
    if (failedIndices.includes(2)) partialErrors.push('settlements');
    if (failedIndices.includes(3)) partialErrors.push('todaysBookings');
    if (failedIndices.includes(4)) partialErrors.push('unassignedPickups');
    if (failedIndices.includes(5)) partialErrors.push('customers');
    if (failedIndices.includes(6)) partialErrors.push('revenue');
    if (failedIndices.includes(7)) partialErrors.push('totalWeight');
    if (failedIndices.includes(8)) partialErrors.push('sla');

    const orderStatusGroups = settledResults[0].status === 'fulfilled' ? (settledResults[0].value as any[]) : [];
    const agentStatusGroups = settledResults[1].status === 'fulfilled' ? (settledResults[1].value as any[]) : [];
    const settlementGroups = settledResults[2].status === 'fulfilled' ? (settledResults[2].value as any[]) : [];
    const todaysBookings = settledResults[3].status === 'fulfilled' ? Number(settledResults[3].value || 0) : 0;
    const unassignedPickups = settledResults[4].status === 'fulfilled' ? Number(settledResults[4].value || 0) : 0;
    const customerCount = settledResults[5].status === 'fulfilled' ? Number(settledResults[5].value || 0) : 0;
    const paymentRevenueAgg = settledResults[6].status === 'fulfilled' ? (settledResults[6].value as any) : { _sum: { amount: 0 } };
    const totalWeightKgAgg = settledResults[7].status === 'fulfilled' ? (settledResults[7].value as any) : { _sum: { actualWeight: 0 } };
    const completedOrdersDates = settledResults[8].status === 'fulfilled' ? (settledResults[8].value as any[]) : [];

    // Aggregate order status metrics strictly aligned with the order lifecycle
    // PENDING BOOKINGS: Orders awaiting agent assignment
    const PENDING_STATUSES = ['BOOKING_RECEIVED', 'AGENT_BEING_ASSIGNED'];
    // ACTIVE PICKUPS: Orders actively in progress by an assigned agent
    const ACTIVE_STATUSES = ['AGENT_ASSIGNED', 'AGENT_ACCEPTED', 'AGENT_ON_WAY', 'AGENT_ARRIVED', 'WASTE_VERIFICATION', 'WEIGHING'];
    // COMPLETED: Pickups completed or settlement completed
    const COMPLETED_STATUSES = ['PICKUP_COMPLETED', 'SETTLEMENT_COMPLETED'];

    let totalBookings = 0;
    let pendingBookings = 0;
    let activePickups = 0;
    let completedPickups = 0;
    let cancelledOrders = 0;

    for (const group of orderStatusGroups) {
      const count = Number(group._count?._all || 0);
      totalBookings += count;
      if (PENDING_STATUSES.includes(group.status)) {
        pendingBookings += count;
      } else if (ACTIVE_STATUSES.includes(group.status)) {
        activePickups += count;
      } else if (COMPLETED_STATUSES.includes(group.status)) {
        completedPickups += count;
      } else if (group.status === 'CANCELLED') {
        cancelledOrders += count;
      }
    }

    // Aggregate agent status metrics
    let totalAgents = 0;
    let availableAgents = 0;
    let activeAgents = 0;

    for (const group of agentStatusGroups) {
      const count = Number(group._count?._all || 0);
      totalAgents += count;
      if (group.status === 'AVAILABLE') {
        availableAgents += count;
      }
      if (['AVAILABLE', 'ASSIGNED', 'EN_ROUTE', 'ARRIVED'].includes(group.status)) {
        activeAgents += count;
      }
    }

    // Aggregate settlement payout metrics distinctly
    let approvedCustomerPayouts = 0;
    let paidCustomerPayouts = 0;
    let pendingCustomerPayouts = 0;

    for (const group of settlementGroups) {
      const amt = Number(group._sum?.amount || 0);
      if (['APPROVED', 'READY_FOR_PAYOUT'].includes(group.status)) {
        approvedCustomerPayouts += amt;
      } else if (['PAID', 'SETTLEMENT_COMPLETED'].includes(group.status)) {
        paidCustomerPayouts += amt;
      } else if (group.status === 'PENDING') {
        pendingCustomerPayouts += amt;
      }
    }

    // Assigned active pickups strictly represents orders currently in progress with an agent
    const assignedPickups = activePickups;
    const totalRevenue = Number((paymentRevenueAgg?._sum?.amount || 0).toFixed(2));
    const totalCustomerSettlements = Number((approvedCustomerPayouts + paidCustomerPayouts + pendingCustomerPayouts).toFixed(2));
    // totalCustomerPayouts strictly represents money actually paid out
    const totalCustomerPayouts = Number(paidCustomerPayouts.toFixed(2));

    const onTimeCount = completedOrdersDates.filter((order) => {
      if (!order.createdAt || !order.updatedAt) return false;
      const diffMinutes = (new Date(order.updatedAt).getTime() - new Date(order.createdAt).getTime()) / (1000 * 60);
      return diffMinutes <= 30;
    }).length;

    const slaOnTimeRate = completedOrdersDates.length > 0
      ? Number(((onTimeCount / completedOrdersDates.length) * 100).toFixed(1))
      : 0;

    const payload = {
      totalBookings,
      todaysBookings,
      pendingBookings,
      activePickups,
      completedPickups,
      completedOrders: completedPickups,
      assignedPickups,
      unassignedPickups,
      activeAgents,
      customers: customerCount,
      totalRevenue,
      totalCustomerPayouts,
      paidCustomerPayouts,
      approvedCustomerPayouts,
      pendingCustomerPayouts,
      totalCustomerSettlements,
      totalOrders: totalBookings,
      activeOrders: activePickups,
      totalAgents,
      availableAgents,
      totalWeightKg: Number((totalWeightKgAgg?._sum?.actualWeight || 0).toFixed(1)),
      cancelledOrders,
      slaTargetMins: 30,
      slaOnTimeRate,
      isPartial: partialErrors.length > 0,
      partialErrors: partialErrors.length > 0 ? partialErrors : null,
    };

    if (!bypassCache && partialErrors.length === 0) {
      setCachedAdminStats(payload);
    }

    const res = successResponse(payload);
    res.headers.set('Cache-Control', 'private, max-age=10');
    res.headers.set('X-Cache', 'MISS');
    return res;
  } catch (error: any) {
    return errorResponse('INTERNAL_SERVER_ERROR', error.message || 'Failed to fetch admin stats.', 500);
  }
}

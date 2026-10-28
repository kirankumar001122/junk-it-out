import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { getAdminAuthorizationStatus, getAuthUser } from '@/lib/auth/middleware';
import { successResponse, errorResponse } from '@/lib/utils/apiResponse';

let cachedStats: { payload: any; expiresAt: number } | null = null;
const STATS_CACHE_TTL_MS = 10_000;

export function invalidateAdminStatsCache() {
  cachedStats = null;
}

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
    if (!bypassCache && cachedStats && Date.now() < cachedStats.expiresAt) {
      const res = successResponse(cachedStats.payload);
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

    // Grouped queries to prevent connection pool exhaustion on remote PgBouncer connections
    const orderStatusGroups = await db.order.groupBy({
      by: ['status'],
      _count: { _all: true },
    }).catch(() => [] as Array<{ status: any; _count: { _all: number } }>);

    const agentStatusGroups = await db.agent.groupBy({
      by: ['status'],
      _count: { _all: true },
    }).catch(() => [] as Array<{ status: any; _count: { _all: number } }>);

    const settlementGroups = await db.settlement.groupBy({
      by: ['status'],
      _sum: { amount: true },
    }).catch(() => [] as Array<{ status: any; _sum: { amount: number | null } }>);

    const todaysBookings = await db.order.count({
      where: { createdAt: { gte: startOfDay, lte: endOfDay } },
    }).catch(() => 0);

    const unassignedPickups = await db.order.count({
      where: { agentId: null, status: { in: ['BOOKING_RECEIVED', 'AGENT_BEING_ASSIGNED', 'AGENT_ASSIGNED'] } },
    }).catch(() => 0);

    const customerCount = await db.customer.count().catch(() => 0);

    const paymentRevenueAgg = await db.payment.aggregate({
      _sum: { amount: true },
      where: { status: { in: ['CAPTURED', 'SETTLEMENT_COMPLETED'] } },
    }).catch(() => ({ _sum: { amount: 0 } }));

    const totalWeightKg = await db.orderItem.aggregate({
      _sum: { actualWeight: true },
      where: { actualWeight: { not: null } },
    }).catch(() => ({ _sum: { actualWeight: 0 } }));

    const completedOrdersDates = await db.order.findMany({
      where: { status: { in: ['PICKUP_COMPLETED', 'SETTLEMENT_COMPLETED'] } },
      select: { createdAt: true, updatedAt: true },
      take: 200,
    }).catch(() => [] as Array<{ createdAt: Date; updatedAt: Date }>);

    // Aggregate order status metrics
    let totalBookings = 0;
    let pendingBookings = 0;
    let activePickups = 0;
    let completedPickups = 0;
    let cancelledOrders = 0;

    for (const group of orderStatusGroups) {
      const count = group._count._all;
      totalBookings += count;
      if (['BOOKING_RECEIVED', 'AGENT_BEING_ASSIGNED', 'AGENT_ASSIGNED'].includes(group.status)) {
        pendingBookings += count;
      }
      if (['AGENT_ASSIGNED', 'AGENT_ON_WAY', 'AGENT_ARRIVED', 'WASTE_VERIFICATION', 'WEIGHING'].includes(group.status)) {
        activePickups += count;
      }
      if (['PICKUP_COMPLETED', 'SETTLEMENT_COMPLETED'].includes(group.status)) {
        completedPickups += count;
      }
      if (group.status === 'CANCELLED') {
        cancelledOrders += count;
      }
    }

    // Aggregate agent status metrics
    let totalAgents = 0;
    let availableAgents = 0;
    let activeAgents = 0;

    for (const group of agentStatusGroups) {
      const count = group._count._all;
      totalAgents += count;
      if (group.status === 'AVAILABLE') {
        availableAgents += count;
      }
      if (['AVAILABLE', 'ASSIGNED', 'EN_ROUTE', 'ARRIVED'].includes(group.status)) {
        activeAgents += count;
      }
    }

    // Aggregate settlement payout metrics
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

    const assignedPickups = Math.max(0, totalBookings - unassignedPickups);
    const totalRevenue = Number((paymentRevenueAgg._sum?.amount || 0).toFixed(2));
    const totalCustomerSettlements = Number((approvedCustomerPayouts + paidCustomerPayouts + pendingCustomerPayouts).toFixed(2));
    const totalCustomerPayouts = paidCustomerPayouts > 0 ? paidCustomerPayouts : totalCustomerSettlements;

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
      totalWeightKg: Number((totalWeightKg._sum?.actualWeight || 0).toFixed(1)),
      cancelledOrders,
      slaTargetMins: 30,
      slaOnTimeRate,
    };

    if (!bypassCache) {
      cachedStats = {
        payload,
        expiresAt: Date.now() + STATS_CACHE_TTL_MS,
      };
    }

    const res = successResponse(payload);
    res.headers.set('Cache-Control', 'private, max-age=10');
    res.headers.set('X-Cache', 'MISS');
    return res;
  } catch (error: any) {
    return errorResponse('INTERNAL_SERVER_ERROR', error.message || 'Failed to fetch admin stats.', 500);
  }
}

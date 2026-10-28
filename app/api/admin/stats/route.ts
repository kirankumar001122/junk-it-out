import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { getAuthUser, requireAdminUser } from '@/lib/auth/middleware';
import { successResponse, errorResponse } from '@/lib/utils/apiResponse';

let cachedStats: { payload: any; expiresAt: number } | null = null;
const STATS_CACHE_TTL_MS = 5_000;

export function invalidateAdminStatsCache() {
  cachedStats = null;
}

export async function GET(req: NextRequest) {
  try {
    const authUser = await getAuthUser(req);
    const adminUser = requireAdminUser(authUser);

    if (!adminUser) {
      return errorResponse('FORBIDDEN', 'Admin access required.', 403);
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

    // Short-lived in-memory cache (5 seconds) to absorb concurrent admin polling bursts
    const bypassCache = req.headers.get('cache-control') === 'no-cache' || process.env.NODE_ENV === 'test';
    if (!bypassCache && cachedStats && Date.now() < cachedStats.expiresAt) {
      const res = successResponse(cachedStats.payload);
      res.headers.set('Cache-Control', 'private, max-age=5');
      res.headers.set('X-Cache', 'HIT');
      return res;
    }

    const [
      totalBookings,
      todaysBookings,
      pendingBookings,
      activePickups,
      completedPickups,
      assignedPickups,
      unassignedPickups,
      activeAgents,
      customerCount,
      paymentRevenueAgg,
      approvedSettlementsAgg,
      paidSettlementsAgg,
      pendingSettlementsAgg,
      totalAgents,
      availableAgents,
      totalWeightKg,
      cancelledOrders,
      completedOrders,
    ] = await Promise.all([
      db.order.count(),
      db.order.count({ where: { createdAt: { gte: startOfDay, lte: endOfDay } } }),
      db.order.count({ where: { status: { in: ['BOOKING_RECEIVED', 'AGENT_BEING_ASSIGNED', 'AGENT_ASSIGNED'] } } }),
      db.order.count({ where: { status: { in: ['AGENT_ASSIGNED', 'AGENT_ON_WAY', 'AGENT_ARRIVED', 'WASTE_VERIFICATION', 'WEIGHING'] } } }),
      db.order.count({ where: { status: { in: ['PICKUP_COMPLETED', 'SETTLEMENT_COMPLETED'] } } }),
      db.order.count({ where: { agentId: { not: null }, status: { in: ['AGENT_ASSIGNED', 'AGENT_ON_WAY', 'AGENT_ARRIVED', 'WASTE_VERIFICATION', 'WEIGHING', 'PICKUP_COMPLETED'] } } }),
      db.order.count({ where: { agentId: null, status: { in: ['BOOKING_RECEIVED', 'AGENT_BEING_ASSIGNED', 'AGENT_ASSIGNED'] } } }),
      db.agent.count({ where: { status: { in: ['AVAILABLE', 'ASSIGNED', 'EN_ROUTE', 'ARRIVED'] } } }),
      db.customer.count(),
      db.payment.aggregate({
        _sum: { amount: true },
        where: {
          status: { in: ['CAPTURED', 'SETTLEMENT_COMPLETED'] },
        },
      }),
      db.settlement.aggregate({
        _sum: { amount: true },
        where: {
          status: { in: ['APPROVED', 'READY_FOR_PAYOUT'] },
        },
      }),
      db.settlement.aggregate({
        _sum: { amount: true },
        where: {
          status: { in: ['PAID', 'SETTLEMENT_COMPLETED'] },
        },
      }),
      db.settlement.aggregate({
        _sum: { amount: true },
        where: {
          status: 'PENDING',
        },
      }),
      db.agent.count(),
      db.agent.count({ where: { status: 'AVAILABLE' } }),
      db.orderItem.aggregate({
        _sum: { actualWeight: true },
        where: { actualWeight: { not: null } },
      }),
      db.order.count({ where: { status: 'CANCELLED' } }),
      db.order.findMany({
        where: {
          status: { in: ['PICKUP_COMPLETED', 'SETTLEMENT_COMPLETED'] },
          updatedAt: { gte: slaWindowStart },
        },
        select: { createdAt: true, updatedAt: true },
        take: 10000,
      }),
    ]);

    const totalRevenue = Number((paymentRevenueAgg._sum?.amount || 0).toFixed(2));
    const approvedCustomerPayouts = Number((approvedSettlementsAgg._sum?.amount || 0).toFixed(2));
    const paidCustomerPayouts = Number((paidSettlementsAgg._sum?.amount || 0).toFixed(2));
    const pendingCustomerPayouts = Number((pendingSettlementsAgg._sum?.amount || 0).toFixed(2));
    const totalCustomerPayouts = paidCustomerPayouts;

    const onTimeCount = completedOrders.filter((order) => {
      const diffMinutes = (order.updatedAt.getTime() - order.createdAt.getTime()) / (1000 * 60);
      return diffMinutes <= 30;
    }).length;

    const slaOnTimeRate = completedOrders.length > 0 ? Number(((onTimeCount / completedOrders.length) * 100).toFixed(1)) : 0;

    const payload = {
      totalBookings,
      todaysBookings,
      pendingBookings,
      activePickups,
      completedPickups,
      assignedPickups,
      unassignedPickups,
      activeAgents,
      customers: customerCount,
      totalRevenue,
      totalCustomerPayouts,
      paidCustomerPayouts,
      approvedCustomerPayouts,
      pendingCustomerPayouts,
      totalCustomerSettlements: Number((approvedCustomerPayouts + paidCustomerPayouts).toFixed(2)),
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
    res.headers.set('Cache-Control', 'private, max-age=5');
    res.headers.set('X-Cache', 'MISS');
    return res;
  } catch (error: any) {
    return errorResponse('INTERNAL_SERVER_ERROR', error.message || 'Failed to fetch admin stats.', 500);
  }
}

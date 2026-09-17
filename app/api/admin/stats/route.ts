import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { getAuthUser, requireAdminUser } from '@/lib/auth/middleware';
import { successResponse, errorResponse } from '@/lib/utils/apiResponse';

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
      paymentRecords,
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
      db.payment.findMany({
        where: { status: { in: ['CAPTURED', 'SETTLEMENT_COMPLETED'] } },
        select: { amount: true },
      }),
    ]);

    const totalRevenue = paymentRecords.reduce((sum, payment) => sum + Number(payment.amount || 0), 0);

    const completedOrders = await db.order.findMany({
      where: { status: { in: ['PICKUP_COMPLETED', 'SETTLEMENT_COMPLETED'] } },
      select: { createdAt: true, updatedAt: true },
    });

    const onTimeCount = completedOrders.filter((order) => {
      const diffMinutes = (order.updatedAt.getTime() - order.createdAt.getTime()) / (1000 * 60);
      return diffMinutes <= 30;
    }).length;

    const slaOnTimeRate = completedOrders.length > 0 ? Number(((onTimeCount / completedOrders.length) * 100).toFixed(1)) : 0;

    const totalWeightKg = await db.orderItem.aggregate({
      _sum: { actualWeight: true },
      where: { actualWeight: { not: null } },
    });

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
      totalCustomerPayouts: totalRevenue,
      totalOrders: totalBookings,
      activeOrders: activePickups,
      totalAgents: await db.agent.count(),
      availableAgents: await db.agent.count({ where: { status: 'AVAILABLE' } }),
      totalWeightKg: Number((totalWeightKg._sum.actualWeight || 0).toFixed(1)),
      cancelledOrders: await db.order.count({ where: { status: 'CANCELLED' } }),
      slaTargetMins: 30,
      slaOnTimeRate,
    };

    return successResponse(payload);
  } catch (error: any) {
    return errorResponse('INTERNAL_SERVER_ERROR', error.message || 'Failed to fetch admin stats.', 500);
  }
}

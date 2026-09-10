import { db } from '../db';

export async function getActiveAgents(serviceAreaName?: string) {
  const agents = await db.agent.findMany({
    include: {
      user: true,
      orders: {
        where: {
          status: { in: ['AGENT_ASSIGNED', 'AGENT_ACCEPTED', 'AGENT_ON_WAY', 'AGENT_ARRIVED', 'WEIGHING'] },
        },
      },
    },
    orderBy: { rating: 'desc' },
  });

  return agents.map((agent) => ({
    id: agent.id,
    userId: agent.userId,
    name: agent.user.name,
    phone: agent.user.phone,
    vehicleType: agent.vehicleType,
    vehicleNumber: agent.vehicleNumber,
    status: agent.status,
    currentLat: agent.currentLat,
    currentLng: agent.currentLng,
    rating: agent.rating,
    serviceAreas: agent.serviceAreas,
    activeOrdersCount: agent.orders.length,
    isAvailable: agent.status === 'AVAILABLE' || agent.status === 'OFFLINE',
  }));
}

export async function getAgentActiveOrder(agentId: string) {
  return db.order.findFirst({
    where: {
      agentId,
      status: { in: ['AGENT_ASSIGNED', 'AGENT_ACCEPTED', 'AGENT_ON_WAY', 'AGENT_ARRIVED', 'WEIGHING'] },
    },
    include: {
      customer: { include: { user: true } },
      address: true,
      items: { include: { category: true } },
      statusHistory: { orderBy: { timestamp: 'desc' } },
      weightRecords: { orderBy: { createdAt: 'desc' }, take: 1 },
    },
    orderBy: { createdAt: 'desc' },
  });
}

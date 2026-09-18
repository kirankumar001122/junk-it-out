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

export async function findEligibleAgentsForServiceArea(serviceAreaName?: string) {
  try {
    const availableAgents = await db.agent.findMany({
      where: {
        status: 'AVAILABLE',
      },
      include: {
        user: true,
      },
    });

    if (!serviceAreaName) {
      return availableAgents;
    }

    const normalizedAreaName = serviceAreaName.toLowerCase();

    // Filter agents whose serviceAreas string covers the requested area
    const eligibleAgents = availableAgents.filter((agent) => {
      if (!agent.serviceAreas || agent.serviceAreas.trim() === '') {
        return true; // Agent covers all zones if unspecified
      }
      const agentAreas = agent.serviceAreas.toLowerCase().split(',').map((a) => a.trim());
      return agentAreas.some((area) => normalizedAreaName.includes(area) || area.includes(normalizedAreaName));
    });

    return eligibleAgents.length > 0 ? eligibleAgents : availableAgents;
  } catch (err) {
    console.error('Failed to query eligible agents for service area:', err);
    return [];
  }
}


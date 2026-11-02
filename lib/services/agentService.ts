import { persistAgentBookingNotificationOnce } from './agentBookingNotification';
import { db } from '../db';

export async function getActiveAgents(serviceAreaName?: string) {
  const agents = await db.agent.findMany({
    select: {
      id: true,
      userId: true,
      vehicleType: true,
      vehicleNumber: true,
      status: true,
      currentLat: true,
      currentLng: true,
      rating: true,
      serviceAreas: true,
      user: {
        select: {
          id: true,
          name: true,
          phone: true,
        },
      },
      _count: {
        select: {
          orders: {
            where: {
              status: { in: ['AGENT_ASSIGNED', 'AGENT_ACCEPTED', 'AGENT_ON_WAY', 'AGENT_ARRIVED', 'WASTE_VERIFICATION', 'WEIGHING'] },
            },
          },
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
    activeOrdersCount: (agent as any)._count?.orders ?? (agent as any).orders?.length ?? 0,
    isAvailable: agent.status === 'AVAILABLE' || agent.status === 'OFFLINE',
  }));
}

export async function getAgentActiveOrder(agentId: string) {
  return db.order.findFirst({
    where: {
      agentId,
      status: { in: ['AGENT_ASSIGNED', 'AGENT_ACCEPTED', 'AGENT_ON_WAY', 'AGENT_ARRIVED', 'WASTE_VERIFICATION', 'WEIGHING'] },
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
      select: {
        id: true,
        userId: true,
        vehicleType: true,
        vehicleNumber: true,
        status: true,
        currentLat: true,
        currentLng: true,
        rating: true,
        serviceAreas: true,
        locations: {
          orderBy: { timestamp: 'desc' },
          take: 1,
          select: { lat: true, lng: true, timestamp: true },
        },
        user: {
          select: {
            id: true,
            name: true,
            phone: true,
          },
        },
      },
    });

    if (!serviceAreaName) {
      return availableAgents;
    }

    return filterAvailableEligibleAgents(availableAgents, serviceAreaName);
  } catch (err) {
    console.error('Failed to query eligible agents for service area:', err);
    return [];
  }
}

export function isAgentEligibleForServiceArea(
  serviceAreas: string | null | undefined,
  serviceAreaName?: string,
) {
  if (!serviceAreaName || !serviceAreas || serviceAreas.trim() === '' || serviceAreas.trim().toLowerCase() === 'all') return true;

  const normalizedAreaName = serviceAreaName.toLowerCase();
  const agentAreas = serviceAreas.toLowerCase().split(',').map((area) => area.trim()).filter(Boolean);
  return agentAreas.some((area) =>
    normalizedAreaName.includes(area) || area.includes(normalizedAreaName),
  );
}

export function filterAvailableEligibleAgents<
  T extends { status: string; serviceAreas?: string | null },
>(agents: T[], serviceAreaName?: string) {
  return agents.filter((agent) =>
    agent.status === 'AVAILABLE' &&
    isAgentEligibleForServiceArea(agent.serviceAreas, serviceAreaName),
  );
}

export const MAX_AGENT_LOCATION_AGE_MS = 15 * 60_000;

export function haversineDistanceMeters(
  from: { lat: number; lng: number },
  to: { lat: number; lng: number },
) {
  const radians = (degrees: number) => degrees * Math.PI / 180;
  const latDelta = radians(to.lat - from.lat);
  const lngDelta = radians(to.lng - from.lng);
  const a = Math.min(1, Math.sin(latDelta / 2) ** 2 +
    Math.cos(radians(from.lat)) * Math.cos(radians(to.lat)) * Math.sin(lngDelta / 2) ** 2);
  return 6_371_000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function validCoordinates(lat: unknown, lng: unknown): lat is number {
  return typeof lat === 'number' && Number.isFinite(lat) && lat >= -90 && lat <= 90 &&
    typeof lng === 'number' && Number.isFinite(lng) && lng >= -180 && lng <= 180;
}

export function selectNearestEligibleAgent<
  T extends {
    id: string;
    status: string;
    serviceAreas?: string | null;
    locations?: Array<{ lat: number; lng: number; timestamp: Date | string }>;
  },
>(
  agents: T[],
  pickup: { lat: number; lng: number } | null | undefined,
  serviceAreaName?: string,
  now = Date.now(),
) {
  if (!pickup || !validCoordinates(pickup.lat, pickup.lng)) return null;

  return agents
    .filter((agent) => agent.status === 'AVAILABLE' && isAgentEligibleForServiceArea(agent.serviceAreas, serviceAreaName))
    .flatMap((agent) => {
      const location = agent.locations?.[0];
      if (!location || !validCoordinates(location.lat, location.lng)) return [];
      const timestamp = location.timestamp instanceof Date ? location.timestamp.getTime() : new Date(location.timestamp).getTime();
      if (!Number.isFinite(timestamp) || timestamp > now || now - timestamp > MAX_AGENT_LOCATION_AGE_MS) return [];
      return [{ agent, distance: haversineDistanceMeters(pickup, location) }];
    })
    .sort((a, b) => a.distance - b.distance || (a.agent.id < b.agent.id ? -1 : a.agent.id > b.agent.id ? 1 : 0))[0]?.agent ?? null;
}


export const SAFE_HYDRATED_ORDER_INCLUDE = {
  agent: {
    include: {
      user: {
        select: {
          id: true,
          name: true,
          phone: true,
        },
      },
    },
  },
  customer: {
    include: {
      user: {
        select: {
          id: true,
          name: true,
          phone: true,
        },
      },
    },
  },
  address: true,
  items: {
    include: {
      category: true,
    },
  },
};

export interface ExecuteAgentAcceptParams {
  order: {
    id: string;
    orderNumber: string;
    agentId?: string | null;
    status: string;
    financialDirection?: string | null;
    paymentStatus?: string | null;
  };
  agentId: string;
  agentName?: string;
  vehicleNumber?: string;
  agentUserId?: string;
  userId?: string | null;
}

export type ExecuteAgentAcceptResult =
  | { changed: true; alreadyAssignedToAgent: true; order: any; notificationCreated: boolean; reason?: undefined }
  | { changed: false; reason: 'activeAssignment' | 'agentUnavailable' | 'agentSuspended' | 'orderChanged'; alreadyAssignedToAgent: boolean; order: any | null; notificationCreated: false };

export async function executeAgentAcceptTransaction(
  client: any,
  params: ExecuteAgentAcceptParams,
): Promise<ExecuteAgentAcceptResult> {
  const { order, agentId, agentName, vehicleNumber, agentUserId, userId } = params;

  const runWithTx = async (tx: any): Promise<ExecuteAgentAcceptResult> => {
    let agentRowStatus: string | undefined;
    try {
      const lockedRows = await tx.$queryRaw`SELECT "id", "status" FROM "Agent" WHERE "id" = ${agentId} FOR UPDATE` as any[];
      if (Array.isArray(lockedRows) && lockedRows.length > 0) {
        agentRowStatus = lockedRows[0].status;
      }
    } catch {
      // Fallback if raw query is not supported by mock or provider
    }

    const activeOrder = await tx.order.findFirst({
      where: {
        agentId,
        status: { in: ['AGENT_ASSIGNED', 'AGENT_ACCEPTED', 'AGENT_ON_WAY', 'AGENT_ARRIVED', 'WASTE_VERIFICATION', 'WEIGHING'] },
      },
      select: { id: true },
    });
    if (activeOrder && activeOrder.id !== order.id) {
      return {
        changed: false,
        reason: 'activeAssignment',
        alreadyAssignedToAgent: false,
        order: null,
        notificationCreated: false,
      };
    }

    if (
      order.agentId === agentId &&
      !['BOOKING_RECEIVED', 'AGENT_BEING_ASSIGNED', 'AGENT_ASSIGNED'].includes(order.status)
    ) {
      const existingOrder = await tx.order.findUnique({
        where: { id: order.id },
        include: SAFE_HYDRATED_ORDER_INCLUDE,
      });
      return {
        changed: false,
        reason: 'orderChanged',
        alreadyAssignedToAgent: existingOrder?.agentId === agentId,
        order: existingOrder,
        notificationCreated: false,
      };
    }

    const currentAgentStatus = agentRowStatus ?? (await tx.agent.findUnique({
      where: { id: agentId },
      select: { id: true, status: true },
    }))?.status;

    if (!currentAgentStatus) {
      return {
        changed: false,
        reason: 'agentUnavailable',
        alreadyAssignedToAgent: false,
        order: null,
        notificationCreated: false,
      };
    }
    if (currentAgentStatus === 'SUSPENDED' || currentAgentStatus === 'DEACTIVATED') {
      return {
        changed: false,
        reason: 'agentSuspended',
        alreadyAssignedToAgent: false,
        order: null,
        notificationCreated: false,
      };
    }
    const canAcceptAssignedOrder =
      currentAgentStatus === 'ASSIGNED' &&
      (order.agentId === agentId || activeOrder?.id === order.id);
    if (currentAgentStatus !== 'AVAILABLE' && !canAcceptAssignedOrder) {
      return {
        changed: false,
        reason: currentAgentStatus === 'ASSIGNED' ? 'activeAssignment' : 'agentUnavailable',
        alreadyAssignedToAgent: false,
        order: null,
        notificationCreated: false,
      };
    }

    const updateResult = await tx.order.updateMany({
      where: {
        id: order.id,
        OR: [
          { agentId: null, status: { in: ['BOOKING_RECEIVED', 'AGENT_BEING_ASSIGNED', 'AGENT_ASSIGNED'] } },
          { agentId, status: { in: ['BOOKING_RECEIVED', 'AGENT_BEING_ASSIGNED', 'AGENT_ASSIGNED'] } },
        ],
        ...(order.financialDirection === 'CUSTOMER_PAYS' ? { paymentStatus: 'CAPTURED' } : {}),
      },
      data: { agentId, status: 'AGENT_ACCEPTED' },
    });

    if (updateResult.count === 0) {
      const recheckOrder = await tx.order.findUnique({
        where: { id: order.id },
        include: SAFE_HYDRATED_ORDER_INCLUDE,
      });
      return {
        changed: false,
        reason: 'orderChanged',
        alreadyAssignedToAgent: recheckOrder?.agentId === agentId,
        order: recheckOrder,
        notificationCreated: false,
      };
    }

    const [, , notificationCreated] = await Promise.all([
      tx.orderStatusHistory.create({
        data: {
          orderId: order.id,
          oldStatus: order.status,
          newStatus: 'AGENT_ACCEPTED',
          changedByUserId: userId || null,
          notes: `Pickup accepted by field agent ${agentName || 'Agent'} (${vehicleNumber || 'Vehicle'}).`,
        },
      }),
      tx.agent.update({
        where: { id: agentId },
        data: { status: 'ASSIGNED' },
      }),
      (order.financialDirection !== 'CUSTOMER_PAYS' || order.paymentStatus === 'CAPTURED')
        ? persistAgentBookingNotificationOnce(tx, {
            orderId: order.id,
            orderNumber: order.orderNumber,
            agentId,
            agentUserId: agentUserId || '',
            status: 'AGENT_ACCEPTED',
          })
        : Promise.resolve(false),
    ]);

    const updatedOrder = await tx.order.findUnique({
      where: { id: order.id },
      include: SAFE_HYDRATED_ORDER_INCLUDE,
    });

    return {
      changed: true,
      alreadyAssignedToAgent: true,
      order: updatedOrder,
      notificationCreated: Boolean(notificationCreated),
    };
  };

  if (typeof client.$transaction === 'function') {
    return client.$transaction(runWithTx, {
      maxWait: 10000,
      timeout: 25000,
    });
  }
  return runWithTx(client);
}

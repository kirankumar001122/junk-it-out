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


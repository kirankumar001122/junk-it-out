import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { getAuthUser } from "@/lib/auth/middleware";
import { broadcaster } from "@/lib/realtime";
import { validateCoordinates } from "@/lib/validations/schemas";
import { successResponse, errorResponse } from "@/lib/utils/apiResponse";

const ACTIVE_TRACKING_STATUSES = [
  "AGENT_ASSIGNED",
  "AGENT_ACCEPTED",
  "AGENT_ON_WAY",
  "AGENT_ARRIVED",
  "WASTE_VERIFICATION",
  "WEIGHING",
];

export async function POST(req: NextRequest) {
  const startedAt = Date.now();
  const diagnosticId = Math.random().toString(36).slice(2, 9);
  const log = (phase: string) =>
    console.info(`[api/agent/location:${diagnosticId}] ${phase} elapsedMs=${Date.now() - startedAt}`);
  log('request start');
  try {
    log('authentication start');
    const authUser = await getAuthUser(req);
    log(`authentication complete role=${authUser?.role || 'none'} agentSession=${Boolean(authUser?.agentId)}`);
    if (!authUser || authUser.role !== "AGENT" || !authUser.userId) {
      log('returning 401');
      return errorResponse(
        "UNAUTHORIZED",
        "Authenticated agent access is required.",
        401,
      );
    }

    // Older signed agent sessions may not contain the agentId claim. Resolve
    // that legacy case only through the authenticated user's agent profile;
    // never trust an agent ID supplied by the request body.
    let targetAgentId = authUser.agentId;
    if (!targetAgentId) {
      log('legacy agent profile lookup start');
      const agentProfile = await db.agent.findUnique({
        where: { userId: authUser.userId },
        select: { id: true },
      });
      targetAgentId = agentProfile?.id;
      log(`legacy agent profile lookup complete found=${Boolean(targetAgentId)}`);
    }

    if (!targetAgentId) {
      log('returning 401 agent profile missing');
      return errorResponse(
        "UNAUTHORIZED",
        "Authenticated agent access is required.",
        401,
      );
    }

    const body = await req.json().catch(() => ({}));
    const { orderId, lat, lng, speed = 0.0 } = body;

    if (!validateCoordinates(lat, lng)) {
      log('returning 400 invalid coordinates');
      return errorResponse(
        "INVALID_COORDINATES",
        "Valid latitude and longitude coordinates required.",
        400,
      );
    }

    const latitude = Number(lat);
    const longitude = Number(lng);
    const parsedSpeed = Number(speed);
    if (!Number.isFinite(parsedSpeed) || parsedSpeed < 0) {
      log('returning 400 invalid speed');
      return errorResponse("INVALID_SPEED", "Speed must be a non-negative number.", 400);
    }

    log('transaction start');
    const result = await db.$transaction(async (tx) => {
      // Recheck assignment in the same transaction as persistence so a stale
      // assignment cannot attach a GPS point to a reassigned order.
      log('active assignment query start');
      const order = await tx.order.findFirst({
        where: orderId
          ? { id: String(orderId), agentId: targetAgentId, status: { in: ACTIVE_TRACKING_STATUSES } }
          : { agentId: targetAgentId, status: { in: ACTIVE_TRACKING_STATUSES } },
        orderBy: { updatedAt: "desc" },
        select: { id: true },
      });
      log(`active assignment query complete found=${Boolean(order)}`);
      if (!order) return null;

      log('previous location query start');
      const previous = await tx.agentLocation.findFirst({
        where: { agentId: targetAgentId, orderId: order.id },
        orderBy: { timestamp: "desc" },
      });
      log(`previous location query complete found=${Boolean(previous)}`);
      const duplicate = previous?.lat === latitude && previous?.lng === longitude &&
        Date.now() - previous.timestamp.getTime() < 15_000;

      log('agent coordinate update start');
      const agent = await tx.agent.update({
        where: { id: targetAgentId },
        data: { currentLat: latitude, currentLng: longitude },
        include: { user: true },
      });
      log('agent coordinate update complete');
      if (!duplicate) log('location record insert start');
      const locRecord = duplicate ? previous : await tx.agentLocation.create({
        data: { agentId: targetAgentId, orderId: order.id, lat: latitude, lng: longitude, speed: parsedSpeed },
      });
      if (!duplicate) log('location record insert complete');
      return { order, agent, locRecord, duplicate };
    }, { isolationLevel: "Serializable", maxWait: 5_000, timeout: 10_000 });
    log(`transaction complete assignedActiveOrder=${Boolean(result)}`);

    if (!result) {
      log('returning 409 no matching active assignment');
      return errorResponse("ACTIVE_ORDER_NOT_FOUND", "Location can only be shared for an active order assigned to this agent.", 409);
    }
    const { order, agent, locRecord, duplicate } = result;

    const payload = {
      agentId: targetAgentId,
      agentName: agent.user.name,
      vehicleNumber: agent.vehicleNumber,
      status: agent.status,
      orderId: order.id,
      lat: latitude,
      lng: longitude,
      timestamp: locRecord.timestamp,
    };
    if (!duplicate) {
      log('AGENT_LOCATION_UPDATED broadcast start');
      broadcaster.broadcast("AGENT_LOCATION_UPDATED", payload);
      log('AGENT_LOCATION_UPDATED broadcast complete');
    } else {
      log('AGENT_LOCATION_UPDATED broadcast skipped for duplicate fix');
    }

    log(`returning 200 duplicate=${duplicate} coordinatesIncluded=true`);
    return successResponse({
      id: locRecord.id,
      agentId: targetAgentId,
      orderId: order.id,
      lat: latitude,
      lng: longitude,
      speed: parsedSpeed,
      timestamp: locRecord.timestamp,
      duplicate,
    });
  } catch (err: any) {
    log(`request failed error=${err?.code || err?.name || 'unknown'}`);
    console.error("Update agent location error:", err);
    if (err?.code === "P2034") {
      log('returning 409 serialization conflict');
      return errorResponse(
        "ORDER_ASSIGNMENT_CHANGED",
        "The order assignment changed while the location update was being saved. Retry the update.",
        409,
      );
    }
    if (err?.code === "P2028") {
      log('returning 503 transaction timeout');
      return errorResponse(
        "LOCATION_UPDATE_TIMEOUT",
        "The location update could not finish in time. Retry shortly.",
        503,
      );
    }
    return errorResponse(
      "INTERNAL_SERVER_ERROR",
      "Failed to update agent location.",
      500,
    );
  }
}

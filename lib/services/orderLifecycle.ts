import { Prisma } from "@prisma/client";
import { db } from "../db";
import { validateStatusTransition } from "../validations/schemas";

export class InvalidOrderTransitionError extends Error {
  constructor(fromStatus: string, toStatus: string) {
    super(`Invalid order status transition from ${fromStatus} to ${toStatus}.`);
    this.name = "InvalidOrderTransitionError";
  }
}

export type OrderTransitionResult<T> =
  | { changed: false; order: null }
  | { changed: true; order: T };

type TransitionOptions<T> = {
  orderId: string;
  expectedStatus: string;
  expectedAgentId?: string | null;
  newStatus: string;
  additionalWhere?: Prisma.OrderWhereInput;
  changedByUserId?: string | null;
  notes?: string | null;
  orderData?: Prisma.OrderUncheckedUpdateManyInput;
  include?: Prisma.OrderInclude;
  afterHistory?: (tx: Prisma.TransactionClient) => Promise<void>;
};

/**
 * Performs one guarded lifecycle transition. The compare-and-set update,
 * history record, and caller-supplied side effects commit or roll back as one.
 */
export async function transitionOrder<T = unknown>(
  options: TransitionOptions<T>,
): Promise<OrderTransitionResult<T>> {
  const {
    orderId,
    expectedStatus,
    expectedAgentId,
    newStatus,
    additionalWhere = {},
    changedByUserId = null,
    notes = null,
    orderData = {},
    include,
    afterHistory,
  } = options;

  if (!validateStatusTransition(expectedStatus, newStatus)) {
    throw new InvalidOrderTransitionError(expectedStatus, newStatus);
  }

  try {
    return await db.$transaction(async (tx) => {
      const changed = await tx.order.updateMany({
        where: {
          ...additionalWhere,
          id: orderId,
          status: expectedStatus,
          ...(expectedAgentId !== undefined ? { agentId: expectedAgentId } : {}),
        },
        data: { ...orderData, status: newStatus },
      });

      if (changed.count !== 1) return { changed: false, order: null };

      await tx.orderStatusHistory.create({
        data: {
          orderId,
          oldStatus: expectedStatus,
          newStatus,
          changedByUserId,
          notes,
        },
      });

      if (afterHistory) await afterHistory(tx);

      const order = await tx.order.findUnique({
        where: { id: orderId },
        ...(include ? { include } : {}),
      });

      return { changed: true, order: order as T };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  } catch (error: any) {
    if (error?.code === "P2034") return { changed: false, order: null };
    throw error;
  }
}

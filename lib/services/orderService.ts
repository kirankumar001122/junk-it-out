import { db } from '../db';
import {
  findOrCreateUserCustomer,
  saveCustomerAddress,
} from './customerService';
import { checkGeofenceServiceability } from './serviceAreaService';
import {
  validateAndCalculateCoupon,
  InvalidCouponError,
} from './couponService';
import { calculateTotalBookingWeight } from '../validations/schemas';

export { InvalidCouponError };

export class OrderIdempotencyConflictError extends Error {
  constructor(
    message = 'Idempotency key was already used for a different booking request.'
  ) {
    super(message);
    this.name = 'OrderIdempotencyConflictError';
  }
}

export class InvalidWasteCategoryError extends Error {
  constructor(message = 'One or more selected waste categories are unavailable.') {
    super(message);
    this.name = 'InvalidWasteCategoryError';
  }
}

export class InvalidBookingWeightError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidBookingWeightError';
  }
}

export class InvalidIdempotencyKeyError extends Error {
  constructor() {
    super('Idempotency-Key must be 10-128 characters using letters, numbers, "_" or "-".');
    this.name = 'InvalidIdempotencyKeyError';
  }
}

export function normalizeOrderIdempotencyKey(key?: string | null) {
  if (key == null || key.trim() === '') return null;
  const normalized = key.trim();
  if (!/^[A-Za-z0-9_-]{10,128}$/.test(normalized)) {
    throw new InvalidIdempotencyKeyError();
  }
  return normalized;
}

export function createOrderPayloadHash(input: any): string {
  const normItems = (input.items || [])
    .map((item: any) => ({
      categoryId: String(item.categoryId || ''),
      estimatedWeight: Number(item.estimatedWeight) || 0,
    }))
    .sort((a: any, b: any) => a.categoryId.localeCompare(b.categoryId));

  const canonical = {
    phone: String(input.phone || '').replace(/\D/g, ''),
    area: String(input.address?.area || '').trim().toLowerCase(),
    houseNo: String(input.address?.houseNo || '').trim().toLowerCase(),
    street: String(input.address?.street || '').trim().toLowerCase(),
    pincode: String(input.address?.pincode || '').trim(),
    lat: Number(input.address?.lat) || 0,
    lng: Number(input.address?.lng) || 0,
    items: normItems,
    pickupType: input.pickupType || 'ASAP',
    scheduledSlot: input.scheduledSlot || null,
    notes: String(input.notes || '').trim(),
    financialDirection: input.financialDirection || 'CUSTOMER_PAYS',
    couponCode: String(input.couponCode || '').trim().toUpperCase(),
  };

  return JSON.stringify(canonical);
}

// In-memory Idempotency Store to prevent duplicate order placements
// on network retries.
const idempotencyStore = new Map<
  string,
  {
    orderId: string;
    responseData: any;
    timestamp: number;
    payloadHash?: string;
  }
>();

const IDEMPOTENCY_TTL_MS = 24 * 60 * 60 * 1000;

export function generateOrderNumber(): string {
  const dateStr = new Date()
    .toISOString()
    .slice(0, 10)
    .replace(/-/g, '');

  const randomHex = Math.random()
    .toString(36)
    .substring(2, 8)
    .toUpperCase();

  return `JIO-${dateStr}-${randomHex}`;
}

export async function createOrder(
  input: {
    phone: string;
    name: string;

    address: {
      label?: string;
      houseNo: string;
      building?: string;
      street: string;
      area: string;
      landmark?: string;
      pincode: string;
      lat: number;
      lng: number;
      googlePlaceId?: string | null;
    };

    items: {
      categoryId: string;
      estimatedWeight: number;
    }[];

    pickupType?: 'ASAP' | 'SCHEDULED';
    scheduledSlot?: string | null;
    couponCode?: string | null;
    photos?: string[];
    notes?: string;
    financialDirection?:
      | 'CUSTOMER_PAYS'
      | 'JUNKITOUT_PAYS';
  },

  idempotencyKey?: string | null,

  authUser?: {
    userId: string;
    customerId?: string | null;
  } | null
) {
  // ---------------------------------------------------------
  // 1. IDEMPOTENCY CHECK
  // ---------------------------------------------------------

  const payloadHash = createOrderPayloadHash(input);
  const normalizedIdempotencyKey = normalizeOrderIdempotencyKey(idempotencyKey);
  const customerId = authUser?.customerId;
  const durableIdempotency = (db as any).orderIdempotency;
  let durableIdempotencyAvailable = Boolean(durableIdempotency);

  if (normalizedIdempotencyKey && customerId && durableIdempotencyAvailable) {
    try {
      const existing = await durableIdempotency.findUnique({
        where: { customerId_key: { customerId, key: normalizedIdempotencyKey } },
      });
      if (existing) {
        if (existing.payloadHash !== payloadHash) {
          throw new OrderIdempotencyConflictError();
        }
        const persistedOrder = await db.order.findUnique({
          where: { id: existing.orderId },
          include: {
            customer: {
              include: {
                user: {
                  select: {
                    id: true,
                    name: true,
                    phone: true,
                    email: true,
                  },
                },
              },
            },
            address: true,
            items: { include: { category: true } },
            statusHistory: true,
          },
        });
        if (!persistedOrder) {
          throw new Error('The idempotent order record no longer exists.');
        }
        return persistedOrder;
      }
    } catch (error: any) {
      if (error?.code !== 'P2021') {
        throw error;
      }
      durableIdempotencyAvailable = false;
    }
  }

  if (normalizedIdempotencyKey) {
    const cached = idempotencyStore.get(`${customerId || 'anonymous'}:${normalizedIdempotencyKey}`);

    if (
      cached &&
      Date.now() - cached.timestamp <
        IDEMPOTENCY_TTL_MS
    ) {
      if (cached.payloadHash && cached.payloadHash !== payloadHash) {
        throw new OrderIdempotencyConflictError(
          'Idempotency key was already used for a different booking payload. Please start a new booking or retry with the original details.'
        );
      }

      console.log(
        `[IDEMPOTENCY] Returning existing order #${cached.orderId}`
      );

      return cached.responseData;
    }
  }

  // ---------------------------------------------------------
  // 2. VALIDATE GEOFENCE / SERVICE AREA
  // ---------------------------------------------------------

  const geofence =
    await checkGeofenceServiceability(
      input.address.lat,
      input.address.lng,
      input.address.area
    );

  if (!geofence.serviceable) {
    throw new Error(
      geofence.message ||
        "Sorry, we don't currently serve this location."
    );
  }

  // ---------------------------------------------------------
  // 3. USER & CUSTOMER PROFILE
  // ---------------------------------------------------------

  let user: any = null;

  if (authUser?.userId) {
    user = await db.user.findUnique({
      where: {
        id: authUser.userId,
      },
      include: {
        customer: true,
      },
    });
  }

  if (!user || !user.customer) {
    user = await findOrCreateUserCustomer(
      input.phone,
      input.name
    );
  }

  if (!user.customer) {
    throw new Error(
      'Could not initialize customer profile.'
    );
  }

  // ---------------------------------------------------------
  // 4. SAVE PICKUP ADDRESS
  // ---------------------------------------------------------

  const savedAddress =
    await saveCustomerAddress(user.id, {
      label: input.address.label || 'Home',
      name: input.name,
      phone: input.phone,
      houseNo: input.address.houseNo,
      building: input.address.building,
      street: input.address.street,
      area: input.address.area,
      landmark: input.address.landmark,
      pincode: input.address.pincode,
      lat: input.address.lat,
      lng: input.address.lng,
      googlePlaceId:
        input.address.googlePlaceId ||
        undefined,
      isDefault: true,
    });

  // ---------------------------------------------------------
  // 5. FETCH WASTE CATEGORIES & CALCULATE PRICE
  // ---------------------------------------------------------

  const categoryIds = input.items.map(
    (item) => item.categoryId
  );

  const dbCategories =
    await db.wasteCategory.findMany({
      where: {
        id: {
          in: categoryIds,
        },
        active: true,
      },
    });

  const activeCategoryIds = new Set(dbCategories.map((category) => category.id));
  if (categoryIds.some((categoryId) => !activeCategoryIds.has(categoryId))) {
    throw new InvalidWasteCategoryError(
      'One or more selected waste categories are unavailable. Please refresh and try again.',
    );
  }

  const totalBookingWeight = calculateTotalBookingWeight(input.items);
  if (
    input.items.some(
      (item) =>
        typeof item.estimatedWeight !== 'number' ||
        !Number.isFinite(item.estimatedWeight) ||
        item.estimatedWeight <= 0,
    ) ||
    !Number.isFinite(totalBookingWeight)
  ) {
    throw new InvalidBookingWeightError(
      'Booking weights must be finite positive values and produce a finite total.',
    );
  }
  for (const category of dbCategories) {
    if (
      Number.isFinite(category.minWeightKg) &&
      totalBookingWeight < category.minWeightKg
    ) {
      throw new InvalidBookingWeightError(
        `Total booking weight must be at least ${category.minWeightKg} kg for ${category.name}.`,
      );
    }
    if (
      Number.isFinite(category.maxWeightKg) &&
      totalBookingWeight > category.maxWeightKg
    ) {
      throw new InvalidBookingWeightError(
        `Total booking weight must not exceed ${category.maxWeightKg} kg for ${category.name}.`,
      );
    }
  }

  let totalWasteItemsValue = 0;

  const basePickupCharge =
    geofence.zone?.basePickupCharge ?? 69.0;

  const orderItemsData =
    input.items.map((item) => {
      const category = dbCategories.find(
        (cat) => cat.id === item.categoryId
      );

      const ratePerKg = category!.pricePerKg;

      const subtotal =
        item.estimatedWeight * ratePerKg;

      totalWasteItemsValue += subtotal;

      return {
        categoryId: item.categoryId,
        estimatedWeight:
          item.estimatedWeight,
        ratePerKg,
        subtotal,
      };
    });

  // ---------------------------------------------------------
  // 6. COUPON CALCULATION & SERVER-SIDE VALIDATION
  // ---------------------------------------------------------

  let discountAmount = 0.0;
  const preDiscountSubtotal = totalWasteItemsValue + basePickupCharge;

  if (input.couponCode && String(input.couponCode).trim()) {
    const couponValidation = await validateAndCalculateCoupon(
      input.couponCode,
      preDiscountSubtotal,
      user.customer?.id
    );

    if (!couponValidation.valid) {
      throw new InvalidCouponError(
        couponValidation.error || 'Invalid or ineligible coupon code.'
      );
    }

    discountAmount = couponValidation.discountAmount;
  }

  // ---------------------------------------------------------
  // 7. PAYMENT DIRECTION
  // ---------------------------------------------------------
  //
  // Current customer booking flow is CUSTOMER_PAYS.
  // Payment starts as PENDING.
  //
  // IMPORTANT:
  // NO AGENT DISPATCH HAPPENS HERE.
  //

  const financialDirection:
    'CUSTOMER_PAYS' = 'CUSTOMER_PAYS';

  const rawPayable =
    preDiscountSubtotal -
    discountAmount;

  const finalAmount = Math.max(
    1,
    Math.round(rawPayable * 100) / 100
  );

  const orderNumber =
    generateOrderNumber();

  // ---------------------------------------------------------
  // 8. CREATE ORDER
  // ---------------------------------------------------------
  // Note: Prisma executes nested creates (items, statusHistory) atomically
  // in a single database transaction internally, avoiding interactive
  // transaction timeout (P2028) contention.

  let newOrder: any;
  try {
    newOrder = await db.$transaction(
      async (tx) => {
        const createdOrder = await tx.order.create({
          data: {
            orderNumber,

            customerId:
              user.customer!.id,

            addressId:
              savedAddress.id,

            pickupType:
              input.pickupType || 'ASAP',

            scheduledSlot:
              input.scheduledSlot || null,

            status:
              'BOOKING_RECEIVED',

            financialDirection,

            estimatedTotal:
              totalWasteItemsValue,

            pickupCharge:
              basePickupCharge,

            discountAmount,

            finalAmount,

            // IMPORTANT:
            // Order starts unpaid.
            paymentStatus:
              'PENDING',

            wastePhotos:
              JSON.stringify(
                input.photos || []
              ),

            notes:
              input.notes || null,

            items: {
              create:
                orderItemsData,
            },

            statusHistory: {
              create: {
                oldStatus: null,

                newStatus:
                  'BOOKING_RECEIVED',

                changedByUserId:
                  user.id,

                notes:
                  'Order placed by customer via web platform. Payment pending.',
              },
            },
          },

          include: {
            customer: {
              include: {
                user: {
                  select: {
                    id: true,
                    name: true,
                    phone: true,
                    email: true,
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

            statusHistory: true,
          },
        });

        if (normalizedIdempotencyKey && customerId && durableIdempotencyAvailable) {
          await tx.orderIdempotency.create({
            data: {
              customerId,
              key: normalizedIdempotencyKey,
              payloadHash,
              orderId: createdOrder.id,
              expiresAt: new Date(Date.now() + IDEMPOTENCY_TTL_MS),
            },
          });
        }

        return createdOrder;
      },
      {
        maxWait: 5000,
        timeout: 15000,
      }
    );
  } catch (error: any) {
    if (
      normalizedIdempotencyKey &&
      customerId &&
      durableIdempotencyAvailable &&
      (error?.code === 'P2002' || /unique constraint/i.test(String(error?.message || '')))
    ) {
      const existing = await durableIdempotency.findUnique({
        where: { customerId_key: { customerId, key: normalizedIdempotencyKey } },
      });
      if (existing) {
        if (existing.payloadHash !== payloadHash) {
          throw new OrderIdempotencyConflictError();
        }
        const persistedOrder = await db.order.findUnique({
          where: { id: existing.orderId },
          include: {
            customer: {
              include: {
                user: {
                  select: {
                    id: true,
                    name: true,
                    phone: true,
                    email: true,
                  },
                },
              },
            },
            address: true,
            items: { include: { category: true } },
            statusHistory: true,
          },
        });
        if (persistedOrder) return persistedOrder;
      }
    }
    throw error;
  }

  // ---------------------------------------------------------
  // 9. IMPORTANT
  // ---------------------------------------------------------
  //
  // DO NOT DISPATCH TO AGENTS HERE.
  //
  // Razorpay payment must be completed and verified first.
  //
  // The dispatch now happens from:
  //
  // lib/payments/verification.ts
  //
  // after paymentStatus becomes CAPTURED.
  // ---------------------------------------------------------

  // ---------------------------------------------------------
  // 10. STORE IDEMPOTENCY RESPONSE
  // ---------------------------------------------------------

  if (normalizedIdempotencyKey) {
    idempotencyStore.set(
      `${customerId || 'anonymous'}:${normalizedIdempotencyKey}`,
      {
        orderId:
          newOrder.id,

        responseData:
          newOrder,

        timestamp:
          Date.now(),

        payloadHash,
      }
    );
  }

  return newOrder;
}
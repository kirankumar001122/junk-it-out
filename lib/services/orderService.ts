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
import {
  getCachedWasteCategories,
  setCachedWasteCategories,
} from '../cache/wasteCategoriesCache';

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

// In-memory in-flight order promises to prevent race-condition duplicates
const inFlightOrders = new Map<string, Promise<any>>();

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
  } | null,
  timer?: { recordPhase: (phase: string) => number }
) {
  // ---------------------------------------------------------
  // 1. IDEMPOTENCY CHECK
  // ---------------------------------------------------------

  const payloadHash = createOrderPayloadHash(input);
  const normalizedIdempotencyKey = normalizeOrderIdempotencyKey(idempotencyKey);
  const customerId = authUser?.customerId;
  const durableIdempotency = (db as any).orderIdempotency;
  let durableIdempotencyAvailable = Boolean(durableIdempotency);

  if (normalizedIdempotencyKey) {
    const inFlight = inFlightOrders.get(normalizedIdempotencyKey);
    if (inFlight) {
      return await inFlight;
    }

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
            payments: {
              where: { direction: 'CUSTOMER_PAYS' },
              orderBy: { createdAt: 'desc' },
              take: 1,
            },
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

  const execute = async () => {
    timer?.recordPhase('idempotency_lookup');

  // ---------------------------------------------------------
  // 2. PARALLEL LOOKUP: GEOFENCE, USER PROFILE, WASTE CATEGORIES, AND COUPON
  // ---------------------------------------------------------
  const categoryIds = input.items.map(
    (item) => item.categoryId
  );

  const couponCode = input.couponCode && String(input.couponCode).trim()
    ? String(input.couponCode).trim().toUpperCase()
    : null;

  const [geofence, initialUser, dbCategories, couponRecord] = await Promise.all([
    checkGeofenceServiceability(
      input.address.lat,
      input.address.lng,
      input.address.area
    ),
    authUser?.userId
      ? db.user.findUnique({
          where: {
            id: authUser.userId,
          },
          include: {
            customer: true,
            addresses: {
              where: { isDefault: true },
              take: 1,
            },
          },
        })
      : findOrCreateUserCustomer(input.phone, input.name),
    (async () => {
      const cached = getCachedWasteCategories();
      if (cached && Array.isArray(cached)) {
        const matching = cached.filter((c: any) => c.active && categoryIds.includes(c.id));
        if (matching.length === categoryIds.length) {
          return matching;
        }
      }
      const fetched = await db.wasteCategory.findMany({
        where: {
          id: {
            in: categoryIds,
          },
          active: true,
        },
      });
      if (fetched && fetched.length > 0) {
        setCachedWasteCategories(fetched);
      }
      return fetched;
    })(),
    couponCode
      ? db.coupon.findUnique({ where: { code: couponCode } }).catch(() => null)
      : Promise.resolve(null),
  ]);

  timer?.recordPhase('parallel_lookups');
  if (!geofence.serviceable) {
    throw new Error(
      geofence.message ||
        "Sorry, we don't currently serve this location."
    );
  }

  // ---------------------------------------------------------
  // 3. USER & CUSTOMER PROFILE
  // ---------------------------------------------------------

  let user: any = initialUser;

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
  // 4. SAVE PICKUP ADDRESS (Reuses existing default if identical, skips redundant updateMany)
  // ---------------------------------------------------------

  const existingDefaultAddr = user.addresses?.[0];
  const hasExistingDefault = Boolean(existingDefaultAddr);
  const isIdenticalAddress =
    existingDefaultAddr &&
    existingDefaultAddr.houseNo?.trim().toLowerCase() === input.address.houseNo?.trim().toLowerCase() &&
    existingDefaultAddr.street?.trim().toLowerCase() === input.address.street?.trim().toLowerCase() &&
    existingDefaultAddr.area?.trim().toLowerCase() === input.address.area?.trim().toLowerCase() &&
    existingDefaultAddr.pincode?.trim() === input.address.pincode?.trim() &&
    (input.address.building ? (existingDefaultAddr.building || '').trim().toLowerCase() === input.address.building.trim().toLowerCase() : true) &&
    (input.address.landmark ? (existingDefaultAddr.landmark || '').trim().toLowerCase() === input.address.landmark.trim().toLowerCase() : true);

  const savedAddress = isIdenticalAddress
    ? existingDefaultAddr
    : await saveCustomerAddress(
        user.id,
        {
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
        },
        { hasExistingDefault }
      );

  timer?.recordPhase('save_customer_address');

  // ---------------------------------------------------------
  // 5. VALIDATE WASTE CATEGORIES & WEIGHT
  // ---------------------------------------------------------

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
      user.customer?.id,
      couponRecord
    );

    if (!couponValidation.valid) {
      throw new InvalidCouponError(
        couponValidation.error || 'Invalid or ineligible coupon code.'
      );
    }

    discountAmount = couponValidation.discountAmount;
  }

  timer?.recordPhase('coupon_validation');

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

            ...(financialDirection === 'CUSTOMER_PAYS' && finalAmount > 0
              ? {
                  payments: {
                    create: {
                      amount: finalAmount,
                      direction: 'CUSTOMER_PAYS',
                      gateway: 'RAZORPAY',
                      status: 'CREATION_PENDING',
                    },
                  },
                }
              : {}),

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
            items: true,
            payments: {
              where: { direction: 'CUSTOMER_PAYS' },
              orderBy: { createdAt: 'desc' },
              take: 1,
            },
          },
        });

        if (normalizedIdempotencyKey && customerId && durableIdempotencyAvailable) {
          await (tx as any).orderIdempotency.create({
            data: {
              customerId,
              key: normalizedIdempotencyKey,
              payloadHash,
              orderId: createdOrder.id,
              expiresAt: new Date(Date.now() + IDEMPOTENCY_TTL_MS),
            },
          });
        }

        const assembledCustomer = user?.customer
          ? {
              ...user.customer,
              user: user
                ? {
                    id: user.id,
                    name: user.name || '',
                    phone: user.phone || '',
                    email: user.email || null,
                  }
                : null,
            }
          : (createdOrder as any).customer || null;

        const assembledOrder = {
          ...createdOrder,
          customer: assembledCustomer,
          address: savedAddress || (createdOrder as any).address || null,
          items: (createdOrder.items || []).map((item: any) => ({
            ...item,
            category: item.category || dbCategories.find((c: any) => c.id === item.categoryId) || null,
          })),
          statusHistory:
            (createdOrder as any).statusHistory && (createdOrder as any).statusHistory.length > 0
              ? (createdOrder as any).statusHistory
              : [
                  {
                    id: `hist-${createdOrder.id}`,
                    orderId: createdOrder.id,
                    oldStatus: null,
                    newStatus: 'BOOKING_RECEIVED',
                    status: 'BOOKING_RECEIVED',
                    changedByUserId: user?.id || null,
                    notes: 'Order placed by customer via web platform. Payment pending.',
                    timestamp: createdOrder.createdAt,
                    createdAt: createdOrder.createdAt,
                  },
                ],
        };

        return assembledOrder;
      },
      {
        maxWait: 5000,
        timeout: 15000,
      }
    );
    timer?.recordPhase('order_creation_tx');
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
            payments: {
              where: { direction: 'CUSTOMER_PAYS' },
              orderBy: { createdAt: 'desc' },
              take: 1,
            },
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
  };

  const promise = execute();
  if (normalizedIdempotencyKey) {
    inFlightOrders.set(normalizedIdempotencyKey, promise);
  }

  try {
    return await promise;
  } finally {
    if (normalizedIdempotencyKey) {
      inFlightOrders.delete(normalizedIdempotencyKey);
    }
  }
}
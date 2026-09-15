import { db } from '../db';
import { findOrCreateUserCustomer, saveCustomerAddress } from './customerService';
import { checkGeofenceServiceability } from './serviceAreaService';

// In-memory Idempotency Store to prevent duplicate order placements on network retries
const idempotencyStore = new Map<string, { orderId: string; responseData: any; timestamp: number }>();
const IDEMPOTENCY_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

export function generateOrderNumber(): string {
  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const randomHex = Math.random().toString(36).substring(2, 8).toUpperCase();
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
    items: { categoryId: string; estimatedWeight: number }[];
    pickupType?: 'ASAP' | 'SCHEDULED';
    scheduledSlot?: string | null;
    couponCode?: string | null;
    photos?: string[];
    notes?: string;
    financialDirection?: 'CUSTOMER_PAYS' | 'JUNKITOUT_PAYS';
  },
  idempotencyKey?: string | null,
  authUser?: { userId: string; customerId?: string | null } | null
) {
  // 1. Idempotency Check
  if (idempotencyKey) {
    const cached = idempotencyStore.get(idempotencyKey);
    if (cached && Date.now() - cached.timestamp < IDEMPOTENCY_TTL_MS) {
      console.log(`[IDEMPOTENCY] Returning existing order #${cached.orderId} for key ${idempotencyKey}`);
      return cached.responseData;
    }
  }

  // 2. Validate Geofence Service Area
  const geofence = await checkGeofenceServiceability(input.address.lat, input.address.lng, input.address.area);
  if (!geofence.serviceable) {
    throw new Error(geofence.message || "Sorry, we don't currently serve this location.");
  }

  // 3. User & Customer Profile Lookup
  let user: any = null;
  if (authUser?.userId) {
    user = await db.user.findUnique({
      where: { id: authUser.userId },
      include: { customer: true },
    });
  }

  if (!user || !user.customer) {
    user = await findOrCreateUserCustomer(input.phone, input.name);
  }

  if (!user.customer) {
    throw new Error('Could not initialize customer profile.');
  }

  // 4. Save Pickup Address
  const savedAddress = await saveCustomerAddress(user.id, {
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
    googlePlaceId: input.address.googlePlaceId || undefined,
    isDefault: true,
  });

  // 5. Fetch Waste Categories & Compute Server-side Pricing
  const categoryIds = input.items.map((i) => i.categoryId);
  const dbCategories = await db.wasteCategory.findMany({
    where: { id: { in: categoryIds } },
  });

  let totalRecyclable = 0;
  let totalWasteCharge = 0;
  const basePickupCharge = geofence.zone?.basePickupCharge ?? 49.0;

  const orderItemsData = input.items.map((item) => {
    const cat = dbCategories.find((c) => c.id === item.categoryId);
    const ratePerKg = cat ? cat.pricePerKg : 20.0;
    const subtotal = item.estimatedWeight * ratePerKg;

    if (cat?.type === 'WASTE_CHARGE') {
      totalWasteCharge += subtotal;
    } else {
      totalRecyclable += subtotal;
    }

    return {
      categoryId: item.categoryId,
      estimatedWeight: item.estimatedWeight,
      ratePerKg,
      subtotal,
    };
  });

  const discountAmount = input.couponCode === 'WELCOME50' ? 50.0 : 0.0;
  let financialDirection: 'CUSTOMER_PAYS' | 'JUNKITOUT_PAYS';
  let finalAmount: number;

  if (input.financialDirection === 'JUNKITOUT_PAYS') {
    const netAmount = totalRecyclable - (totalWasteCharge + basePickupCharge - discountAmount);
    financialDirection = netAmount >= 0 ? 'JUNKITOUT_PAYS' : 'CUSTOMER_PAYS';
    finalAmount = Math.max(1, Math.abs(netAmount));
  } else {
    financialDirection = 'CUSTOMER_PAYS';
    const rawPayable = totalWasteCharge + basePickupCharge - discountAmount;
    finalAmount = Math.max(1, Math.round(rawPayable));
  }

  const orderNumber = generateOrderNumber();

  // 6. Execute Prisma Database Transaction
  const newOrder = await db.$transaction(async (tx) => {
    const createdOrder = await tx.order.create({
      data: {
        orderNumber,
        customerId: user.customer!.id,
        addressId: savedAddress.id,
        pickupType: input.pickupType || 'ASAP',
        scheduledSlot: input.scheduledSlot || null,
        status: 'BOOKING_RECEIVED',
        financialDirection,
        estimatedTotal: totalRecyclable,
        pickupCharge: basePickupCharge,
        discountAmount,
        finalAmount,
        paymentStatus: 'PENDING',
        wastePhotos: JSON.stringify(input.photos || []),
        notes: input.notes || null,
        items: {
          create: orderItemsData,
        },
        statusHistory: {
          create: {
            oldStatus: null,
            newStatus: 'BOOKING_RECEIVED',
            changedByUserId: user.id,
            notes: 'Order placed by customer via web platform.',
          },
        },
      },
      include: {
        customer: { include: { user: true } },
        address: true,
        items: { include: { category: true } },
        statusHistory: true,
      },
    });

    return createdOrder;
  });

  // 7. Store in Idempotency Map
  if (idempotencyKey) {
    idempotencyStore.set(idempotencyKey, {
      orderId: newOrder.id,
      responseData: newOrder,
      timestamp: Date.now(),
    });
  }

  return newOrder;
}

import { db } from '../db';

export class CustomerRoleConflictError extends Error {
  constructor() {
    super('This phone number belongs to a non-customer account.');
    this.name = 'CustomerRoleConflictError';
  }
}

export async function findOrCreateUserCustomer(phone: string, name = 'Customer', email?: string) {
  const rawDigits = phone.replace(/^\+91/, '').replace(/\D/g, '');
  const phoneVariants = Array.from(new Set([phone, rawDigits, `+91${rawDigits}`, `0${rawDigits}`]));

  let user = await db.user.findFirst({
    where: { phone: { in: phoneVariants } },
    include: {
      customer: true,
      agent: true,
      admin: true,
      addresses: {
        where: { isDefault: true },
        take: 1,
      },
    },
  });

  if (!user) {
    user = await db.user.create({
      data: {
        phone,
        name,
        email: email || null,
        role: 'CUSTOMER',
        customer: {
          create: {
            referralCode: `JIO-${Math.random().toString(36).substring(2, 7).toUpperCase()}`,
          },
        },
      },
      include: {
        customer: true,
        agent: true,
        admin: true,
        addresses: {
          where: { isDefault: true },
          take: 1,
        },
      },
    });
  } else if (user.role !== 'CUSTOMER') {
    throw new CustomerRoleConflictError();
  } else if (!user.customer) {
    const customer = await db.customer.create({
      data: {
        userId: user.id,
        referralCode: `JIO-${Math.random().toString(36).substring(2, 7).toUpperCase()}`,
      },
    });
    user.customer = customer;
  } else {
    // Update the user's name if a new name is provided and it's different from the current name
    if (name && name !== user.name) {
      user = await db.user.update({
        where: { id: user.id },
        data: { name },
        include: {
          customer: true,
          agent: true,
          admin: true,
          addresses: {
            where: { isDefault: true },
            take: 1,
          },
        },
      });
    }
  }

  return user;
}

export async function saveCustomerAddress(
  userId: string,
  addressData: {
    label?: string;
    name: string;
    phone: string;
    houseNo: string;
    building?: string;
    street: string;
    area: string;
    landmark?: string;
    pincode: string;
    lat: number;
    lng: number;
    googlePlaceId?: string | null;
    isDefault?: boolean;
  },
  options?: {
    hasExistingDefault?: boolean;
  }
) {
  if (!addressData.houseNo || !addressData.street || !addressData.area) {
    throw new Error('Missing required address fields.');
  }

  const numLat = Number(addressData.lat);
  const numLng = Number(addressData.lng);
  if (
    addressData.lat === undefined ||
    addressData.lng === undefined ||
    isNaN(numLat) ||
    isNaN(numLng) ||
    !Number.isFinite(numLat) ||
    !Number.isFinite(numLng) ||
    numLat < -90 ||
    numLat > 90 ||
    numLng < -180 ||
    numLng > 180 ||
    (numLat === 0 && numLng === 0)
  ) {
    throw new Error('Valid GPS latitude and longitude coordinates are required.');
  }

  const cleanPincode = typeof addressData.pincode === 'string'
    ? addressData.pincode.trim()
    : typeof addressData.pincode === 'number'
    ? String(addressData.pincode)
    : '';
  if (!cleanPincode || !/^[1-9][0-9]{5}$/.test(cleanPincode)) {
    throw new Error('A valid 6-digit Indian pincode is required.');
  }

  const isDefault = addressData.isDefault ?? true;

  const runTx = async (tx: any) => {
    const addressClient = tx?.address || db.address;
    const shouldResetExisting = isDefault && options?.hasExistingDefault !== false;
    if (shouldResetExisting && typeof addressClient?.updateMany === 'function') {
      await addressClient.updateMany({
        where: { userId },
        data: { isDefault: false },
      });
    }

    if (typeof addressClient?.create === 'function') {
      return addressClient.create({
        data: {
          userId,
          label: addressData.label || 'Home',
          name: addressData.name,
          phone: addressData.phone,
          houseNo: addressData.houseNo,
          building: addressData.building || null,
          street: addressData.street,
          area: addressData.area,
          landmark: addressData.landmark || null,
          pincode: cleanPincode,
          lat: numLat,
          lng: numLng,
          googlePlaceId: addressData.googlePlaceId || null,
          isDefault,
        },
      });
    }

    return null;
  };

  if (typeof db.$transaction === 'function') {
    return db.$transaction(runTx);
  }
  return runTx(db);
}

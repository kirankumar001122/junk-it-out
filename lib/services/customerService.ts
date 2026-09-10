import { db } from '../db';

export class CustomerRoleConflictError extends Error {
  constructor() {
    super('This phone number belongs to a non-customer account.');
    this.name = 'CustomerRoleConflictError';
  }
}

export async function findOrCreateUserCustomer(phone: string, name = 'Customer', email?: string) {
  console.log('[CUSTOMER_SERVICE] Finding/creating user for phone:', phone, 'with name:', name);
  
  let user = await db.user.findUnique({
    where: { phone },
    include: { customer: true, agent: true, admin: true },
  });

  console.log('[CUSTOMER_SERVICE] Found user:', user ? user.id : null, 'current name:', user?.name);

  if (!user) {
    console.log('[CUSTOMER_SERVICE] Creating new user with name:', name);
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
      include: { customer: true, agent: true, admin: true },
    });
    console.log('[CUSTOMER_SERVICE] Created user with name:', user.name);
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
    console.log('[CUSTOMER_SERVICE] Checking name update - current:', user.name, 'new:', name);
    if (name && name !== user.name) {
      console.log('[CUSTOMER_SERVICE] Updating user name from', user.name, 'to', name);
      user = await db.user.update({
        where: { id: user.id },
        data: { name },
        include: { customer: true, agent: true, admin: true },
      });
      console.log('[CUSTOMER_SERVICE] Updated user name to:', user.name);
    } else {
      console.log('[CUSTOMER_SERVICE] No name update needed');
    }
  }

  console.log('[CUSTOMER_SERVICE] Returning user with name:', user.name);
  return user;
}

export async function saveCustomerAddress(userId: string, addressData: {
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
}) {
  if (addressData.isDefault) {
    await db.address.updateMany({
      where: { userId },
      data: { isDefault: false },
    });
  }

  return db.address.create({
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
      pincode: addressData.pincode,
      lat: addressData.lat,
      lng: addressData.lng,
      googlePlaceId: addressData.googlePlaceId || null,
      isDefault: addressData.isDefault ?? true,
    },
  });
}

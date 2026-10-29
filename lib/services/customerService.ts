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
    include: { customer: true, agent: true, admin: true },
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
      include: { customer: true, agent: true, admin: true },
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
        include: { customer: true, agent: true, admin: true },
      });
    }
  }

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

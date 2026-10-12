import { db } from '../db';
import type { Address, Prisma } from '@prisma/client';
import { isMissingFormattedAddressColumnError } from '../isMissingFormattedAddressColumnError';
import { buildCustomerAddressPersistenceFields } from '../address';

export const LEGACY_ADDRESS_SELECT = {
  id: true,
  userId: true,
  label: true,
  name: true,
  phone: true,
  houseNo: true,
  building: true,
  street: true,
  area: true,
  landmark: true,
  city: true,
  pincode: true,
  lat: true,
  lng: true,
  googlePlaceId: true,
  pickupInstructions: true,
  isDefault: true,
  createdAt: true,
} satisfies Prisma.AddressSelect;

export async function getCustomerAddresses(userId: string, take = 5): Promise<Address[]> {
  const query = {
    where: { userId },
    orderBy: { createdAt: 'desc' as const },
    take,
  };

  try {
    return await db.address.findMany(query);
  } catch (error: any) {
    if (!isMissingFormattedAddressColumnError(error)) throw error;

    const legacyAddresses = await db.address.findMany({
      ...query,
      select: LEGACY_ADDRESS_SELECT,
    });

    return legacyAddresses.map((address) => ({
      ...address,
      formattedAddress: null,
    }));
  }
}

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
  formattedAddress?: string | null;
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
  return db.$transaction(async (tx) => {
    if (addressData.isDefault) {
      await tx.address.updateMany({
        where: { userId },
        data: { isDefault: false },
      });
    }

    return tx.address.create({
      data: {
        userId,
        label: addressData.label || 'Home',
        name: addressData.name,
        phone: addressData.phone,
        ...buildCustomerAddressPersistenceFields(addressData),
        isDefault: addressData.isDefault ?? true,
      },
    });
  });
}

import { db } from './db';

export interface AuthSession {
  userId: string;
  name: string;
  phone: string;
  email?: string | null;
  role: 'CUSTOMER' | 'AGENT' | 'ADMIN' | 'SUPER_ADMIN';
  agentId?: string | null;
  customerId?: string | null;
  adminId?: string | null;
}

export async function getSessionUser(phoneOrEmail?: string): Promise<AuthSession | null> {
  const user = await db.user.findFirst({
    where: phoneOrEmail
      ? { OR: [{ phone: phoneOrEmail }, { email: phoneOrEmail }] }
      : { role: 'SUPER_ADMIN' },
    include: {
      customer: true,
      agent: true,
      admin: true,
    },
  });

  if (!user) return null;

  return {
    userId: user.id,
    name: user.name,
    phone: user.phone,
    email: user.email,
    role: user.role as any,
    agentId: user.agent?.id ?? null,
    customerId: user.customer?.id ?? null,
    adminId: user.admin?.id ?? null,
  };
}

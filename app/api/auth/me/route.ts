import { NextRequest } from 'next/server';
import { getAuthUser } from '@/lib/auth/middleware';
import { db } from '@/lib/db';
import { successResponse, errorResponse } from '@/lib/utils/apiResponse';

export async function GET(req: NextRequest) {
  try {
    const authUser = await getAuthUser(req);
    if (!authUser) {
      return errorResponse('UNAUTHORIZED', 'Authentication required.', 401);
    }

    const user = await db.user.findUnique({
      where: { id: authUser.userId },
      include: {
        customer: true,
        agent: true,
        admin: true,
        addresses: { orderBy: { createdAt: 'desc' }, take: 5 },
      },
    });

    if (!user) {
      return errorResponse('USER_NOT_FOUND', 'User profile not found.', 444);
    }

    return successResponse({
      user: {
        id: user.id,
        phone: user.phone,
        name: user.name,
        email: user.email,
        role: user.role,
        customer: user.customer,
        agent: user.agent,
        admin: user.admin,
        addresses: user.addresses,
      },
    });
  } catch (err: any) {
    console.error('Auth me error:', err);
    return errorResponse('INTERNAL_SERVER_ERROR', 'Failed to retrieve profile.', 500);
  }
}

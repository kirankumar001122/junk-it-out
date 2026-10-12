import { NextRequest } from 'next/server';
import { getAuthUser } from '@/lib/auth/middleware';
import { db } from '@/lib/db';
import { successResponse, errorResponse } from '@/lib/utils/apiResponse';
import { getCustomerAddresses } from '@/lib/services/customerService';

export async function GET(req: NextRequest) {
  try {
    const authUser = await getAuthUser(req);
    if (!authUser) {
      return errorResponse('UNAUTHORIZED', 'Authentication required.', 401);
    }

    const isAgent = authUser.role === 'AGENT';

    let user = await db.user.findUnique({
      where: { id: authUser.userId },
      include: {
        customer: true,
        agent: isAgent,
        admin: true,
      },
    });

    if (!user) {
      return errorResponse('UNAUTHORIZED', 'The session is no longer valid.', 401);
    }

    // Auto-heal missing Agent record if role is AGENT
    if (user.role === 'AGENT' && !user.agent) {
      const createdAgent = await db.agent.create({
        data: {
          userId: user.id,
          vehicleType: 'Piaggio Ape Auto Loader (KA-05-JK-1024)',
          vehicleNumber: 'KA-05-JK-1024',
          status: 'AVAILABLE',
          serviceAreas: 'JP Nagar, Jayanagar, Koramangala, Electronic City',
        },
      });
      user = {
        ...user,
        agent: createdAgent,
      };
    }

    const addresses = await getCustomerAddresses(user.id);

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
        addresses,
      },
    });
  } catch (err: any) {
    console.error('Auth me error:', err);
    return errorResponse('INTERNAL_SERVER_ERROR', 'Failed to retrieve profile.', 500);
  }
}

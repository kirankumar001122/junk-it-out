import { NextRequest } from 'next/server';
import { getAuthUser } from '@/lib/auth/middleware';
import { db } from '@/lib/db';
import { successResponse } from '@/lib/utils/apiResponse';

export async function POST(req: NextRequest) {
  try {
    const authUser = await getAuthUser(req);
    if (authUser?.userId) {
      // Invalidate session on server side by incrementing user tokenVersion
      await db.user.update({
        where: { id: authUser.userId },
        data: { tokenVersion: { increment: 1 } },
      }).catch((err) => {
        console.error('Failed to increment user tokenVersion on logout:', err);
      });

      if (authUser.agentId) {
        await db.agent.update({
          where: { id: authUser.agentId },
          data: { tokenVersion: { increment: 1 } },
        }).catch(() => null);
      }
    }
  } catch (err) {
    console.error('Logout revocation error:', err);
  }

  const response = successResponse({ message: 'Logged out successfully.' });
  response.cookies.set({
    name: 'jio_token',
    value: '',
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
    expires: new Date(0),
  });
  response.cookies.delete('jio_token');
  return response;
}

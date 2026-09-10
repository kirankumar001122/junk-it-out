import { NextRequest } from 'next/server';
import { successResponse } from '@/lib/utils/apiResponse';

export async function POST(req: NextRequest) {
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

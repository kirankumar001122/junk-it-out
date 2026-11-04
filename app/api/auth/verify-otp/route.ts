import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  try {
    const { phone, otp } = await req.json();

    // MOCK FOR LOCAL - NO DB NEEDED
    if (otp === '123456') {
      const response = NextResponse.json({ 
        success: true, 
        message: 'Local login success' 
      });

      // Set cookie so middleware allows /admin
      response.cookies.set('admin_token', `local-admin-token-${phone}`, {
        httpOnly: false,
        path: '/',
        maxAge: 60*60*24
      });
      response.cookies.set('token', `local-admin-token-${phone}`, {
        httpOnly: false,
        path: '/',
        maxAge: 60*60*24
      });

      return response;
    }

    return NextResponse.json({ success: false, message: 'Use 123456' }, { status: 401 });

  } catch (e) {
    return NextResponse.json({ success: false }, { status: 500 });
  }
}
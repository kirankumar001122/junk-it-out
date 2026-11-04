import { NextRequest, NextResponse } from 'next/server';

export async function GET(req: NextRequest) {
  const token = req.cookies.get('admin_token')?.value || req.cookies.get('token')?.value || '';

  // If local token, return fake admin user
  if (token && token.includes('local-admin-token')) {
    return NextResponse.json({
      success: true,
      user: {
        id: 'local-admin',
        phone: '8610466283',
        role: 'admin',
        name: 'Local Admin'
      }
    });
  }

  // Otherwise not logged in
  return NextResponse.json({ success: false, user: null });
}
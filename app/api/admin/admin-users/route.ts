import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAuthUser } from '@/lib/auth/middleware';

export async function GET(req: NextRequest) {
  try {
    const authUser = await getAuthUser(req);
    if (!authUser || !['ADMIN', 'SUPER_ADMIN'].includes(authUser.role)) {
      return NextResponse.json({ success: false, message: 'Admin access required.' }, { status: 403 });
    }

    const admins = await db.admin.findMany({
      include: {
        user: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    const formatted = admins.map((a) => ({
      id: a.id,
      userId: a.userId,
      name: a.user.name,
      email: a.user.email || `${a.user.phone}@junkitout.in`,
      phone: a.user.phone,
      department: a.department,
      accessLevel: a.accessLevel,
      role: a.user.role,
      status: 'ACTIVE',
    }));

    return NextResponse.json({ success: true, data: formatted });
  } catch (error: any) {
    console.error('Fetch admin users error:', error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const authUser = await getAuthUser(req);
    if (!authUser || !['ADMIN', 'SUPER_ADMIN'].includes(authUser.role)) {
      return NextResponse.json({ success: false, message: 'Admin access required.' }, { status: 403 });
    }

    const body = await req.json();
    const { name, email, phone, department, accessLevel } = body;

    if (!name || !phone) {
      return NextResponse.json({ success: false, message: 'Name and phone number required.' }, { status: 400 });
    }

    // Check if user already exists
    let user = await db.user.findUnique({ where: { phone } });
    if (!user) {
      user = await db.user.create({
        data: {
          name,
          phone,
          email: email || null,
          role: 'ADMIN',
        },
      });
    } else {
      await db.user.update({
        where: { id: user.id },
        data: { role: 'ADMIN', name, ...(email ? { email } : {}) },
      });
    }

    // Check admin record
    let admin = await db.admin.findUnique({ where: { userId: user.id } });
    if (!admin) {
      admin = await db.admin.create({
        data: {
          userId: user.id,
          department: department || 'Operations',
          accessLevel: accessLevel || 'FULL',
        },
      });
    }

    return NextResponse.json({ success: true, data: { ...admin, user } });
  } catch (error: any) {
    console.error('Create admin user error:', error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}

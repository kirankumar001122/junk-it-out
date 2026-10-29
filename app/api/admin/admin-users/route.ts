import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAdminAuthorizationStatus, getAuthUser } from '@/lib/auth/middleware';

export async function GET(req: NextRequest) {
  try {
    const authUser = await getAuthUser(req);
    const authorizationStatus = getAdminAuthorizationStatus(authUser);
    if (authorizationStatus === 401) {
      return NextResponse.json({ success: false, message: 'Authentication is required.' }, { status: 401 });
    }
    if (authorizationStatus === 403) {
      return NextResponse.json({ success: false, message: 'Admin access required.' }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const page = Math.max(1, Number(searchParams.get('page') || 1) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(searchParams.get('pageSize') || 25) || 25));
    const admins = await db.admin.findMany({
      include: {
        user: {
          select: { id: true, name: true, phone: true, email: true, role: true },
        },
      },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
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

    return NextResponse.json({ success: true, data: formatted, page, pageSize });
  } catch (error: any) {
    console.error('Fetch admin users error:', error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const authUser = await getAuthUser(req);
    const authorizationStatus = getAdminAuthorizationStatus(authUser);
    if (authorizationStatus === 401) {
      return NextResponse.json({ success: false, message: 'Authentication is required.' }, { status: 401 });
    }
    if (authorizationStatus === 403) {
      return NextResponse.json({ success: false, message: 'Admin access required.' }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const { name, email, phone, department, accessLevel } = body;

    if (!name || typeof name !== 'string' || !name.trim()) {
      return NextResponse.json({ success: false, message: 'Admin name is required.' }, { status: 400 });
    }

    if (!phone || typeof phone !== 'string') {
      return NextResponse.json({ success: false, message: 'Valid phone number is required.' }, { status: 400 });
    }

    const cleanPhone = phone.replace(/\D/g, '');
    if (cleanPhone.length !== 10) {
      return NextResponse.json({ success: false, message: 'Phone number must be a valid 10-digit mobile number.' }, { status: 400 });
    }

    const trimmedName = name.trim();
    const sanitizedEmail = typeof email === 'string' && email.trim() ? email.trim() : null;

    // Check if user already exists
    let user = await db.user.findUnique({ where: { phone: cleanPhone } });
    if (!user) {
      user = await db.user.create({
        data: {
          name: trimmedName,
          phone: cleanPhone,
          email: sanitizedEmail,
          role: 'ADMIN',
        },
      });
    } else {
      await db.user.update({
        where: { id: user.id },
        data: { role: 'ADMIN', name: trimmedName, ...(sanitizedEmail ? { email: sanitizedEmail } : {}) },
      });
    }

    // Check admin record
    let admin = await db.admin.findUnique({ where: { userId: user.id } });
    if (!admin) {
      admin = await db.admin.create({
        data: {
          userId: user.id,
          department: department ? String(department).trim() : 'Operations',
          accessLevel: accessLevel ? String(accessLevel).trim() : 'FULL',
        },
      });
    }

    // Write immutable audit log
    await db.auditLog.create({
      data: {
        userId: authUser?.userId || null,
        userName: authUser?.name || 'Admin Operations',
        action: 'ADMIN_USER_CREATED',
        oldValue: null,
        newValue: `Created admin user: ${trimmedName} (${cleanPhone}), Dept: ${admin.department}, Access: ${admin.accessLevel}`,
      },
    }).catch(() => null);

    return NextResponse.json({
      success: true,
      data: {
        id: admin.id,
        userId: admin.userId,
        department: admin.department,
        accessLevel: admin.accessLevel,
        user: {
          id: user.id,
          name: user.name,
          phone: user.phone,
          email: user.email,
          role: user.role,
        },
      },
    });
  } catch (error: any) {
    console.error('Create admin user error:', error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}

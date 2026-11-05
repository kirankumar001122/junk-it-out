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
    const roleParam = searchParams.get('role')?.trim();
    const departmentParam = searchParams.get('department')?.trim();
    const searchParam = searchParams.get('search')?.trim().toLowerCase();

    const where: any = {};
    if (roleParam && roleParam !== 'ALL') {
      where.user = { ...where.user, role: roleParam };
    }
    if (departmentParam && departmentParam !== 'ALL') {
      where.department = departmentParam;
    }
    if (searchParam) {
      where.OR = [
        { department: { contains: searchParam, mode: 'insensitive' } },
        { user: { name: { contains: searchParam, mode: 'insensitive' } } },
        { user: { phone: { contains: searchParam, mode: 'insensitive' } } },
        { user: { email: { contains: searchParam, mode: 'insensitive' } } },
      ];
    }

    const [total, admins] = await Promise.all([
      db.admin.count({ where }),
      db.admin.findMany({
        where,
        include: {
          user: {
            select: { id: true, name: true, phone: true, email: true, role: true, createdAt: true },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

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
      createdAt: a.createdAt.toISOString(),
    }));

    return NextResponse.json({
      success: true,
      data: formatted,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize) || 1,
    });
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
    if (authorizationStatus === 403 || authUser?.role !== 'SUPER_ADMIN') {
      return NextResponse.json({ success: false, message: 'Super Admin access required to provision administrators.' }, { status: 403 });
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
    if (user && (user.role === 'CUSTOMER' || user.role === 'AGENT')) {
      return NextResponse.json(
        {
          success: false,
          message: 'This phone number belongs to an existing customer or agent account and cannot be converted to an administrator.',
        },
        { status: 409 }
      );
    }

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

export async function PUT(req: NextRequest) {
  try {
    const authUser = await getAuthUser(req);
    const authorizationStatus = getAdminAuthorizationStatus(authUser);
    if (authorizationStatus === 401) {
      return NextResponse.json({ success: false, message: 'Authentication is required.' }, { status: 401 });
    }
    if (authorizationStatus === 403 || authUser?.role !== 'SUPER_ADMIN') {
      return NextResponse.json({ success: false, message: 'Super Admin access required to update administrator profiles.' }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const { id, department, accessLevel, role } = body;

    if (!id || typeof id !== 'string') {
      return NextResponse.json({ success: false, message: 'Admin ID is required.' }, { status: 400 });
    }

    const admin = await db.admin.findUnique({
      where: { id },
      include: { user: true },
    });

    if (!admin) {
      return NextResponse.json({ success: false, message: 'Administrator record not found.' }, { status: 404 });
    }

    const updatedAdmin = await db.admin.update({
      where: { id },
      data: {
        ...(department ? { department: String(department).trim() } : {}),
        ...(accessLevel ? { accessLevel: String(accessLevel).trim() } : {}),
      },
      include: { user: true },
    });

    if (role && (role === 'ADMIN' || role === 'SUPER_ADMIN') && admin.user) {
      await db.user.update({
        where: { id: admin.userId },
        data: { role },
      });
    }

    await db.auditLog.create({
      data: {
        userId: authUser?.userId || null,
        userName: authUser?.name || 'Admin Operations',
        action: 'ADMIN_USER_UPDATED',
        oldValue: `Dept: ${admin.department}, Access: ${admin.accessLevel}`,
        newValue: `Dept: ${updatedAdmin.department}, Access: ${updatedAdmin.accessLevel} for admin ${admin.user.name}`,
      },
    }).catch(() => null);

    return NextResponse.json({
      success: true,
      message: 'Administrator profile successfully updated.',
      data: {
        id: updatedAdmin.id,
        userId: updatedAdmin.userId,
        department: updatedAdmin.department,
        accessLevel: updatedAdmin.accessLevel,
        name: updatedAdmin.user.name,
        phone: updatedAdmin.user.phone,
        role: updatedAdmin.user.role,
      },
    });
  } catch (error: any) {
    console.error('Update admin user error:', error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const authUser = await getAuthUser(req);
    const authorizationStatus = getAdminAuthorizationStatus(authUser);
    if (authorizationStatus === 401) {
      return NextResponse.json({ success: false, message: 'Authentication is required.' }, { status: 401 });
    }
    if (authorizationStatus === 403 || authUser?.role !== 'SUPER_ADMIN') {
      return NextResponse.json({ success: false, message: 'Super Admin access required to remove administrator access.' }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    let id = searchParams.get('id');
    if (!id) {
      const body = await req.json().catch(() => ({}));
      id = body.id;
    }

    if (!id || typeof id !== 'string') {
      return NextResponse.json({ success: false, message: 'Admin ID is required.' }, { status: 400 });
    }

    const admin = await db.admin.findUnique({
      where: { id },
      include: { user: true },
    });

    if (!admin) {
      return NextResponse.json({ success: false, message: 'Administrator record not found.' }, { status: 404 });
    }

    // Safety checks: Cannot delete self or the primary test account
    if (authUser?.userId === admin.userId || authUser?.phone === admin.user?.phone) {
      return NextResponse.json({ success: false, message: 'You cannot remove your own administrator account.' }, { status: 400 });
    }

    const rawTargetPhone = admin.user?.phone?.replace(/\D/g, '').slice(-10);
    if (rawTargetPhone === '8123767934') {
      return NextResponse.json({ success: false, message: 'Primary local test administrator cannot be removed.' }, { status: 400 });
    }

    // Delete admin record and reset role to CUSTOMER
    await db.admin.delete({ where: { id } });
    if (admin.userId) {
      await db.user.update({
        where: { id: admin.userId },
        data: { role: 'CUSTOMER' },
      }).catch(() => null);
    }

    await db.auditLog.create({
      data: {
        userId: authUser?.userId || null,
        userName: authUser?.name || 'Admin Operations',
        action: 'ADMIN_USER_REMOVED',
        oldValue: `Admin ${admin.user?.name} (${admin.user?.phone}), Dept: ${admin.department}`,
        newValue: null,
      },
    }).catch(() => null);

    return NextResponse.json({
      success: true,
      message: `Administrator access for ${admin.user?.name || 'user'} successfully removed.`,
    });
  } catch (error: any) {
    console.error('Delete admin user error:', error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}

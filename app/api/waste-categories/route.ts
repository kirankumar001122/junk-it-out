import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAdminAuthorizationStatus, getAuthUser } from '@/lib/auth/middleware';
import { successResponse, errorResponse } from '@/lib/utils/apiResponse';
import { isCustomerWasteCategory, getMaterialImageUrl } from '@/lib/customerWasteCategories';

import { getCachedWasteCategories, setCachedWasteCategories, invalidateCategoriesCache } from '@/lib/cache/wasteCategoriesCache';

function sortCategories(list: any[]): any[] {
  return [...list].sort((a, b) => {
    const orderA = typeof a?.displayOrder === 'number' && a.displayOrder > 0 ? a.displayOrder : 999;
    const orderB = typeof b?.displayOrder === 'number' && b.displayOrder > 0 ? b.displayOrder : 999;
    if (orderA !== orderB) return orderA - orderB;
    return String(a?.name || '').localeCompare(String(b?.name || ''));
  });
}

function enrichCategoryImage(cat: any) {
  if (!cat || typeof cat !== 'object') return cat;
  return {
    ...cat,
    imageUrl: getMaterialImageUrl(cat),
    category: cat.category || 'Recyclables',
    displayOrder: typeof cat.displayOrder === 'number' ? cat.displayOrder : 0,
  };
}

export async function GET(req: NextRequest) {
  try {
    const searchParams = req.nextUrl.searchParams;
    const customerOnly = searchParams.get('customer') === 'true';
    const adminMode = searchParams.get('admin') === 'true';
    const search = (searchParams.get('search') || '').trim().toLowerCase();
    const statusFilter = (searchParams.get('status') || 'ALL').trim().toUpperCase();
    const categoryFilter = (searchParams.get('category') || 'ALL').trim();

    if (!adminMode) {
      const cachedCategories = getCachedWasteCategories();
      if (cachedCategories) {
        const enriched = sortCategories(cachedCategories.map(enrichCategoryImage));
        const visibleCategories = customerOnly
          ? enriched.filter((c: any) => c.active && isCustomerWasteCategory(c))
          : enriched;
        const cachedResponse = successResponse(visibleCategories);
        cachedResponse.headers.set('Cache-Control', 'no-store, max-age=0');
        cachedResponse.headers.set('X-Cache', 'HIT');
        return cachedResponse;
      }
    }

    const categorySelect = {
      id: true,
      name: true,
      description: true,
      category: true,
      imageUrl: true,
      icon: true,
      type: true,
      pricePerKg: true,
      minWeightKg: true,
      maxWeightKg: true,
      displayOrder: true,
      active: true,
      createdAt: true,
      updatedAt: true,
      ...(adminMode ? { _count: { select: { orderItems: true } } } : {}),
    } as const;

    // Fetch all categories without restricting to active only, so cachedCategories has the full catalog
    let categories = await db.wasteCategory.findMany({
      orderBy: [{ displayOrder: 'asc' }, { name: 'asc' }],
      select: categorySelect as any,
    });

    if (categories.length === 0) {
      const defaultCategories = [
        { name: 'E-Waste', description: 'Keyboards, chargers, old phones, motherboards, small appliances', category: 'E-Waste', imageUrl: '/categories/e-waste.webp', icon: 'Monitor', type: 'RECYCLABLE_BUY', pricePerKg: 35.0, displayOrder: 1, active: true },
        { name: 'Household Dry Waste', description: 'Clean dry packaging, fabric scraps, wooden pieces, rubber items', category: 'Household Junk', imageUrl: '/categories/household-waste.webp', icon: 'Trash2', type: 'RECYCLABLE_BUY', pricePerKg: 8.0, displayOrder: 2, active: true },
        { name: 'Paper & Cardboard', description: 'Carton boxes, newspapers, magazines, office paper, shredded paper', category: 'Paper & Cardboard', imageUrl: '/categories/paper-carboard.jpg', icon: 'FileText', type: 'RECYCLABLE_BUY', pricePerKg: 14.0, displayOrder: 3, active: true },
        { name: 'Plastic Waste', description: 'Bottles, containers, polythene, packaging materials, hard plastics', category: 'Plastic Waste', imageUrl: '/categories/plastic-waste.jpg', icon: 'Recycle', type: 'RECYCLABLE_BUY', pricePerKg: 18.0, displayOrder: 4, active: true },
      ];

      await Promise.all(defaultCategories.map((cat) => db.wasteCategory.upsert({
          where: { name: cat.name },
          update: { pricePerKg: cat.pricePerKg, type: cat.type, description: cat.description },
          create: cat,
        })));

      categories = await db.wasteCategory.findMany({
        orderBy: [{ displayOrder: 'asc' }, { name: 'asc' }],
        select: categorySelect as any,
      });
    }

    const enrichedCategories = sortCategories(categories.map(enrichCategoryImage));
    setCachedWasteCategories(enrichedCategories);

    let visibleCategories = customerOnly
      ? enrichedCategories.filter((c: any) => c.active && isCustomerWasteCategory(c))
      : enrichedCategories;

    if (adminMode) {
      if (statusFilter === 'ACTIVE') {
        visibleCategories = visibleCategories.filter((c: any) => c.active === true);
      } else if (statusFilter === 'INACTIVE') {
        visibleCategories = visibleCategories.filter((c: any) => c.active === false);
      }
      if (categoryFilter && categoryFilter !== 'ALL') {
        visibleCategories = visibleCategories.filter(
          (c: any) => String(c.category || '').toLowerCase() === categoryFilter.toLowerCase()
        );
      }
      if (search) {
        visibleCategories = visibleCategories.filter(
          (c: any) =>
            String(c.name || '').toLowerCase().includes(search) ||
            String(c.description || '').toLowerCase().includes(search) ||
            String(c.category || '').toLowerCase().includes(search)
        );
      }

      const pageParam = searchParams.get('page');
      const pageSizeParam = searchParams.get('pageSize');
      if (pageParam || pageSizeParam) {
        const page = Math.max(1, Number(pageParam || 1) || 1);
        const pageSize = Math.min(100, Math.max(1, Number(pageSizeParam || 10) || 10));
        const totalCount = visibleCategories.length;
        const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
        const paginated = visibleCategories.slice((page - 1) * pageSize, page * pageSize);
        return NextResponse.json({
          success: true,
          data: paginated,
          allData: enrichedCategories,
          totalCount,
          page,
          pageSize,
          totalPages,
        });
      }
    }

    const response = successResponse(visibleCategories);
    response.headers.set('Cache-Control', 'no-store, max-age=0');
    response.headers.set('X-Cache', 'MISS');
    return response;
  } catch (err: any) {
    console.error('Fetch waste categories error:', err);
    return errorResponse('INTERNAL_SERVER_ERROR', 'Failed to fetch waste categories.', 500);
  }
}

export async function PUT(req: NextRequest) {
  try {
    const authUser = await getAuthUser(req);
    const authorizationStatus = getAdminAuthorizationStatus(authUser);
    if (authorizationStatus === 401) {
      return errorResponse('UNAUTHORIZED', 'Authentication is required.', 401);
    }
    if (authorizationStatus === 403) {
      return errorResponse('FORBIDDEN', 'Admin access required.', 403);
    }

    const body = await req.json().catch(() => ({}));
    const {
      id,
      pricePerKg,
      name,
      description,
      type,
      active,
      category,
      imageUrl,
      displayOrder,
      icon,
      minWeightKg,
      maxWeightKg,
    } = body;

    if (!id || typeof id !== 'string') {
      return errorResponse('INVALID_INPUT', 'Waste category id is required.', 400);
    }
    if (pricePerKg !== undefined &&
      (typeof pricePerKg !== 'number' || !Number.isFinite(pricePerKg) || pricePerKg < 0)) {
      return errorResponse('INVALID_INPUT', 'Price per kilogram must be a non-negative number.', 400);
    }
    if (name !== undefined && (typeof name !== 'string' || !name.trim())) {
      return errorResponse('INVALID_INPUT', 'Category name must be a non-empty string.', 400);
    }
    if (description !== undefined && (typeof description !== 'string' || !description.trim())) {
      return errorResponse('INVALID_INPUT', 'Category description must be a non-empty string.', 400);
    }
    if (type !== undefined && (typeof type !== 'string' || !type.trim())) {
      return errorResponse('INVALID_INPUT', 'Category type must be a non-empty string.', 400);
    }
    if (active !== undefined && typeof active !== 'boolean') {
      return errorResponse('INVALID_INPUT', 'Category active value must be boolean.', 400);
    }
    if (category !== undefined && (typeof category !== 'string' || !category.trim())) {
      return errorResponse('INVALID_INPUT', 'Material category classification must be a non-empty string.', 400);
    }
    if (imageUrl !== undefined && imageUrl !== null && typeof imageUrl !== 'string') {
      return errorResponse('INVALID_INPUT', 'Image URL must be a valid string or null.', 400);
    }
    if (displayOrder !== undefined &&
      (typeof displayOrder !== 'number' || !Number.isFinite(displayOrder) || displayOrder < 0)) {
      return errorResponse('INVALID_INPUT', 'Display order must be a non-negative number.', 400);
    }

    const existing = await db.wasteCategory.findUnique({ where: { id } });
    if (!existing) {
      return errorResponse('NOT_FOUND', `Waste category #${id} not found.`, 404);
    }

    const updatedCategory = await db.wasteCategory.update({
      where: { id },
      data: {
        ...(pricePerKg !== undefined ? { pricePerKg } : {}),
        ...(name !== undefined ? { name: name.trim() } : {}),
        ...(description !== undefined ? { description: description.trim() } : {}),
        ...(type !== undefined ? { type: type.trim() } : {}),
        ...(active !== undefined ? { active } : {}),
        ...(category !== undefined ? { category: category.trim() } : {}),
        ...(imageUrl !== undefined ? { imageUrl: imageUrl ? imageUrl.trim() : null } : {}),
        ...(displayOrder !== undefined ? { displayOrder: Math.round(displayOrder) } : {}),
        ...(typeof icon === 'string' && icon.trim() ? { icon: icon.trim() } : {}),
        ...(typeof minWeightKg === 'number' && Number.isFinite(minWeightKg) && minWeightKg > 0 ? { minWeightKg } : {}),
        ...(typeof maxWeightKg === 'number' && Number.isFinite(maxWeightKg) && maxWeightKg > 0 ? { maxWeightKg } : {}),
      },
    });

    // Record Audit Log for rate, details, or activation change
    const action = active !== undefined && pricePerKg === undefined && name === undefined
      ? 'UPDATE_WASTE_CATEGORY_STATUS'
      : 'UPDATE_WASTE_RATE';
    await db.auditLog.create({
      data: {
        userId: authUser?.userId || null,
        userName: authUser?.name || 'Admin Operations',
        action,
        oldValue: `${existing.name}: ₹${existing.pricePerKg}/kg (Active: ${existing.active})`,
        newValue: `${updatedCategory.name}: ₹${updatedCategory.pricePerKg}/kg (Active: ${updatedCategory.active})`,
      },
    }).catch(() => null);

    invalidateCategoriesCache();
    return successResponse(enrichCategoryImage(updatedCategory));
  } catch (err: any) {
    if (err?.code === 'P2002') {
      return errorResponse('CONFLICT', 'A material with this name already exists.', 409);
    }
    console.error('Update waste category error:', err);
    return errorResponse('INTERNAL_SERVER_ERROR', 'Failed to update waste category.', 500);
  }
}

export const PATCH = PUT;

export async function POST(req: NextRequest) {
  try {
    const authUser = await getAuthUser(req);
    const authorizationStatus = getAdminAuthorizationStatus(authUser);
    if (authorizationStatus === 401) {
      return errorResponse('UNAUTHORIZED', 'Authentication is required.', 401);
    }
    if (authorizationStatus === 403) {
      return errorResponse('FORBIDDEN', 'Admin access required.', 403);
    }

    const body = await req.json().catch(() => ({}));
    const {
      name,
      description,
      type = 'RECYCLABLE_BUY',
      pricePerKg,
      category,
      imageUrl,
      displayOrder,
      active = true,
      icon,
      minWeightKg,
      maxWeightKg,
    } = body;

    if (typeof name !== 'string' || !name.trim() ||
      typeof description !== 'string' || !description.trim()) {
      return errorResponse('INVALID_INPUT', 'Category name and description are required.', 400);
    }
    if (typeof type !== 'string' || !type.trim()) {
      return errorResponse('INVALID_INPUT', 'Category type must be a non-empty string.', 400);
    }
    if (pricePerKg !== undefined &&
      (typeof pricePerKg !== 'number' || !Number.isFinite(pricePerKg) || pricePerKg < 0)) {
      return errorResponse('INVALID_INPUT', 'Price per kilogram must be a non-negative number.', 400);
    }
    if (active !== undefined && typeof active !== 'boolean') {
      return errorResponse('INVALID_INPUT', 'Category active value must be boolean.', 400);
    }
    if (displayOrder !== undefined &&
      (typeof displayOrder !== 'number' || !Number.isFinite(displayOrder) || displayOrder < 0)) {
      return errorResponse('INVALID_INPUT', 'Display order must be a non-negative number.', 400);
    }

    const createdCategory = await db.wasteCategory.create({
      data: {
        name: name.trim(),
        description: description.trim(),
        type: type.trim(),
        pricePerKg: pricePerKg ?? 20.0,
        active: typeof active === 'boolean' ? active : true,
        ...(typeof category === 'string' && category.trim() ? { category: category.trim() } : {}),
        ...(typeof imageUrl === 'string' && imageUrl.trim() ? { imageUrl: imageUrl.trim() } : {}),
        ...(typeof displayOrder === 'number' && Number.isFinite(displayOrder) ? { displayOrder: Math.round(displayOrder) } : {}),
        ...(typeof icon === 'string' && icon.trim() ? { icon: icon.trim() } : {}),
        ...(typeof minWeightKg === 'number' && Number.isFinite(minWeightKg) && minWeightKg > 0 ? { minWeightKg } : {}),
        ...(typeof maxWeightKg === 'number' && Number.isFinite(maxWeightKg) && maxWeightKg > 0 ? { maxWeightKg } : {}),
      },
    });

    await db.auditLog.create({
      data: {
        userId: authUser?.userId || null,
        userName: authUser?.name || 'Admin Operations',
        action: 'CREATE_WASTE_CATEGORY',
        oldValue: null,
        newValue: `${createdCategory.name}: ₹${createdCategory.pricePerKg}/kg (Active: ${createdCategory.active ?? true})`,
      },
    }).catch(() => null);

    invalidateCategoriesCache();
    return successResponse(enrichCategoryImage(createdCategory), 201);
  } catch (err: any) {
    if (err?.code === 'P2002') {
      return errorResponse('CONFLICT', 'A material with this name already exists.', 409);
    }
    console.error('Create waste category error:', err);
    return errorResponse('INTERNAL_SERVER_ERROR', 'Failed to create waste category.', 500);
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const authUser = await getAuthUser(req);
    const authorizationStatus = getAdminAuthorizationStatus(authUser);
    if (authorizationStatus === 401) {
      return errorResponse('UNAUTHORIZED', 'Authentication is required.', 401);
    }
    if (authorizationStatus === 403) {
      return errorResponse('FORBIDDEN', 'Admin access required.', 403);
    }

    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');
    if (!id || typeof id !== 'string') {
      return errorResponse('INVALID_INPUT', 'Waste category id is required.', 400);
    }

    const existing = await db.wasteCategory.findUnique({ where: { id: id.trim() } });
    if (!existing) {
      return errorResponse('NOT_FOUND', `Waste category #${id} not found.`, 404);
    }

    // Data-integrity check: inspect whether historical OrderItem records reference this material
    const orderItemsCount =
      typeof (db as any).orderItem?.count === 'function'
        ? await db.orderItem.count({ where: { categoryId: id.trim() } }).catch(() => 0)
        : 0;

    if (orderItemsCount > 0) {
      // Safe soft-deletion / archiving to preserve historical orders and snapshot prices
      const archived = await db.wasteCategory.update({
        where: { id: id.trim() },
        data: { active: false },
      });

      await db.auditLog.create({
        data: {
          userId: authUser?.userId || null,
          userName: authUser?.name || 'Admin Operations',
          action: 'ARCHIVE_WASTE_CATEGORY',
          oldValue: `${existing.name}: ₹${existing.pricePerKg}/kg (Active: ${existing.active})`,
          newValue: `Archived/Deactivated (Referenced by ${orderItemsCount} historical order items)`,
        },
      }).catch(() => null);

      invalidateCategoriesCache();
      return successResponse({
        softDeleted: true,
        archived: true,
        orderItemsCount,
        category: enrichCategoryImage(archived),
        message: `${existing.name} is referenced by ${orderItemsCount} historical order(s) and has been safely deactivated/archived to preserve order history.`,
      });
    }

    // Clean up any unreferenced pricing rules for this category before permanent deletion
    if (typeof (db as any).pricingRule?.deleteMany === 'function') {
      await db.pricingRule.deleteMany({ where: { categoryId: id.trim() } }).catch(() => null);
    }

    await db.wasteCategory.delete({ where: { id: id.trim() } });

    await db.auditLog.create({
      data: {
        userId: authUser?.userId || null,
        userName: authUser?.name || 'Admin Operations',
        action: 'DELETE_WASTE_CATEGORY',
        oldValue: `${existing.name}: ₹${existing.pricePerKg}/kg (Active: ${existing.active})`,
        newValue: null,
      },
    }).catch(() => null);

    invalidateCategoriesCache();
    return successResponse({
      softDeleted: false,
      archived: false,
      orderItemsCount: 0,
      message: `Waste category ${existing.name} permanently deleted.`,
    });
  } catch (err: any) {
    console.error('Delete waste category error:', err);
    return errorResponse('INTERNAL_SERVER_ERROR', 'Failed to delete waste category.', 500);
  }
}

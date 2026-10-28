import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { getAdminAuthorizationStatus, getAuthUser } from '@/lib/auth/middleware';
import { successResponse, errorResponse } from '@/lib/utils/apiResponse';
import { isCustomerWasteCategory } from '@/lib/customerWasteCategories';

let cachedCategories: any = null;
let cacheExpiry = 0;
const CACHE_TTL_MS = 60_000;

export function invalidateCategoriesCache() {
  cachedCategories = null;
  cacheExpiry = 0;
}

export async function GET(req: NextRequest) {
  try {
    const customerOnly = req.nextUrl.searchParams.get('customer') === 'true';
    if (cachedCategories && Date.now() < cacheExpiry) {
      const visibleCategories = customerOnly
        ? cachedCategories.filter((c: any) => c.active && isCustomerWasteCategory(c))
        : cachedCategories;
      const cachedResponse = successResponse(visibleCategories);
      cachedResponse.headers.set('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=300');
      cachedResponse.headers.set('X-Cache', 'HIT');
      return cachedResponse;
    }

    const categorySelect = {
      id: true,
      name: true,
      description: true,
      icon: true,
      type: true,
      pricePerKg: true,
      minWeightKg: true,
      maxWeightKg: true,
      active: true,
    } as const;

    // Fetch all categories without restricting to active only, so cachedCategories has the full catalog
    let categories = await db.wasteCategory.findMany({
      orderBy: { name: 'asc' },
      select: categorySelect,
    });

    if (categories.length === 0) {
      const defaultCategories = [
        { name: 'Plastic Waste', description: 'Bottles, containers, polythene, packaging materials, hard plastics', icon: 'Recycle', type: 'RECYCLABLE_BUY', pricePerKg: 18.0, active: true },
        { name: 'Paper & Cardboard', description: 'Carton boxes, newspapers, magazines, office paper, shredded paper', icon: 'FileText', type: 'RECYCLABLE_BUY', pricePerKg: 14.0, active: true },
        { name: 'Scrap Metal', description: 'Iron, steel, aluminium cans, copper wire, brass fittings, tin', icon: 'Hammer', type: 'RECYCLABLE_BUY', pricePerKg: 32.0, active: true },
        { name: 'E-Waste', description: 'Keyboards, chargers, old phones, motherboards, small appliances', icon: 'Monitor', type: 'RECYCLABLE_BUY', pricePerKg: 45.0, active: true },
        { name: 'Household Dry Waste', description: 'Clean dry packaging, fabric scraps, wooden pieces, rubber items', icon: 'Trash2', type: 'RECYCLABLE_BUY', pricePerKg: 8.0, active: true },
        { name: 'Glass & Bottles', description: 'Intact glass bottles, glass jars, non-broken glass scrap', icon: 'Wine', type: 'RECYCLABLE_BUY', pricePerKg: 4.0, active: true },
        { name: 'Old Furniture & Heavy Scrap', description: 'Chairs, tables, beds, metal frames, heavy bulky junk', icon: 'Armchair', type: 'WASTE_CHARGE', pricePerKg: 15.0, active: true },
        { name: 'Appliances (Fridge/AC/Washing Machine)', description: 'Refrigerators, AC units, washing machines, microwaves', icon: 'Tv', type: 'RECYCLABLE_BUY', pricePerKg: 25.0, active: true },
      ];

      await Promise.all(defaultCategories.map((cat) => db.wasteCategory.upsert({
          where: { name: cat.name },
          update: { pricePerKg: cat.pricePerKg, type: cat.type, description: cat.description },
          create: cat,
        })));

      categories = await db.wasteCategory.findMany({
        orderBy: { name: 'asc' },
        select: categorySelect,
      });
    }

    cachedCategories = categories;
    cacheExpiry = Date.now() + CACHE_TTL_MS;

    const visibleCategories = customerOnly
      ? categories.filter((c: any) => c.active && isCustomerWasteCategory(c))
      : categories;

    const response = successResponse(visibleCategories);
    response.headers.set('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=300');
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
    const { id, pricePerKg, name, description, type, active } = body;

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
      },
    });

    // Record Audit Log for rate or activation change
    const action = active !== undefined ? 'UPDATE_WASTE_CATEGORY_STATUS' : 'UPDATE_WASTE_RATE';
    await db.auditLog.create({
      data: {
        userId: authUser?.userId || null,
        userName: authUser?.name || 'Admin Operations',
        action,
        oldValue: `${existing.name}: ₹${existing.pricePerKg}/kg (Active: ${existing.active})`,
        newValue: `${updatedCategory.name}: ₹${updatedCategory.pricePerKg}/kg (Active: ${updatedCategory.active})`,
      },
    });

    invalidateCategoriesCache();
    return successResponse(updatedCategory);
  } catch (err: any) {
    console.error('Update waste category error:', err);
    return errorResponse('INTERNAL_SERVER_ERROR', 'Failed to update waste category.', 500);
  }
}

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
    const { name, description, type = 'RECYCLABLE_BUY', pricePerKg } = body;

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

    const createdCategory = await db.wasteCategory.create({
      data: {
        name: name.trim(),
        description: description.trim(),
        type: type.trim(),
        pricePerKg: pricePerKg ?? 20.0,
        active: true,
      },
    });

    await db.auditLog.create({
      data: {
        userId: authUser?.userId || null,
        userName: authUser?.name || 'Admin Operations',
        action: 'CREATE_WASTE_CATEGORY',
        oldValue: null,
        newValue: `${createdCategory.name}: ₹${createdCategory.pricePerKg}/kg (Active: true)`,
      },
    });

    invalidateCategoriesCache();
    return successResponse(createdCategory, 201);
  } catch (err: any) {
    console.error('Create waste category error:', err);
    return errorResponse('INTERNAL_SERVER_ERROR', 'Failed to create waste category.', 500);
  }
}

import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { getAuthUser } from '@/lib/auth/middleware';
import { successResponse, errorResponse } from '@/lib/utils/apiResponse';

export async function GET(req: NextRequest) {
  try {
    let categories = await db.wasteCategory.findMany({
      where: { active: true },
      orderBy: { name: 'asc' },
    });

    if (categories.length === 0) {
      const defaultCategories = [
        { name: 'Plastic Waste', description: 'Bottles, containers, polythene, packaging materials, hard plastics', icon: 'Recycle', type: 'RECYCLABLE_BUY', pricePerKg: 18.0 },
        { name: 'Paper & Cardboard', description: 'Carton boxes, newspapers, magazines, office paper, shredded paper', icon: 'FileText', type: 'RECYCLABLE_BUY', pricePerKg: 14.0 },
        { name: 'Scrap Metal', description: 'Iron, steel, aluminium cans, copper wire, brass fittings, tin', icon: 'Hammer', type: 'RECYCLABLE_BUY', pricePerKg: 32.0 },
        { name: 'E-Waste', description: 'Keyboards, chargers, old phones, motherboards, small appliances', icon: 'Monitor', type: 'RECYCLABLE_BUY', pricePerKg: 45.0 },
        { name: 'Household Dry Waste', description: 'Clean dry packaging, fabric scraps, wooden pieces, rubber items', icon: 'Trash2', type: 'RECYCLABLE_BUY', pricePerKg: 8.0 },
        { name: 'Glass & Bottles', description: 'Intact glass bottles, glass jars, non-broken glass scrap', icon: 'Wine', type: 'RECYCLABLE_BUY', pricePerKg: 4.0 },
        { name: 'Old Furniture & Heavy Scrap', description: 'Chairs, tables, beds, metal frames, heavy bulky junk', icon: 'Armchair', type: 'WASTE_CHARGE', pricePerKg: 15.0 },
        { name: 'Appliances (Fridge/AC/Washing Machine)', description: 'Refrigerators, AC units, washing machines, microwaves', icon: 'Tv', type: 'RECYCLABLE_BUY', pricePerKg: 25.0 },
      ];

      for (const cat of defaultCategories) {
        await db.wasteCategory.upsert({
          where: { name: cat.name },
          update: { pricePerKg: cat.pricePerKg, type: cat.type, description: cat.description },
          create: cat,
        });
      }

      categories = await db.wasteCategory.findMany({
        where: { active: true },
        orderBy: { name: 'asc' },
      });
    }

    return successResponse(categories);
  } catch (err: any) {
    return errorResponse('INTERNAL_SERVER_ERROR', 'Failed to fetch waste categories.', 500);
  }
}

export async function PUT(req: NextRequest) {
  try {
    const authUser = await getAuthUser(req);
    const body = await req.json().catch(() => ({}));
    const { id, pricePerKg, name, description, type, active } = body;

    if (!id || typeof id !== 'string') {
      return errorResponse('INVALID_INPUT', 'Waste category id is required.', 400);
    }

    const existing = await db.wasteCategory.findUnique({ where: { id } });
    if (!existing) {
      return errorResponse('NOT_FOUND', `Waste category #${id} not found.`, 404);
    }

    const newRate = typeof pricePerKg === 'number' && !isNaN(pricePerKg) ? Math.max(0, pricePerKg) : existing.pricePerKg;

    const updatedCategory = await db.wasteCategory.update({
      where: { id },
      data: {
        ...(pricePerKg !== undefined ? { pricePerKg: newRate } : {}),
        ...(name ? { name } : {}),
        ...(description ? { description } : {}),
        ...(type ? { type } : {}),
        ...(active !== undefined ? { active } : {}),
      },
    });

    // Record Audit Log for rate change
    await db.auditLog.create({
      data: {
        userId: authUser?.userId || null,
        userName: authUser?.name || 'Admin',
        action: 'UPDATE_WASTE_RATE',
        oldValue: `${existing.name}: ₹${existing.pricePerKg}/kg`,
        newValue: `${updatedCategory.name}: ₹${updatedCategory.pricePerKg}/kg`,
      },
    });

    return successResponse(updatedCategory);
  } catch (err: any) {
    console.error('Update waste category error:', err);
    return errorResponse('INTERNAL_SERVER_ERROR', 'Failed to update waste category.', 500);
  }
}

export async function POST(req: NextRequest) {
  try {
    const authUser = await getAuthUser(req);
    const body = await req.json().catch(() => ({}));
    const { name, description, type = 'RECYCLABLE_BUY', pricePerKg } = body;

    if (!name || !description) {
      return errorResponse('INVALID_INPUT', 'Category name and description are required.', 400);
    }

    const parsedPrice = typeof pricePerKg === 'number' && !isNaN(pricePerKg) 
      ? Math.max(0, pricePerKg) 
      : (pricePerKg !== undefined && !isNaN(Number(pricePerKg)) ? Math.max(0, Number(pricePerKg)) : 20.0);

    const createdCategory = await db.wasteCategory.create({
      data: {
        name,
        description,
        type,
        pricePerKg: parsedPrice,
      },
    });

    await db.auditLog.create({
      data: {
        userId: authUser?.userId || null,
        userName: authUser?.name || 'Admin',
        action: 'CREATE_WASTE_CATEGORY',
        newValue: `${createdCategory.name}: ₹${createdCategory.pricePerKg}/kg`,
      },
    });

    return successResponse(createdCategory, 201);
  } catch (err: any) {
    console.error('Create waste category error:', err);
    return errorResponse('INTERNAL_SERVER_ERROR', 'Failed to create waste category.', 500);
  }
}

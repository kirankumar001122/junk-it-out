import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { describe, test, beforeAll, afterAll } from 'vitest';
import { NextRequest } from 'next/server';
import {
  GET as getMaterials,
  POST as createMaterial,
  PUT as updateMaterial,
  DELETE as deleteMaterial,
} from '../app/api/waste-categories/route';
import { POST as uploadPhoto } from '../app/api/upload/route';
import { GET as viewPhoto } from '../app/api/upload/view/route';
import { signToken } from '../lib/auth/jwt';
import { isCustomerWasteCategory, getMaterialImageUrl } from '../lib/customerWasteCategories';
import { invalidateCategoriesCache } from '../lib/cache/wasteCategoriesCache';
import { db } from '../lib/db';

process.env.JWT_SECRET =
  process.env.JWT_SECRET || 'accepted-materials-test-secret-at-least-32-bytes';

describe('Admin Accepted Materials CRUD, Image Upload & Customer Website Sync', () => {
  const createdCategoryIds: string[] = [];
  const uploadedFiles: string[] = [
    path.join(process.cwd(), 'storage', 'uploads', 'material-photo-1793697492193-g1f5j57.png'),
  ];
  let origUserFindUnique: any;

  beforeAll(() => {
    // Restore real Prisma db.user.findUnique (tests/setup.ts stubs it with tokenVersion: 1)
    origUserFindUnique = (db.user as any).findUnique;
    (db.user as any).findUnique = (args: any) => (db.user as any).findFirst(args);
  });

  afterAll(async () => {
    if (origUserFindUnique) {
      (db.user as any).findUnique = origUserFindUnique;
    }
    for (const id of createdCategoryIds) {
      await db.wasteCategory.delete({ where: { id } }).catch(() => null);
    }
    for (const filePath of uploadedFiles) {
      await fs.promises.unlink(filePath).catch(() => null);
    }
    invalidateCategoriesCache();
  });

  test(
    '1. Verifies Material Image Upload (JPG/PNG/WebP), validation, and public serving',
    async () => {
      const kiranUser = await db.user.findFirst({
        where: { phone: '+918884176048' },
        include: { admin: true },
      });
      assert.ok(kiranUser);

      const adminToken = signToken({
        userId: kiranUser.id,
        phone: kiranUser.phone,
        name: kiranUser.name,
        role: 'SUPER_ADMIN',
        adminId: kiranUser.admin?.id,
        tokenVersion: kiranUser.tokenVersion ?? 1,
      });

      const customerToken = signToken({
        userId: kiranUser.id,
        phone: kiranUser.phone,
        name: kiranUser.name,
        role: 'CUSTOMER',
        tokenVersion: kiranUser.tokenVersion ?? 1,
      });

      // Valid 16-byte PNG header
      const pngBytes = new Uint8Array([
        0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
        0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
      ]);

      // A. Non-admin cannot upload material catalog photos
      const custForm = new FormData();
      custForm.append('file', new File([pngBytes], 'test.png', { type: 'image/png' }));
      custForm.append('purpose', 'material');
      const custUploadRes = await uploadPhoto(
        new NextRequest('http://localhost:3000/api/upload?purpose=material', {
          method: 'POST',
          headers: { Cookie: `jio_token=${customerToken}` },
          body: custForm,
        })
      );
      assert.equal(custUploadRes.status, 403, 'Customer role must be forbidden from uploading material catalog photos');

      // B. Unsupported file type rejected with 400
      const badForm = new FormData();
      badForm.append('file', new File([Buffer.from('not an image')], 'malicious.svg', { type: 'image/svg+xml' }));
      badForm.append('purpose', 'material');
      const badUploadRes = await uploadPhoto(
        new NextRequest('http://localhost:3000/api/upload?purpose=material', {
          method: 'POST',
          headers: { Cookie: `jio_admin_token=${adminToken}` },
          body: badForm,
        })
      );
      assert.equal(badUploadRes.status, 400, 'Unsupported image format must be rejected with 400');

      // C. Admin uploads valid PNG material image
      const adminForm = new FormData();
      adminForm.append('file', new File([pngBytes], 'copper-scrap.png', { type: 'image/png' }));
      adminForm.append('purpose', 'material');
      const validUploadRes = await uploadPhoto(
        new NextRequest('http://localhost:3000/api/upload?purpose=material', {
          method: 'POST',
          headers: { Cookie: `jio_admin_token=${adminToken}` },
          body: adminForm,
        })
      );
      assert.equal(validUploadRes.status, 200, 'Valid admin material photo upload must succeed');
      const uploadBody = await validUploadRes.json();
      assert.equal(uploadBody.success, true);
      assert.ok(uploadBody.url.includes('material-photo-'), 'Uploaded material photo must have material-photo- prefix');

      const parsedUrl = new URL(uploadBody.url, 'http://localhost:3000');
      const rawParam = parsedUrl.searchParams.get('file') || parsedUrl.searchParams.get('url');
      if (rawParam) {
        const cleanFilename = path.basename(decodeURIComponent(rawParam));
        uploadedFiles.push(path.join(process.cwd(), 'storage', 'uploads', cleanFilename));
        uploadedFiles.push(path.join(process.cwd(), 'private', 'uploads', cleanFilename));
      }

      // D. Unauthenticated visitor on customer website can view material-photo-* via /api/upload/view
      const viewUrl = new URL(uploadBody.url, 'http://localhost:3000').toString();
      const publicViewRes = await viewPhoto(new NextRequest(viewUrl));
      assert.equal(publicViewRes.status, 200, 'Public customer website visitors must be able to view material photos');
      assert.ok(
        publicViewRes.headers.get('cache-control')?.includes('public'),
        'Material catalog photo must have public cache-control'
      );
    },
    30_000
  );

  test(
    '2. Verifies full Accepted Materials CRUD, Customer Website sync, and Safe Soft-Delete for referenced materials',
    async () => {
      const kiranUser = await db.user.findFirst({
        where: { phone: '+918884176048' },
        include: { admin: true },
      });
      assert.ok(kiranUser);

      const adminToken = signToken({
        userId: kiranUser.id,
        phone: kiranUser.phone,
        name: kiranUser.name,
        role: 'SUPER_ADMIN',
        adminId: kiranUser.admin?.id,
        tokenVersion: kiranUser.tokenVersion ?? 1,
      });

      const uniqueMaterialName = `Copper Wire Scrap ${Date.now()}`;

      // A. CREATE material
      const createRes = await createMaterial(
        new NextRequest('http://localhost:3000/api/waste-categories', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Cookie: `jio_admin_token=${adminToken}`,
          },
          body: JSON.stringify({
            name: uniqueMaterialName,
            description: 'Clean insulated and bare copper wire scrap',
            category: 'Metal & Scrap',
            type: 'RECYCLABLE_BUY',
            pricePerKg: 420,
            displayOrder: 15,
            imageUrl: '/categories/e-waste.webp',
            active: true,
          }),
        })
      );
      assert.equal(createRes.status, 201, 'Admin material creation must return 201 Created');
      const createdBody = await createRes.json();
      const createdMat = createdBody.data;
      assert.ok(createdMat?.id);
      createdCategoryIds.push(createdMat.id);
      assert.equal(createdMat.name, uniqueMaterialName);
      assert.equal(createdMat.pricePerKg, 420);
      assert.equal(createdMat.category, 'Metal & Scrap');
      assert.equal(createdMat.active, true);

      // B. Verify new active material dynamically appears on customer website (?customer=true)
      const custListRes1 = await getMaterials(
        new NextRequest('http://localhost:3000/api/waste-categories?customer=true')
      );
      const custListBody1 = await custListRes1.json();
      const foundInCust1 = custListBody1.data.find((c: any) => c.id === createdMat.id);
      assert.ok(foundInCust1, 'Newly created active material must appear in customer website API');
      assert.equal(isCustomerWasteCategory(foundInCust1), true);
      assert.equal(getMaterialImageUrl(foundInCust1), '/categories/e-waste.webp');

      // C. UPDATE material name, description, pricePerKg, imageUrl
      const updatedName = `${uniqueMaterialName} Grade-A`;
      const updateRes = await updateMaterial(
        new NextRequest('http://localhost:3000/api/waste-categories', {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            Cookie: `jio_admin_token=${adminToken}`,
          },
          body: JSON.stringify({
            id: createdMat.id,
            name: updatedName,
            description: 'Updated pure copper wire scrap description',
            pricePerKg: 450,
            imageUrl: '/categories/plastic-waste.jpg',
          }),
        })
      );
      assert.equal(updateRes.status, 200);
      const updatedBody = await updateRes.json();
      assert.equal(updatedBody.data.name, updatedName);
      assert.equal(updatedBody.data.pricePerKg, 450);
      assert.equal(updatedBody.data.imageUrl, '/categories/plastic-waste.jpg');

      // Verify customer website reflects updated name, price, and image
      const custListRes2 = await getMaterials(
        new NextRequest('http://localhost:3000/api/waste-categories?customer=true')
      );
      const custListBody2 = await custListRes2.json();
      const foundInCust2 = custListBody2.data.find((c: any) => c.id === createdMat.id);
      assert.ok(foundInCust2);
      assert.equal(foundInCust2.name, updatedName);
      assert.equal(foundInCust2.pricePerKg, 450);
      assert.equal(foundInCust2.imageUrl, '/categories/plastic-waste.jpg');

      // D. Deactivate material -> excluded from customer website, visible in admin catalog
      const deactivateRes = await updateMaterial(
        new NextRequest('http://localhost:3000/api/waste-categories', {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            Cookie: `jio_admin_token=${adminToken}`,
          },
          body: JSON.stringify({
            id: createdMat.id,
            active: false,
          }),
        })
      );
      assert.equal(deactivateRes.status, 200);

      const custListRes3 = await getMaterials(
        new NextRequest('http://localhost:3000/api/waste-categories?customer=true')
      );
      const custListBody3 = await custListRes3.json();
      assert.equal(
        custListBody3.data.some((c: any) => c.id === createdMat.id),
        false,
        'Deactivated material must not appear on customer website'
      );

      const adminListRes = await getMaterials(
        new NextRequest(
          `http://localhost:3000/api/waste-categories?admin=true&status=INACTIVE&search=${encodeURIComponent(updatedName)}`,
          { headers: { Cookie: `jio_admin_token=${adminToken}` } }
        )
      );
      const adminListBody = await adminListRes.json();
      assert.ok(
        adminListBody.data.some((c: any) => c.id === createdMat.id),
        'Deactivated material must remain visible in Admin Accepted Materials search/filter'
      );

      // E. DELETE unreferenced material -> permanently deleted
      const deleteRes = await deleteMaterial(
        new NextRequest(`http://localhost:3000/api/waste-categories?id=${encodeURIComponent(createdMat.id)}`, {
          method: 'DELETE',
          headers: { Cookie: `jio_admin_token=${adminToken}` },
        })
      );
      assert.equal(deleteRes.status, 200);
      const deleteBody = await deleteRes.json();
      assert.equal(deleteBody.data.softDeleted, false);
      createdCategoryIds.pop();

      const afterDelete = await db.wasteCategory.findUnique({ where: { id: createdMat.id } });
      assert.equal(afterDelete, null, 'Unreferenced material must be permanently removed on delete');

      // F. Safe Soft-Delete when material is referenced by historical OrderItems
      const eWaste = await db.wasteCategory.findUnique({ where: { name: 'E-Waste' } });
      assert.ok(eWaste, 'Core E-Waste category must exist');
      const historicalItemBefore = await db.orderItem.findFirst({
        where: { categoryId: eWaste.id },
        select: { id: true, ratePerKg: true },
      });
      assert.ok(historicalItemBefore, 'E-Waste must have historical OrderItem references');

      try {
        const safeDeleteRes = await deleteMaterial(
          new NextRequest(`http://localhost:3000/api/waste-categories?id=${encodeURIComponent(eWaste.id)}`, {
            method: 'DELETE',
            headers: { Cookie: `jio_admin_token=${adminToken}` },
          })
        );
        assert.equal(safeDeleteRes.status, 200);
        const safeDeleteBody = await safeDeleteRes.json();
        assert.equal(
          safeDeleteBody.data.softDeleted,
          true,
          'Referenced material must be soft-deleted/archived rather than hard-deleted'
        );
        assert.ok(safeDeleteBody.data.orderItemsCount > 0);

        // Verify historical OrderItem record and its snapshot ratePerKg remain 100% intact
        const historicalItemAfter = await db.orderItem.findUnique({
          where: { id: historicalItemBefore.id },
          select: { id: true, ratePerKg: true },
        });
        assert.ok(historicalItemAfter, 'Historical OrderItem must remain intact after soft delete');
        assert.equal(
          historicalItemAfter.ratePerKg,
          historicalItemBefore.ratePerKg,
          'Historical OrderItem snapshot ratePerKg must never change'
        );
      } finally {
        // Restore E-Waste to active=true
        await db.wasteCategory.update({
          where: { id: eWaste.id },
          data: { active: true },
        });
        invalidateCategoriesCache();
      }
    },
    90_000
  );
});

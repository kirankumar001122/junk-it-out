-- AlterTable: Add Accepted Materials CRUD fields to WasteCategory safely
ALTER TABLE "WasteCategory" ADD COLUMN IF NOT EXISTS "category" TEXT NOT NULL DEFAULT 'Recyclables';
ALTER TABLE "WasteCategory" ADD COLUMN IF NOT EXISTS "imageUrl" TEXT;
ALTER TABLE "WasteCategory" ADD COLUMN IF NOT EXISTS "displayOrder" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "WasteCategory" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- Backfill core customer materials with default images, categories, and display order
UPDATE "WasteCategory"
SET
  "category" = 'E-Waste',
  "imageUrl" = CASE
    WHEN "imageUrl" IS NULL OR "imageUrl" = '' OR "imageUrl" = '/categories/e-waste-card.png' THEN '/categories/e-waste.webp'
    ELSE "imageUrl"
  END,
  "displayOrder" = 1,
  "active" = true,
  "updatedAt" = CURRENT_TIMESTAMP
WHERE "name" = 'E-Waste';

UPDATE "WasteCategory"
SET
  "category" = 'Household Junk',
  "imageUrl" = CASE
    WHEN "imageUrl" IS NULL OR "imageUrl" = '' OR "imageUrl" = '/categories/household-junk-card.png' THEN '/categories/household-waste.webp'
    ELSE "imageUrl"
  END,
  "displayOrder" = 2,
  "active" = true,
  "updatedAt" = CURRENT_TIMESTAMP
WHERE "name" = 'Household Dry Waste';

UPDATE "WasteCategory"
SET
  "category" = 'Paper & Cardboard',
  "imageUrl" = CASE
    WHEN "imageUrl" IS NULL OR "imageUrl" = '' OR "imageUrl" = '/categories/paper-cardboard-card.png' THEN '/categories/paper-carboard.jpg'
    ELSE "imageUrl"
  END,
  "displayOrder" = 3,
  "active" = true,
  "updatedAt" = CURRENT_TIMESTAMP
WHERE "name" = 'Paper & Cardboard';

UPDATE "WasteCategory"
SET
  "category" = 'Plastic Waste',
  "imageUrl" = CASE
    WHEN "imageUrl" IS NULL OR "imageUrl" = '' OR "imageUrl" = '/categories/plastic-waste-card.png' THEN '/categories/plastic-waste.jpg'
    ELSE "imageUrl"
  END,
  "displayOrder" = 4,
  "active" = true,
  "updatedAt" = CURRENT_TIMESTAMP
WHERE "name" = 'Plastic Waste';

-- Classify legacy secondary categories and keep them inactive until explicitly enabled by Admin
UPDATE "WasteCategory"
SET
  "category" = 'Metal & Scrap',
  "imageUrl" = COALESCE("imageUrl", '/categories/household-waste.webp'),
  "displayOrder" = 5,
  "active" = false,
  "updatedAt" = CURRENT_TIMESTAMP
WHERE "name" = 'Scrap Metal';

UPDATE "WasteCategory"
SET
  "category" = 'Appliances',
  "imageUrl" = COALESCE("imageUrl", '/categories/e-waste.webp'),
  "displayOrder" = 6,
  "active" = false,
  "updatedAt" = CURRENT_TIMESTAMP
WHERE "name" = 'Appliances (Fridge/AC/Washing Machine)';

UPDATE "WasteCategory"
SET
  "category" = 'Glass',
  "imageUrl" = COALESCE("imageUrl", '/categories/plastic-waste.jpg'),
  "displayOrder" = 7,
  "active" = false,
  "updatedAt" = CURRENT_TIMESTAMP
WHERE "name" = 'Glass & Bottles';

UPDATE "WasteCategory"
SET
  "category" = 'Household Junk',
  "imageUrl" = COALESCE("imageUrl", '/categories/household-waste.webp'),
  "displayOrder" = 8,
  "active" = false,
  "updatedAt" = CURRENT_TIMESTAMP
WHERE "name" = 'Old Furniture & Heavy Scrap';

-- Clean up unreferenced test artifact category if present
DELETE FROM "WasteCategory"
WHERE "name" = 'Unauthorized Category Test'
  AND NOT EXISTS (SELECT 1 FROM "OrderItem" oi WHERE oi."categoryId" = "WasteCategory"."id")
  AND NOT EXISTS (SELECT 1 FROM "PricingRule" pr WHERE pr."categoryId" = "WasteCategory"."id");

-- Ensure registered Super Admin account (8884176048) has SUPER_ADMIN role and linked Admin record without duplicating or deleting existing User/Customer records
UPDATE "User"
SET "role" = 'SUPER_ADMIN', "updatedAt" = CURRENT_TIMESTAMP
WHERE "phone" IN ('+918884176048', '8884176048', '08884176048');

INSERT INTO "Admin" ("id", "userId", "department", "accessLevel", "createdAt")
SELECT
  gen_random_uuid()::text,
  u."id",
  'Operations & Management',
  'SUPER_ADMIN',
  CURRENT_TIMESTAMP
FROM "User" u
WHERE u."phone" IN ('+918884176048', '8884176048', '08884176048')
ON CONFLICT ("userId") DO UPDATE
SET
  "accessLevel" = 'SUPER_ADMIN',
  "department" = 'Operations & Management';


-- CreateTable: Ensure ContactEnquiry table and index exist for website contact submissions
CREATE TABLE IF NOT EXISTS "ContactEnquiry" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "phone" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "subject" TEXT NOT NULL,
  "message" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'OPEN',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ContactEnquiry_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "ContactEnquiry_status_createdAt_idx" ON "ContactEnquiry"("status", "createdAt");

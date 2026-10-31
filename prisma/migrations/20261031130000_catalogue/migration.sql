-- CreateEnum
CREATE TYPE "ProductKind" AS ENUM ('HARDWARE', 'SERVICE');

-- CreateEnum
CREATE TYPE "ProductTrackingMode" AS ENUM ('SERIALIZED', 'BULK', 'NONE');

-- CreateEnum
CREATE TYPE "UnitOfMeasure" AS ENUM ('PCS', 'SET', 'M', 'JOB');

-- CreateEnum
CREATE TYPE "ProductCategory" AS ENUM ('PANEL', 'INVERTER', 'CHARGE_CONTROLLER', 'BATTERY', 'MOUNTING', 'WIRING_BOX', 'SWITCHGEAR', 'CABLE', 'EARTHING', 'CONNECTOR', 'INSTALLATION', 'OTHER');

-- CreateTable
CREATE TABLE "manufacturers" (
    "id" UUID NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "manufacturers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "products" (
    "id" UUID NOT NULL,
    "sku" VARCHAR(64) NOT NULL,
    "name" VARCHAR(160) NOT NULL,
    "kind" "ProductKind" NOT NULL,
    "category" "ProductCategory" NOT NULL,
    "trackingMode" "ProductTrackingMode" NOT NULL,
    "unitOfMeasure" "UnitOfMeasure" NOT NULL,
    "manufacturerId" UUID,
    "unitSalePrice" DECIMAL(14,2) NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "packages" (
    "id" UUID NOT NULL,
    "code" VARCHAR(64) NOT NULL,
    "name" VARCHAR(160) NOT NULL,
    "capacityKw" INTEGER NOT NULL,
    "systemType" "SystemType" NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "hardwarePrice" DECIMAL(14,2) NOT NULL,
    "installationPrice" DECIMAL(14,2) NOT NULL,
    "installationProductId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "packages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "package_items" (
    "id" UUID NOT NULL,
    "packageId" UUID NOT NULL,
    "productId" UUID NOT NULL,
    "position" INTEGER NOT NULL,
    "quantity" DECIMAL(12,3) NOT NULL,

    CONSTRAINT "package_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "manufacturers_name_key" ON "manufacturers"("name");

-- CreateIndex
CREATE UNIQUE INDEX "products_sku_key" ON "products"("sku");

-- CreateIndex
CREATE INDEX "products_active_kind_idx" ON "products"("active", "kind");

-- CreateIndex
CREATE UNIQUE INDEX "packages_code_key" ON "packages"("code");

-- CreateIndex
CREATE INDEX "packages_active_capacityKw_systemType_idx" ON "packages"("active", "capacityKw", "systemType");

-- CreateIndex
CREATE UNIQUE INDEX "packages_capacityKw_systemType_revision_key" ON "packages"("capacityKw", "systemType", "revision");

-- CreateIndex
CREATE INDEX "package_items_productId_idx" ON "package_items"("productId");

-- CreateIndex
CREATE UNIQUE INDEX "package_items_packageId_productId_key" ON "package_items"("packageId", "productId");

-- CreateIndex
CREATE UNIQUE INDEX "package_items_packageId_position_key" ON "package_items"("packageId", "position");

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_manufacturerId_fkey" FOREIGN KEY ("manufacturerId") REFERENCES "manufacturers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "packages" ADD CONSTRAINT "packages_installationProductId_fkey" FOREIGN KEY ("installationProductId") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "package_items" ADD CONSTRAINT "package_items_packageId_fkey" FOREIGN KEY ("packageId") REFERENCES "packages"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "package_items" ADD CONSTRAINT "package_items_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- D2 integrity backstops not expressible in Prisma; canonical definitions are registered after review on PG17.11.
ALTER TABLE "manufacturers" ADD CONSTRAINT "manufacturers_name_not_blank" CHECK (length(btrim("name")) > 0);
ALTER TABLE "products" ADD CONSTRAINT "products_sku_format" CHECK ("sku" ~ '^[A-Z0-9][A-Z0-9_-]{1,63}$');
ALTER TABLE "products" ADD CONSTRAINT "products_name_not_blank" CHECK (length(btrim("name")) > 0);
ALTER TABLE "products" ADD CONSTRAINT "products_price_nonnegative" CHECK ("unitSalePrice" >= 0 AND "unitSalePrice" <> 'NaN'::numeric);
ALTER TABLE "products" ADD CONSTRAINT "products_tracking_consistent" CHECK (
  ("kind" = 'SERVICE' AND "trackingMode" = 'NONE' AND "manufacturerId" IS NULL AND "unitOfMeasure" = 'JOB')
  OR ("kind" = 'HARDWARE' AND "trackingMode" IN ('SERIALIZED', 'BULK') AND "manufacturerId" IS NOT NULL)
);
ALTER TABLE "products" ADD CONSTRAINT "products_serialized_uom" CHECK ("trackingMode" <> 'SERIALIZED' OR "unitOfMeasure" = 'PCS');
ALTER TABLE "packages" ADD CONSTRAINT "packages_capacity_range" CHECK ("capacityKw" BETWEEN 1 AND 5);
ALTER TABLE "packages" ADD CONSTRAINT "packages_revision_positive" CHECK ("revision" >= 1);
ALTER TABLE "packages" ADD CONSTRAINT "packages_prices_nonnegative" CHECK (
  "hardwarePrice" >= 0 AND "installationPrice" >= 0
  AND "hardwarePrice" <> 'NaN'::numeric AND "installationPrice" <> 'NaN'::numeric
  AND "hardwarePrice" + "installationPrice" <= 999999999999.99
);
ALTER TABLE "packages" ADD CONSTRAINT "packages_name_not_blank" CHECK (length(btrim("name")) > 0);
ALTER TABLE "package_items" ADD CONSTRAINT "package_items_quantity_positive" CHECK ("quantity" > 0 AND "quantity" <> 'NaN'::numeric);
ALTER TABLE "package_items" ADD CONSTRAINT "package_items_position_positive" CHECK ("position" >= 1);
CREATE UNIQUE INDEX "packages_one_active_revision" ON "packages" ("capacityKw", "systemType") WHERE "active";

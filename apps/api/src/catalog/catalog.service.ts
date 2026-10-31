import { Injectable } from '@nestjs/common';
import { packageDetailSchema, packageListResponseSchema, productListResponseSchema, productViewSchema,
  type PackageDetail, type PackageListQuery, type ProductListQuery, type ProductView } from '@sunshine/contracts';
import { PrismaService } from '../platform/prisma.service';
import { ApiError } from '../platform/api-error';
import type { Prisma } from '../generated/prisma/client';

const productInclude = { manufacturer: { select: { id: true, name: true } } } satisfies Prisma.ProductInclude;
const packageInclude = {
  installationProduct: { include: productInclude },
  items: { orderBy: { position: 'asc' }, include: { product: { include: productInclude } } },
} satisfies Prisma.PackageInclude;
type ProductRow = Prisma.ProductGetPayload<{ include: typeof productInclude }>;
type PackageRow = Prisma.PackageGetPayload<{ include: typeof packageInclude }>;
type PackageBase = Prisma.PackageGetPayload<{}>;

@Injectable()
export class CatalogService {
  constructor(private readonly prisma: PrismaService) {}
  async listProducts(query: ProductListQuery) {
    const where: Prisma.ProductWhereInput = { active: true, kind: query.kind, trackingMode: query.trackingMode, manufacturerId: query.manufacturerId, sku: query.sku };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.product.findMany({ where, include: productInclude, orderBy: { sku: 'asc' }, skip: (query.page - 1) * query.pageSize, take: query.pageSize }),
      this.prisma.product.count({ where }),
    ]);
    return productListResponseSchema.parse({ data: { items: rows.map(productView), total, page: query.page, pageSize: query.pageSize } });
  }
  async listPackages(query: PackageListQuery) {
    const where: Prisma.PackageWhereInput = { active: true, capacityKw: query.capacityKw, systemType: query.systemType };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.package.findMany({ where, orderBy: [{ capacityKw: 'asc' }, { systemType: 'asc' }, { revision: 'desc' }], skip: (query.page - 1) * query.pageSize, take: query.pageSize }),
      this.prisma.package.count({ where }),
    ]);
    return packageListResponseSchema.parse({ data: { items: rows.map(packageSummary), total, page: query.page, pageSize: query.pageSize } });
  }
  async getProduct(id: string) { return { data: await this.getProductFacts(this.prisma, id) }; }
  async getPackage(id: string) { return { data: await this.getPackageFacts(this.prisma, id) }; }

  /** D3 consumes canonical identity/tracking in its own transaction; this helper never starts one. */
  async getProductFacts(tx: Pick<Prisma.TransactionClient, 'product'>, id: string): Promise<ProductView> {
    const row = await tx.product.findUnique({ where: { id }, include: productInclude });
    if (!row) throw new ApiError(404, 'PRODUCT_NOT_FOUND', 'Catalogue product not found');
    return productView(row);
  }
  /** Canonical read facts only. X4 must freeze them into quote lines in the caller transaction. */
  async getPackageFacts(tx: Pick<Prisma.TransactionClient, 'package'>, id: string): Promise<PackageDetail> {
    const row = await tx.package.findUnique({ where: { id }, include: packageInclude });
    if (!row) throw new ApiError(404, 'PACKAGE_NOT_FOUND', 'Package revision not found');
    return packageView(row);
  }
}
function productView(row: ProductRow): ProductView {
  const result = productViewSchema.safeParse({ id: row.id, sku: row.sku, name: row.name, kind: row.kind,
    category: row.category, trackingMode: row.trackingMode, unitOfMeasure: row.unitOfMeasure,
    manufacturerId: row.manufacturerId, manufacturer: row.manufacturer, unitSalePrice: row.unitSalePrice.toFixed(2), active: row.active });
  if (!result.success) throw new ApiError(503, 'CATALOGUE_DATA_INVALID', 'This catalogue product needs review');
  return result.data;
}
function packageSummary(row: PackageBase) {
  return { id: row.id, code: row.code, name: row.name, capacityKw: row.capacityKw, systemType: row.systemType,
    revision: row.revision, active: row.active, hardwarePrice: row.hardwarePrice.toFixed(2), installationPrice: row.installationPrice.toFixed(2),
    totalPrice: row.hardwarePrice.add(row.installationPrice).toFixed(2), installationProductId: row.installationProductId };
}
function packageView(row: PackageRow): PackageDetail {
  const result = packageDetailSchema.safeParse({ ...packageSummary(row), installationProduct: productView(row.installationProduct),
    items: row.items.map((item) => ({ id: item.id, productId: item.productId, position: item.position, quantity: item.quantity.toFixed(3), product: productView(item.product) })) });
  if (!result.success) throw new ApiError(503, 'CATALOGUE_DATA_INVALID', 'This package has incomplete or inconsistent component requirements');
  return result.data;
}

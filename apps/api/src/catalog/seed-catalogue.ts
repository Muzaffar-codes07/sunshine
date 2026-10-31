import { config } from 'dotenv';
import { resolve } from 'node:path';
import { PrismaService } from '../platform/prisma.service';
import { seedWarrantyPolicies } from '../warranty/seed-warranty-policies';
import { CatalogService } from './catalog.service';
import { demoManufacturer, demoProducts, demoPackages } from './demo-catalogue';

/** Idempotent insert-only fixtures. This never resets stock, edits old prices, or rewrites a revision. */
export async function seedCatalogue(prisma: PrismaService) {
  const catalog = new CatalogService(prisma);
  return prisma.$transaction(async (tx) => {
    await tx.manufacturer.upsert({ where: { id: demoManufacturer.id }, update: {}, create: demoManufacturer });
    for (const product of demoProducts) await tx.product.upsert({ where: { id: product.id }, update: {}, create: product });
    for (const kit of demoPackages) {
      const existing = await tx.package.findUnique({ where: { id: kit.data.id }, select: { id: true } });
      if (!existing) {
        await tx.package.create({ data: kit.data });
        for (const item of kit.items) await tx.packageItem.create({ data: item });
      }
      await catalog.getPackageFacts(tx, kit.data.id!);
    }
    return { manufacturers: 1, products: demoProducts.length, packages: demoPackages.length };
  }, { timeout: 30000 });
}
async function main() {
  config({ path: [resolve(process.cwd(), '.env'), resolve(__dirname, '../../../../.env')], quiet: true });
  if (process.env.DEMO_DATABASE_DISPOSABLE !== 'true') throw new Error('Refusing catalogue seed: explicitly set DEMO_DATABASE_DISPOSABLE=true for a disposable local database');
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');
  const prisma = new PrismaService();
  try {
    console.log('Synthetic, pre-tax catalogue fixtures:', JSON.stringify(await seedCatalogue(prisma)));
    console.log('Demo warranty policies:', JSON.stringify(await seedWarrantyPolicies(prisma)));
  }
  finally { await prisma.$disconnect(); }
}
if (require.main === module) main().catch((error: unknown) => {
  console.error(error instanceof Error && error.message.startsWith('Refusing catalogue seed') ? error.message : 'Catalogue seed failed; check migrations and reserved fixture IDs');
  process.exitCode = 1;
});

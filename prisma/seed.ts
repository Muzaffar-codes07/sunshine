import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../apps/api/src/generated/prisma/client';
import { assertD4SeedReady, buildD4Scenarios, D4SeedError, seedD4Scenarios,
  type D4DemoInstallationWriter } from './seed/d4-demo-scenarios';

export async function main(args = process.argv.slice(2)): Promise<void> {
  if (args.length === 1 && args[0] === '--preview') {
    console.log(JSON.stringify({ preview: true, persisted: false, scenarios: buildD4Scenarios() }, null, 2));
    return;
  }
  if (args.length) throw new D4SeedError('D4_SEED_INVALID_ARGUMENT', 'Supported option: --preview');
  // Replace only after the real upstream schema/migration and writer are integrated.
  // Do not fill this seam with in-memory fixtures or scalar Job/Unit UUIDs.
  const installations: D4DemoInstallationWriter | undefined = undefined;
  assertD4SeedReady(installations);
  if (!process.env.DATABASE_URL) throw new D4SeedError('D4_SEED_DATABASE_REQUIRED', 'DATABASE_URL is required');
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
  try {
    const scenarios = await seedD4Scenarios(prisma, { installations });
    console.log(`D4 demo scenarios verified: ${scenarios.map(row => row.serial).join(', ')}`);
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  main().catch(error => {
    // Driver errors may include connection details. Never print credentials/URLs.
    console.error(error instanceof D4SeedError ? `${error.code}: ${error.message}` :
      'D4_SEED_FAILED: Seed transaction failed; no partial scenario was committed. Inspect the local database and integration adapter.');
    process.exitCode = 1;
  });
}

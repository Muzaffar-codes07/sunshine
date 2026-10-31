import { config } from 'dotenv';
import { resolve } from 'node:path';
import { PrismaService } from '../platform/prisma.service';
import { hashPassword } from './passwords';
import { staffRoleSchema } from '@sunshine/contracts';

config({ path: [resolve(process.cwd(), '.env'), resolve(__dirname, '../../../../.env')], quiet: true });
class SeedConfigurationError extends Error {}
async function seed() {
  if (process.env.DEMO_DATABASE_DISPOSABLE !== 'true') throw new SeedConfigurationError('Refusing seed: explicitly set DEMO_DATABASE_DISPOSABLE=true for a disposable local-demo database');
  const password = process.env.DEMO_STAFF_PASSWORD;
  if (!password || password.length < 12 || password.length > 200) throw new SeedConfigurationError('Set DEMO_STAFF_PASSWORD to a local-demo-only password of 12 to 200 characters');
  if (!process.env.DATABASE_URL) throw new SeedConfigurationError('DATABASE_URL is required');
  const prisma = new PrismaService();
  try {
    for (const role of staffRoleSchema.options) {
      const email = `${role.toLowerCase()}@sunshine.test`;
      const existing = await prisma.user.findUnique({ where: { email } });
      if (existing && existing.role !== role) throw new SeedConfigurationError('A reserved demo email has a different staff role; refusing to overwrite it');
      const passwordHash = await hashPassword(password);
      await prisma.user.upsert({
        where: { email },
        create: { email, displayName: `Demo ${role}`, role, passwordHash },
        update: { passwordHash, active: true },
      });
      console.log(`Local-demo staff: ${email} (${role})`);
    }
    console.log('Five demo accounts prepared. Password was read from the environment and was not printed.');
  } finally { await prisma.$disconnect(); }
}
seed().catch((error: unknown) => { console.error(error instanceof SeedConfigurationError ? error.message : 'Staff seed failed; check the local database and migrations'); process.exitCode = 1; });

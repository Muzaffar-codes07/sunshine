import 'dotenv/config';
import { defineConfig } from 'prisma/config';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations' },
  // Explicit development default also permits offline client generation.
  datasource: {
    url: process.env.DATABASE_URL ?? 'postgresql://sunshine:sunshine_local_only@127.0.0.1:55439/sunshine?schema=public',
  },
});

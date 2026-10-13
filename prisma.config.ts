import 'dotenv/config';
import { defineConfig } from 'prisma/config';

export default defineConfig({
  schema: 'prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    // Migrations use a session pooler or direct connection. An empty DIRECT_URL
    // must fall back to DATABASE_URL rather than overriding it.
    url:
      process.env.DIRECT_URL?.trim() || process.env.DATABASE_URL?.trim() || '',
  },
});

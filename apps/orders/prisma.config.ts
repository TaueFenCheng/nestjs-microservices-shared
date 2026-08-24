// Prisma CLI 配置(Prisma 7 要求:连接 URL 放在这里,不再写在 schema 里)
import 'dotenv/config';
import { defineConfig } from 'prisma/config';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: undefined,
  },
  // CLI(migrate/generate)使用该连接串;运行时 PrismaClient 走 driver adapter
  datasource: {
    url: process.env['DATABASE_URL'] ??
      'postgresql://postgres:postgres@localhost:5432/nestjs_microservices?schema=public',
  },
});
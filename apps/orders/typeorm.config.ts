// 先注册 tsconfig-paths(使 @app/shared 别名可解析),再加载实体
import 'tsconfig-paths/register';
import 'reflect-metadata';
import { config } from 'dotenv';
import { DataSource } from 'typeorm';
import { OrderEntity } from './src/entities/order.entity';

// 供 typeorm CLI 使用的独立 DataSource(不经过 Nest 容器):
//   npm run migration:generate -- NewMigration
//   npm run migration:run
config();

export default new DataSource({
  type: 'postgres',
  host: process.env.DB_HOST ?? 'localhost',
  port: Number(process.env.DB_PORT ?? 5432),
  username: process.env.DB_USER ?? 'postgres',
  password: process.env.DB_PASSWORD ?? 'postgres',
  database: process.env.DB_NAME ?? 'nestjs_microservices',
  entities: [OrderEntity],
  migrations: ['apps/orders/src/migrations/*.ts'],
  logging: ['error'],
});
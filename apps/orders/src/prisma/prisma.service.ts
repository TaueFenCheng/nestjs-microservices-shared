import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
// 注意:Prisma 7.x 生成的 client.ts(入口 barrel)在 CJS + @ts-nocheck 组合下
// 存在 import 解析兼容问题(见 docs/typeorm-vs-prisma.md)。internal/class 是它的
// 功能等价物:interface PrismaClient(全部模型 delegate + $ API 的类型)+
// getPrismaClientClass()(运行时构造器),此处组合使用。
import {
  getPrismaClientClass,
  PrismaClient as PrismaClientType,
} from '../generated/prisma/internal/class';

/**
 * PrismaService —— Prisma ORM 7 + NestJS 官方标准姿势的适配:
 *   官方 extends PrismaClient;因上面的兼容层改"组合持有 + 类型化属性"。
 *
 * 与 TypeORM(主线的 @nestjs/typeorm + DataSource)形成对照:
 *   TypeORM:实体类 + 装饰器 + Repository,运行期反射;
 *   Prisma :schema.prisma 生成客户端,编译期类型安全,无实体类。
 */
@Injectable()
export class PrismaService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  /** 类型化 PrismaClient:interface 含全部模型 delegate 与 $ API */
  readonly client: PrismaClientType;

  constructor() {
    // v7 Rust-free client 通过 driver adapter 连接数据库(@prisma/adapter-pg)
    const PrismaClientCtor = getPrismaClientClass() as unknown as new (options: {
      adapter: PrismaPg;
    }) => PrismaClientType;
    this.client = new PrismaClientCtor({
      adapter: new PrismaPg({
        connectionString:
          process.env.DATABASE_URL ??
          'postgresql://postgres:postgres@localhost:5432/nestjs_microservices?schema=public',
      }),
    });
  }

  async onModuleInit(): Promise<void> {
    await this.client.$connect();
    this.logger.log('PrismaClient 已连接 PostgreSQL');
  }

  async onModuleDestroy(): Promise<void> {
    await this.client.$disconnect();
  }
}
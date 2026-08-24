import { Module } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PrismaDemoController } from './prisma-demo.controller';
import { PrismaDemoService } from './prisma-demo.service';

/**
 * Prisma 对照演示模块 —— 与 TypeORM 主线并存,
 * 演示 schema-first ORM 的接入姿势(NestJS 官方 Prisma7 教程同款)。
 */
@Module({
  controllers: [PrismaDemoController],
  providers: [PrismaService, PrismaDemoService],
  exports: [PrismaService],
})
export class PrismaDemoModule {}
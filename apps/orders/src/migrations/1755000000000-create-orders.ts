import { MigrationInterface, QueryRunner } from 'typeorm';

/** 初始表结构:orders(与 OrderEntity 对齐,含乐观锁 version 列) */
export class CreateOrders1755000000000 implements MigrationInterface {
  name = 'CreateOrders1755000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "orders" (
        "id"          uuid PRIMARY KEY,
        "userId"      character varying NOT NULL,
        "items"       jsonb NOT NULL,
        "totalAmount" double precision NOT NULL,
        "status"      character varying NOT NULL DEFAULT 'PENDING',
        "remark"      character varying,
        "created_at"  TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at"  TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "version"     integer NOT NULL DEFAULT 0
      )
    `);
    await queryRunner.query(`CREATE INDEX "IDX_orders_userId" ON "orders" ("userId")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_orders_userId"`);
    await queryRunner.query(`DROP TABLE "orders"`);
  }
}
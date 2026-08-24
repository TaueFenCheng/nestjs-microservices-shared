-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "prisma_orders" (
    "id" UUID NOT NULL,
    "user_id" VARCHAR(64) NOT NULL,
    "items" JSONB NOT NULL,
    "total_amount" DECIMAL(12,2) NOT NULL,
    "status" VARCHAR(20) NOT NULL,
    "remark" VARCHAR(255),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "prisma_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "prisma_audit_log" (
    "id" SERIAL NOT NULL,
    "action" VARCHAR(64) NOT NULL,
    "order_id" UUID,
    "detail" VARCHAR(255),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "prisma_audit_log_pkey" PRIMARY KEY ("id")
);


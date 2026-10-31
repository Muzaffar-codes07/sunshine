-- CreateEnum
CREATE TYPE "JobStatus" AS ENUM ('SCHEDULED', 'IN_PROGRESS', 'AWAITING_ACCEPTANCE', 'COMPLETED');

-- CreateTable
CREATE TABLE "jobs" (
    "id" UUID NOT NULL,
    "orderId" UUID NOT NULL,
    "status" "JobStatus" NOT NULL DEFAULT 'SCHEDULED',
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "jobs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "jobs_orderId_key" ON "jobs"("orderId");

-- CreateIndex
CREATE UNIQUE INDEX "jobs_orderId_id_key" ON "jobs"("orderId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "orders_id_jobId_key" ON "orders"("id", "jobId");

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_id_jobId_fkey" FOREIGN KEY ("id", "jobId") REFERENCES "jobs"("orderId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;


ALTER TABLE "jobs" ADD CONSTRAINT "jobs_version_positive" CHECK ("version" >= 1);

-- Orders confirmed before this helper existed get their job now, so none is left without one.
INSERT INTO "jobs" ("id", "orderId", "updatedAt")
  SELECT gen_random_uuid(), "id", CURRENT_TIMESTAMP FROM "orders" WHERE "jobId" IS NULL;
UPDATE "orders" o SET "jobId" = j."id" FROM "jobs" j WHERE j."orderId" = o."id" AND o."jobId" IS NULL;

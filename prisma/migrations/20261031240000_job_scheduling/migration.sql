-- AlterTable
ALTER TABLE "jobs" ADD COLUMN     "scheduledFinish" TIMESTAMPTZ(3),
ADD COLUMN     "scheduledStart" TIMESTAMPTZ(3);

-- CreateTable
CREATE TABLE "job_assignments" (
    "id" UUID NOT NULL,
    "jobId" UUID NOT NULL,
    "technicianId" UUID NOT NULL,
    "assignedById" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "removedAt" TIMESTAMPTZ(3),

    CONSTRAINT "job_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "job_assignments_jobId_idx" ON "job_assignments"("jobId");

-- CreateIndex
CREATE INDEX "job_assignments_technicianId_removedAt_idx" ON "job_assignments"("technicianId", "removedAt");

-- CreateIndex
CREATE INDEX "job_assignments_assignedById_idx" ON "job_assignments"("assignedById");

-- AddForeignKey
ALTER TABLE "job_assignments" ADD CONSTRAINT "job_assignments_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "jobs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_assignments" ADD CONSTRAINT "job_assignments_technicianId_fkey" FOREIGN KEY ("technicianId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_assignments" ADD CONSTRAINT "job_assignments_assignedById_fkey" FOREIGN KEY ("assignedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


ALTER TABLE "jobs" ADD CONSTRAINT "jobs_schedule_ordered" CHECK (("scheduledStart" IS NULL AND "scheduledFinish" IS NULL) OR ("scheduledStart" IS NOT NULL AND "scheduledFinish" IS NOT NULL AND "scheduledStart" < "scheduledFinish"));
ALTER TABLE "job_assignments" ADD CONSTRAINT "job_assignments_removed_after_created" CHECK ("removedAt" IS NULL OR "removedAt" >= "createdAt");

-- A technician is on a job once at a time; removing them and adding them back makes a new row.
CREATE UNIQUE INDEX "job_assignments_one_active" ON "job_assignments"("jobId", "technicianId") WHERE "removedAt" IS NULL;

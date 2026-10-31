BEGIN;
-- CreateEnum
CREATE TYPE "FileContextType" AS ENUM ('JOB', 'TICKET');

-- CreateTable
CREATE TABLE "files" (
    "id" UUID NOT NULL,
    "storageKey" VARCHAR(36) NOT NULL,
    "originalName" VARCHAR(150) NOT NULL,
    "mediaType" VARCHAR(40) NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "sha256" VARCHAR(64) NOT NULL,
    "uploadedById" UUID NOT NULL,
    "contextType" "FileContextType",
    "contextId" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "files_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "files_storageKey_key" ON "files"("storageKey");

-- CreateIndex
CREATE INDEX "files_contextType_contextId_idx" ON "files"("contextType", "contextId");

-- CreateIndex
CREATE INDEX "files_uploadedById_createdAt_idx" ON "files"("uploadedById", "createdAt");

-- AddForeignKey
ALTER TABLE "files" ADD CONSTRAINT "files_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "files" ADD CONSTRAINT "files_storage_key_format"
  CHECK ("storageKey" ~ '^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$');
ALTER TABLE "files" ADD CONSTRAINT "files_original_name_not_blank"
  CHECK (length(btrim("originalName")) > 0 AND "originalName" !~ '[[:cntrl:]]');
ALTER TABLE "files" ADD CONSTRAINT "files_media_type_known"
  CHECK ("mediaType" IN ('image/jpeg', 'image/png', 'image/webp', 'application/pdf'));
ALTER TABLE "files" ADD CONSTRAINT "files_size_range"
  CHECK ("sizeBytes" > 0 AND "sizeBytes" <= 10485760);
ALTER TABLE "files" ADD CONSTRAINT "files_sha256_format" CHECK ("sha256" ~ '^[a-f0-9]{64}$');
ALTER TABLE "files" ADD CONSTRAINT "files_context_consistent"
  CHECK (("contextType" IS NULL) = ("contextId" IS NULL));
COMMIT;

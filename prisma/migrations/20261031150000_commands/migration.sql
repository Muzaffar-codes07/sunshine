-- CreateTable
CREATE TABLE "commands" (
    "id" UUID NOT NULL,
    "actorId" UUID NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "payloadHash" TEXT NOT NULL,
    "result" JSONB,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "commands_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "commands_actorId_idempotencyKey_key" ON "commands"("actorId", "idempotencyKey");

-- AddForeignKey
ALTER TABLE "commands" ADD CONSTRAINT "commands_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Hand-written rules (listed in prisma/required-constraints.json).
ALTER TABLE "commands" ADD CONSTRAINT "commands_key_format" CHECK ("idempotencyKey" ~ '^[A-Za-z0-9_-]{8,128}$');
ALTER TABLE "commands" ADD CONSTRAINT "commands_action_format" CHECK ("action" ~ '^[A-Z][A-Z0-9_]*$');
ALTER TABLE "commands" ADD CONSTRAINT "commands_payload_hash_format" CHECK ("payloadHash" ~ '^[0-9a-f]{64}$');
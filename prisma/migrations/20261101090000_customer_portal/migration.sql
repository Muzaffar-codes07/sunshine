-- Customer accounts remain separate from staff identities and require email verification.
CREATE TABLE "customer_accounts" (
  "id" UUID NOT NULL,
  "customerId" UUID NOT NULL,
  "email" VARCHAR(254) NOT NULL,
  "passwordHash" TEXT NOT NULL,
  "verifiedAt" TIMESTAMPTZ(3),
  "registrationTokenHash" VARCHAR(64),
  "registrationExpiresAt" TIMESTAMPTZ(3),
  "pendingEmail" VARCHAR(254),
  "pendingEmailTokenHash" VARCHAR(64),
  "pendingEmailExpiresAt" TIMESTAMPTZ(3),
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "customer_accounts_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "customer_accounts_email_lowercase" CHECK ("email" = lower("email")),
  CONSTRAINT "customer_accounts_pending_email_lowercase" CHECK ("pendingEmail" IS NULL OR "pendingEmail" = lower("pendingEmail"))
);
CREATE UNIQUE INDEX "customer_accounts_customerId_key" ON "customer_accounts"("customerId");
CREATE UNIQUE INDEX "customer_accounts_email_key" ON "customer_accounts"("email");
CREATE UNIQUE INDEX "customer_accounts_registrationTokenHash_key" ON "customer_accounts"("registrationTokenHash");
CREATE UNIQUE INDEX "customer_accounts_pendingEmailTokenHash_key" ON "customer_accounts"("pendingEmailTokenHash");
CREATE INDEX "customer_accounts_pendingEmail_idx" ON "customer_accounts"("pendingEmail");
ALTER TABLE "customer_accounts" ADD CONSTRAINT "customer_accounts_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

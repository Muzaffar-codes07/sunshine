-- D2: express-session/connect-pg-simple backing store. No implicit runtime table creation.
CREATE TABLE "staff_sessions" (
  "sid" VARCHAR(255) NOT NULL,
  "sess" JSON NOT NULL,
  -- connect-pg-simple expects its expire column as timestamp(6) without timezone (library table.sql).
  "expire" TIMESTAMP(6) NOT NULL,
  CONSTRAINT "staff_sessions_pkey" PRIMARY KEY ("sid")
);
CREATE INDEX "staff_sessions_expire_idx" ON "staff_sessions" ("expire");

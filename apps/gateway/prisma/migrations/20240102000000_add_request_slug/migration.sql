-- Add slug column to payment_requests (default to id for existing rows)
ALTER TABLE "payment_requests" ADD COLUMN "slug" TEXT NOT NULL DEFAULT '';

-- Backfill existing rows: use first 8 chars of id as slug
UPDATE "payment_requests" SET "slug" = LEFT("id", 8) WHERE "slug" = '';

-- Add unique constraint on (username, slug)
CREATE UNIQUE INDEX "payment_requests_username_slug_key" ON "payment_requests"("username", "slug");

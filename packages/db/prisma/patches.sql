-- Parches idempotentes: se aplican en cada arranque, sobre bases creadas con versiones anteriores del esquema.
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "confirmAt" TIMESTAMP(3);
ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "optOutAt" TIMESTAMP(3);
ALTER TABLE "CampaignDraft" ADD COLUMN IF NOT EXISTS "metrics" JSONB;
ALTER TABLE "CampaignDraft" ADD COLUMN IF NOT EXISTS "sample" BOOLEAN NOT NULL DEFAULT false;
CREATE TABLE IF NOT EXISTS "Account" (
  "id" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "role" TEXT NOT NULL DEFAULT 'owner',
  "storeId" TEXT NOT NULL,
  "passwordHash" TEXT NOT NULL,
  "tourDone" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "Account_email_key" ON "Account"("email");
CREATE TABLE IF NOT EXISTS "Audience" (
  "id" TEXT NOT NULL,
  "storeId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "segment" TEXT NOT NULL,
  "size" INTEGER NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'DRAFT',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Audience_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "Audience_storeId_createdAt_idx" ON "Audience"("storeId", "createdAt");
CREATE TABLE IF NOT EXISTS "StoreAudit" (
  "id" TEXT NOT NULL,
  "storeId" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "source" TEXT NOT NULL,
  "score" INTEGER,
  "evaluated" INTEGER NOT NULL,
  "total" INTEGER NOT NULL,
  "url" TEXT,
  "payload" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "StoreAudit_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "StoreAudit_storeId_kind_createdAt_idx" ON "StoreAudit"("storeId", "kind", "createdAt");
CREATE TABLE IF NOT EXISTS "MediaAsset" (
  "id" TEXT NOT NULL,
  "storeId" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "source" TEXT NOT NULL,
  "role" TEXT NOT NULL DEFAULT 'producto',
  "product" TEXT,
  "seed" TEXT,
  "file" TEXT,
  "mime" TEXT,
  "bytes" INTEGER,
  "durationS" INTEGER,
  "sample" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MediaAsset_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "MediaAsset_storeId_createdAt_idx" ON "MediaAsset"("storeId", "createdAt");
ALTER TABLE "MediaAsset" ADD COLUMN IF NOT EXISTS "externalUrl" TEXT;
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "paymentLinkId" TEXT;
CREATE TABLE IF NOT EXISTS "UsageEvent" (
  "id" TEXT NOT NULL,
  "storeId" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "feature" TEXT NOT NULL,
  "tokensIn" INTEGER NOT NULL DEFAULT 0,
  "tokensOut" INTEGER NOT NULL DEFAULT 0,
  "credits" INTEGER NOT NULL DEFAULT 0,
  "costUsd" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "UsageEvent_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "UsageEvent_storeId_at_idx" ON "UsageEvent"("storeId", "at");
CREATE TABLE IF NOT EXISTS "SiteProject" (
  "id" TEXT NOT NULL,
  "storeId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "platform" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'borrador',
  "design" JSONB NOT NULL,
  "githubUrl" TEXT,
  "note" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SiteProject_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "SiteProject_storeId_updatedAt_idx" ON "SiteProject"("storeId", "updatedAt");

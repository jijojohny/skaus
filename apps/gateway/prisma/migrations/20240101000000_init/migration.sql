-- CreateTable
CREATE TABLE "profiles" (
    "username" TEXT NOT NULL,
    "nameHash" TEXT,
    "displayName" TEXT NOT NULL DEFAULT '',
    "bio" TEXT NOT NULL DEFAULT '',
    "avatarUri" TEXT NOT NULL DEFAULT '',
    "links" JSONB NOT NULL DEFAULT '[]',
    "paymentConfig" JSONB NOT NULL DEFAULT '{"acceptedTokens":["USDC"],"suggestedAmounts":[],"customAmountEnabled":true,"thankYouMessage":""}',
    "tiers" JSONB NOT NULL DEFAULT '[]',
    "gatedContent" JSONB NOT NULL DEFAULT '[]',
    "version" INTEGER NOT NULL DEFAULT 1,
    "updatedAt" BIGINT NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "profiles_pkey" PRIMARY KEY ("username")
);

-- CreateTable
CREATE TABLE "deposit_events" (
    "id" SERIAL NOT NULL,
    "pool" TEXT NOT NULL,
    "commitment" TEXT NOT NULL,
    "leafIndex" INTEGER NOT NULL,
    "amount" TEXT NOT NULL DEFAULT '0',
    "encryptedNote" TEXT NOT NULL,
    "txSignature" TEXT NOT NULL,
    "slot" BIGINT NOT NULL,
    "timestamp" BIGINT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "deposit_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "name_records" (
    "nameHash" TEXT NOT NULL,
    "authority" TEXT NOT NULL,
    "scanPubkey" TEXT NOT NULL,
    "spendPubkey" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "profileCid" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "updatedAt" BIGINT NOT NULL,
    "txSignature" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "name_records_pkey" PRIMARY KEY ("nameHash")
);

-- CreateTable
CREATE TABLE "payment_requests" (
    "id" TEXT NOT NULL,
    "creator" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "token" TEXT NOT NULL DEFAULT 'USDC',
    "memo" TEXT NOT NULL DEFAULT '',
    "title" TEXT NOT NULL DEFAULT 'Payment link',
    "openAmount" BOOLEAN NOT NULL DEFAULT false,
    "expiresAt" BIGINT,
    "maxPayments" INTEGER NOT NULL DEFAULT 1,
    "depositPathIndex" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "views" INTEGER NOT NULL DEFAULT 0,
    "createdAt" BIGINT NOT NULL,
    "updatedAt" BIGINT NOT NULL,

    CONSTRAINT "payment_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payments" (
    "id" SERIAL NOT NULL,
    "requestId" TEXT NOT NULL,
    "txSignature" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "paidAt" BIGINT NOT NULL,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "indexer_checkpoints" (
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,

    CONSTRAINT "indexer_checkpoints_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "relay_metrics" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "totalRelayed" BIGINT NOT NULL DEFAULT 0,

    CONSTRAINT "relay_metrics_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "profiles_nameHash_key" ON "profiles"("nameHash");

-- CreateIndex
CREATE UNIQUE INDEX "deposit_events_commitment_key" ON "deposit_events"("commitment");

-- CreateIndex
CREATE UNIQUE INDEX "deposit_events_txSignature_key" ON "deposit_events"("txSignature");

-- CreateIndex
CREATE INDEX "deposit_events_pool_idx" ON "deposit_events"("pool");

-- CreateIndex
CREATE INDEX "deposit_events_timestamp_idx" ON "deposit_events"("timestamp");

-- CreateIndex
CREATE INDEX "name_records_authority_idx" ON "name_records"("authority");

-- CreateIndex
CREATE INDEX "payment_requests_creator_idx" ON "payment_requests"("creator");

-- CreateIndex
CREATE INDEX "payments_requestId_idx" ON "payments"("requestId");

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_requestId_fkey"
    FOREIGN KEY ("requestId") REFERENCES "payment_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

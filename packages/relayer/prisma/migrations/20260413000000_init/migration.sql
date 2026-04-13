CREATE TABLE "withdrawal_jobs" (
    "id"            TEXT NOT NULL,
    "proofBase64"   TEXT NOT NULL,
    "merkleRoot"    TEXT NOT NULL,
    "nullifierHash" TEXT NOT NULL,
    "recipient"     TEXT NOT NULL,
    "amount"        TEXT NOT NULL,
    "fee"           TEXT NOT NULL,
    "tokenMint"     TEXT NOT NULL,
    "status"        TEXT NOT NULL DEFAULT 'pending',
    "txSignature"   TEXT,
    "attempts"      INTEGER NOT NULL DEFAULT 0,
    "lastError"     TEXT,
    "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"     TIMESTAMP(3) NOT NULL,

    CONSTRAINT "withdrawal_jobs_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "withdrawal_jobs_nullifierHash_key" ON "withdrawal_jobs"("nullifierHash");

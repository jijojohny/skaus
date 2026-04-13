-- Migration: add_compressed_hash_to_profiles
--
-- Adds two columns to the `profiles` table to track ZK-compressed account
-- state (Light Protocol):
--   compressed_hash     — hex-encoded 32-byte leaf hash in the state tree
--   compressed_on_chain — whether the hash has been confirmed in NameRecord

ALTER TABLE "profiles"
  ADD COLUMN "compressedHash"     TEXT UNIQUE,
  ADD COLUMN "compressedOnChain"  BOOLEAN NOT NULL DEFAULT FALSE;

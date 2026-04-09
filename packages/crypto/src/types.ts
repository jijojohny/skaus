export interface StealthMetaAddress {
  scanPubkey: Uint8Array;   // Curve25519 public key for detecting deposits
  spendPubkey: Uint8Array;  // Curve25519 public key for spending
  version: number;
}

export interface DepositNoteData {
  secret: bigint;
  nullifier: bigint;
  amount: bigint;
  tokenMint: string;
  ephemeralPubkey: Uint8Array;
}

export interface ViewingCredential {
  scopedKey: Uint8Array;
  scope: {
    startTime: number;
    endTime: number;
    tokenMints?: string[];
  };
  issuedTo: Uint8Array;   // Auditor's public key
  issuedAt: number;
}

export interface WithdrawalProofInput {
  merkleRoot: bigint;
  nullifierHash: bigint;
  recipient: bigint;
  amount: bigint;
  fee: bigint;
  secret: bigint;
  nullifier: bigint;
  merklePath: bigint[];
  pathIndices: number[];
}

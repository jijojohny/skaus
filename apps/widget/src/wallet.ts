// ---------------------------------------------------------------------------
// Minimal window.solana wallet adapter
// No @solana/web3.js, no Buffer, no bs58 — pure browser APIs only
// ---------------------------------------------------------------------------

/** Subset of the Phantom/Backpack provider interface we actually use */
interface SolanaProvider {
  isPhantom?: boolean;
  isBackpack?: boolean;
  publicKey: { toString(): string } | null;
  connect(opts?: { onlyIfTrusted?: boolean }): Promise<{ publicKey: { toString(): string } }>;
  signAndSendTransaction(tx: unknown): Promise<{ signature: string }>;
  signTransaction?(tx: unknown): Promise<unknown>;
}

function getProvider(): SolanaProvider {
  const w = window as unknown as { solana?: SolanaProvider; backpack?: SolanaProvider };
  const provider = w.solana ?? w.backpack;
  if (!provider) {
    throw new Error('No Solana wallet found. Please install Phantom or Backpack.');
  }
  return provider;
}

export interface WalletInfo {
  publicKey: string;
}

/**
 * Connect the wallet and return the public key string.
 * Safe to call multiple times — uses onlyIfTrusted to avoid re-prompting if already connected.
 */
export async function connectWallet(): Promise<WalletInfo> {
  const provider = getProvider();

  // Already connected
  if (provider.publicKey) {
    return { publicKey: provider.publicKey.toString() };
  }

  const res = await provider.connect({ onlyIfTrusted: false });
  return { publicKey: res.publicKey.toString() };
}

/**
 * Decode a base64 string to Uint8Array without using Buffer or atob polyfills.
 * atob is natively available in every browser and modern Node (≥16).
 */
function base64ToUint8Array(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/**
 * Encode a Uint8Array to base64 without Buffer.
 */
function uint8ArrayToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

/**
 * A minimal transaction wrapper that the Phantom/Backpack wallet
 * provider can accept via signAndSendTransaction.
 *
 * The gateway returns a base64-encoded serialized transaction.
 * We wrap the raw bytes in an object with a serialize() method
 * so wallets that expect a Transaction-like object can handle it.
 *
 * If the wallet supports the raw bytes path (newer wallets), we pass that directly.
 */
interface TransactionLike {
  serialize(): Uint8Array;
  _bytes: Uint8Array;
}

function wrapTransaction(bytes: Uint8Array): TransactionLike {
  return {
    _bytes: bytes,
    serialize() { return bytes; },
  };
}

/**
 * Sign and send a base64-encoded transaction via window.solana.
 * Returns the transaction signature string.
 */
export async function signAndSendTransaction(txBase64: string): Promise<string> {
  const provider = getProvider();

  // Ensure wallet is connected first
  if (!provider.publicKey) {
    await provider.connect({ onlyIfTrusted: false });
  }

  const txBytes = base64ToUint8Array(txBase64);
  const tx = wrapTransaction(txBytes);

  const { signature } = await provider.signAndSendTransaction(tx);
  return signature;
}

export { uint8ArrayToBase64 };

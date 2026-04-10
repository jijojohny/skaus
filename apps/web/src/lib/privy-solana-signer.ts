import type { ConnectedStandardSolanaWallet, UseSignTransaction } from '@privy-io/react-auth/solana';
import { Transaction } from '@solana/web3.js';

/**
 * Wraps Privy's Solana `signTransaction` into the shape expected by `executeDeposit`.
 */
export function createPrivySolanaSigner(
  wallet: ConnectedStandardSolanaWallet | undefined | null,
  signTransaction: UseSignTransaction['signTransaction'],
): (tx: Transaction) => Promise<Transaction> {
  if (!wallet) {
    return async () => {
      throw new Error('Connect a Solana wallet to sign transactions');
    };
  }

  return async (tx: Transaction) => {
    const serializedForSigning = tx.serialize({
      requireAllSignatures: false,
      verifySignatures: false,
    });
    const { signedTransaction } = await signTransaction({
      transaction: serializedForSigning,
      wallet,
    });
    return Transaction.from(signedTransaction);
  };
}

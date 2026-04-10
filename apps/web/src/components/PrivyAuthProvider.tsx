'use client';

import { ReactNode } from 'react';
import { PrivyProvider } from '@privy-io/react-auth';
import { toSolanaWalletConnectors } from '@privy-io/react-auth/solana';
import { createSolanaRpc } from '@solana/kit';

const solanaConnectors = toSolanaWalletConnectors();

const DEVNET_RPC_URL = process.env.NEXT_PUBLIC_SOLANA_RPC_URL || 'https://api.devnet.solana.com';

export function PrivyAuthProvider({ children }: { children: ReactNode }) {
  const appId = process.env.NEXT_PUBLIC_PRIVY_APP_ID || '';

  if (!appId) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-skaus-dark text-skaus-muted">
        <p className="text-sm">Missing NEXT_PUBLIC_PRIVY_APP_ID — set it in .env.local</p>
      </div>
    );
  }

  return (
    <PrivyProvider
      appId={appId}
      config={{
        appearance: {
          theme: 'dark',
          accentColor: '#ff2d2d',
          walletChainType: 'solana-only',
          showWalletLoginFirst: false,
          logo: undefined,
        },
        loginMethods: ['google', 'twitter', 'wallet'],
        solana: {
          rpcs: {
            'solana:devnet': {
              rpc: createSolanaRpc(DEVNET_RPC_URL),
            },
            'solana:mainnet': {
              rpc: createSolanaRpc(DEVNET_RPC_URL),
            },
          },
        },
        embeddedWallets: {
          solana: {
            createOnLogin: 'users-without-wallets',
          },
        },
        externalWallets: {
          solana: {
            connectors: solanaConnectors,
          },
        },
      }}
    >
      {children}
    </PrivyProvider>
  );
}

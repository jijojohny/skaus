import type { Metadata } from 'next';
import { WalletProviderWrapper } from '@/components/WalletProvider';
import './globals.css';

export const metadata: Metadata = {
  title: 'SKAUS — Private Payments on Solana',
  description: 'Privacy-preserving payment infrastructure. Send and receive funds with cryptographic unlinkability.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen">
        <WalletProviderWrapper>
          {children}
        </WalletProviderWrapper>
      </body>
    </html>
  );
}

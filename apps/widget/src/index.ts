// ---------------------------------------------------------------------------
// SKAUS Payment Widget — IIFE entry point
// Usage:
//   <script src="skaus-widget.js"></script>
//   <div id="skaus-pay" data-recipient="alice" data-token="USDC"></div>
//   <script>SKAUS.mount('#skaus-pay', { gatewayUrl: 'https://api.skaus.xyz' })</script>
// ---------------------------------------------------------------------------

import { createWidget, showLoading, showSuccess, showError, setButtonDisabled } from './ui';
import { createPaymentRequest } from './api';
import { connectWallet, signAndSendTransaction } from './wallet';

export interface MountOptions {
  /** Base URL of the SKAUS gateway API (no trailing slash) */
  gatewayUrl: string;
  /** Recipient username override (falls back to data-recipient attribute) */
  recipient?: string;
  /** Token symbol override (falls back to data-token attribute) */
  token?: string;
  /** Token mint address — required if the gateway needs it */
  tokenMint?: string;
  /** Called when a payment completes successfully */
  onSuccess?: (txSignature: string) => void;
  /** Called when a payment fails */
  onError?: (err: Error) => void;
}

// Known token mint addresses (USDC/USDT on mainnet)
const TOKEN_MINTS: Record<string, string> = {
  USDC: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
  USDT: 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB',
  SOL:  'So11111111111111111111111111111111111111112',
};

/**
 * Mount the SKAUS payment widget into the given selector or element.
 * Returns a cleanup function that removes the widget.
 */
export function mount(
  selectorOrElement: string | HTMLElement,
  options: MountOptions,
): () => void {
  const container =
    typeof selectorOrElement === 'string'
      ? document.querySelector<HTMLElement>(selectorOrElement)
      : selectorOrElement;

  if (!container) {
    console.warn(`[SKAUS] mount target not found: ${selectorOrElement}`);
    return () => {};
  }

  const recipient =
    options.recipient ??
    container.dataset['recipient'] ??
    '';

  const token =
    options.token ??
    container.dataset['token'] ??
    'USDC';

  const tokenMint =
    options.tokenMint ??
    TOKEN_MINTS[token.toUpperCase()] ??
    TOKEN_MINTS['USDC'];

  if (!recipient) {
    console.warn('[SKAUS] No recipient specified. Provide data-recipient or options.recipient.');
    return () => {};
  }

  const { root, button, statusEl, amountInput } = createWidget(
    container,
    { gatewayUrl: options.gatewayUrl, recipient, token },
    {
      onPay: async (amount: number) => {
        setButtonDisabled(button, true);
        showLoading(statusEl, 'Connecting wallet…');

        let walletPubkey: string;
        try {
          const wallet = await connectWallet();
          walletPubkey = wallet.publicKey;
        } catch (err) {
          const e = err instanceof Error ? err : new Error(String(err));
          showError(statusEl, `Wallet error: ${e.message}`);
          setButtonDisabled(button, false);
          options.onError?.(e);
          return;
        }

        showLoading(statusEl, 'Creating payment request…');

        let requestId: string;
        let payUrl: string | undefined;
        try {
          // Convert human-readable amount to micro-units (6 decimals for USDC/USDT)
          const microUnits = Math.round(amount * 1_000_000);
          const req = await createPaymentRequest(options.gatewayUrl, {
            recipient,
            tokenMint,
            amount: microUnits,
            creator: walletPubkey,
            username: recipient,
            title: `Pay @${recipient}`,
          });
          requestId = req.id;
          payUrl = req.payUrl;
        } catch (err) {
          const e = err instanceof Error ? err : new Error(String(err));
          showError(statusEl, `Request failed: ${e.message}`);
          setButtonDisabled(button, false);
          options.onError?.(e);
          return;
        }

        // The gateway may return a transaction to sign (stealth deposit flow).
        // If it returns a payUrl (web-based flow), open it in a popup.
        // For now, if there's no tx to sign, show the pay link.
        if (payUrl) {
          showSuccess(
            statusEl,
            `Payment request created! Share this link or open it to complete payment.`,
            payUrl,
          );
          amountInput.value = '';
          setButtonDisabled(button, false);
          options.onSuccess?.(requestId);
          return;
        }

        // Future: if gateway returns a base64 transaction, sign it here.
        showSuccess(statusEl, 'Payment request created!');
        amountInput.value = '';
        setButtonDisabled(button, false);
        options.onSuccess?.(requestId);
      },
    },
  );

  return () => {
    container.removeChild(root);
  };
}

/**
 * Auto-mount any elements with data-skaus-mount attribute.
 * Called automatically when the script loads.
 *
 * Example:
 *   <div data-skaus-mount data-recipient="alice" data-gateway="https://api.skaus.xyz"></div>
 */
function autoMount(): void {
  const elements = document.querySelectorAll<HTMLElement>('[data-skaus-mount]');
  elements.forEach((el) => {
    const gatewayUrl =
      el.dataset['gateway'] ?? 'http://localhost:3001';
    mount(el, { gatewayUrl });
  });
}

// Auto-mount on DOM ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', autoMount);
} else {
  autoMount();
}

export { signAndSendTransaction };

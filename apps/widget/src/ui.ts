// ---------------------------------------------------------------------------
// Payment widget DOM — zero external dependencies, inline CSS only
// ---------------------------------------------------------------------------

const STYLE = `
.skaus-widget{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;
box-sizing:border-box;background:#111827;border:1px solid #1f2937;border-radius:12px;
padding:20px;max-width:340px;color:#f9fafb;font-size:14px;line-height:1.5}
.skaus-widget *{box-sizing:border-box}
.skaus-header{display:flex;align-items:center;gap:8px;margin-bottom:16px}
.skaus-logo{width:28px;height:28px;background:#2563eb;border-radius:8px;display:flex;
align-items:center;justify-content:center;flex-shrink:0}
.skaus-logo svg{display:block}
.skaus-title{font-size:15px;font-weight:700;color:#f9fafb}
.skaus-subtitle{font-size:12px;color:#6b7280;margin-top:1px}
.skaus-recipient{background:#1f2937;border-radius:8px;padding:10px 12px;margin-bottom:12px}
.skaus-recipient-label{font-size:11px;color:#6b7280;font-weight:500;margin-bottom:2px}
.skaus-recipient-value{font-size:14px;font-weight:600;color:#f9fafb}
.skaus-amount-row{display:flex;gap:8px;margin-bottom:14px}
.skaus-input{flex:1;background:#1f2937;border:1px solid #374151;border-radius:8px;
padding:9px 12px;font-size:14px;color:#f9fafb;outline:none;transition:border-color .15s}
.skaus-input:focus{border-color:#2563eb}
.skaus-input::placeholder{color:#4b5563}
.skaus-token{background:#1f2937;border:1px solid #374151;border-radius:8px;
padding:9px 12px;font-size:13px;font-weight:600;color:#9ca3af;cursor:default;
white-space:nowrap}
.skaus-btn{width:100%;background:#2563eb;color:#fff;border:none;border-radius:8px;
padding:11px;font-size:14px;font-weight:600;cursor:pointer;transition:background .15s;
display:flex;align-items:center;justify-content:center;gap:8px}
.skaus-btn:hover{background:#1d4ed8}
.skaus-btn:disabled{background:#374151;color:#6b7280;cursor:not-allowed}
.skaus-status{margin-top:12px;border-radius:8px;padding:10px 12px;font-size:13px;
display:none}
.skaus-status.visible{display:block}
.skaus-status.loading{background:#1e3a5f;color:#60a5fa}
.skaus-status.success{background:#052e16;color:#4ade80}
.skaus-status.error{background:#2d0505;color:#f87171}
.skaus-link{color:#60a5fa;text-decoration:underline;word-break:break-all;font-size:12px;
display:block;margin-top:4px}
.skaus-spinner{width:14px;height:14px;border:2px solid currentColor;border-top-color:transparent;
border-radius:50%;animation:skaus-spin .6s linear infinite;flex-shrink:0}
@keyframes skaus-spin{to{transform:rotate(360deg)}}
`;

export interface WidgetConfig {
  gatewayUrl: string;
  recipient: string;
  token: string;
}

export interface WidgetHandlers {
  onPay: (amount: number) => Promise<void>;
}

export interface WidgetElements {
  root: HTMLElement;
  amountInput: HTMLInputElement;
  button: HTMLButtonElement;
  statusEl: HTMLElement;
}

function injectStyles(): void {
  if (document.getElementById('skaus-styles')) return;
  const style = document.createElement('style');
  style.id = 'skaus-styles';
  style.textContent = STYLE;
  document.head.appendChild(style);
}

function logoSvg(): string {
  return `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
<circle cx="12" cy="12" r="10"/><path d="M12 8v8M8 12h8"/>
</svg>`;
}

function phantomIcon(): string {
  // Simplified wallet icon
  return `<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
<path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 14H9V8h2v8zm4 0h-2V8h2v8z"/>
</svg>`;
}

/**
 * Build and mount the widget DOM into container.
 * Returns handles to interactive elements.
 */
export function createWidget(
  container: HTMLElement,
  config: WidgetConfig,
  handlers: WidgetHandlers,
): WidgetElements {
  injectStyles();

  const root = document.createElement('div');
  root.className = 'skaus-widget';
  root.setAttribute('role', 'main');
  root.setAttribute('aria-label', 'SKAUS Payment Widget');

  root.innerHTML = `
    <div class="skaus-header">
      <div class="skaus-logo" aria-hidden="true">${logoSvg()}</div>
      <div>
        <div class="skaus-title">Pay with SKAUS</div>
        <div class="skaus-subtitle">Private · Instant · On-chain</div>
      </div>
    </div>
    <div class="skaus-recipient">
      <div class="skaus-recipient-label">Recipient</div>
      <div class="skaus-recipient-value">@${escapeHtml(config.recipient)}</div>
    </div>
    <div class="skaus-amount-row">
      <input
        class="skaus-input"
        type="number"
        min="0.000001"
        step="any"
        placeholder="0.00"
        aria-label="Payment amount"
        autocomplete="off"
      />
      <div class="skaus-token" aria-label="Token: ${escapeHtml(config.token)}">${escapeHtml(config.token)}</div>
    </div>
    <button class="skaus-btn" type="button" aria-label="Pay with Phantom wallet">
      ${phantomIcon()}
      Pay with Phantom
    </button>
    <div class="skaus-status" role="status" aria-live="polite"></div>
  `;

  container.appendChild(root);

  const amountInput = root.querySelector<HTMLInputElement>('.skaus-input')!;
  const button = root.querySelector<HTMLButtonElement>('.skaus-btn')!;
  const statusEl = root.querySelector<HTMLElement>('.skaus-status')!;

  button.addEventListener('click', async () => {
    const rawVal = amountInput.value.trim();
    const amount = parseFloat(rawVal);
    if (!rawVal || isNaN(amount) || amount <= 0) {
      showError(statusEl, 'Please enter a valid amount.');
      return;
    }
    await handlers.onPay(amount);
  });

  return { root, amountInput, button, statusEl };
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function showLoading(statusEl: HTMLElement, message: string): void {
  statusEl.className = 'skaus-status loading visible';
  statusEl.innerHTML = `<div style="display:flex;align-items:center;gap:8px"><div class="skaus-spinner"></div><span>${escapeHtml(message)}</span></div>`;
}

export function showSuccess(statusEl: HTMLElement, message: string, txUrl?: string): void {
  statusEl.className = 'skaus-status success visible';
  statusEl.innerHTML = escapeHtml(message) + (txUrl
    ? `<a class="skaus-link" href="${escapeHtml(txUrl)}" target="_blank" rel="noopener noreferrer">View transaction</a>`
    : '');
}

export function showError(statusEl: HTMLElement, message: string): void {
  statusEl.className = 'skaus-status error visible';
  statusEl.textContent = message;
}

export function clearStatus(statusEl: HTMLElement): void {
  statusEl.className = 'skaus-status';
  statusEl.textContent = '';
}

export function setButtonDisabled(button: HTMLButtonElement, disabled: boolean): void {
  button.disabled = disabled;
}

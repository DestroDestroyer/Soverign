/**
 * Toast notification utility for Sovereign Desktop.
 * Provides a simple, stylable toast UI that auto‑dismisses.
 *
 * @param {string} message - The message to display.
 * @param {('info'|'success'|'error'|'warn')} [type='info'] - Toast type for styling.
 */
export function showToast(message, type = 'info') {
  // Ensure a container exists (single instance per page)
  let container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    document.body.appendChild(container);
  }

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  const icon = type === 'success' ? '✓' : type === 'error' ? '✗' : type === 'warn' ? '⚠' : 'ℹ';
  const iconSpan = document.createElement('span');
  iconSpan.className = 'toast-icon';
  iconSpan.textContent = icon;
  const msgSpan = document.createElement('span');
  msgSpan.className = 'toast-msg';
  msgSpan.textContent = message;
  const closeBtn = document.createElement('button');
  closeBtn.className = 'toast-close';
  closeBtn.textContent = '×';
  toast.appendChild(iconSpan);
  toast.appendChild(msgSpan);
  toast.appendChild(closeBtn);
  container.appendChild(toast);

  // Auto‑dismiss timeout (error/warn stay longer)
  const delay = type === 'error' || type === 'warn' ? 5000 : 3000;
  const timeoutId = setTimeout(() => toast.remove(), delay);

  closeBtn.addEventListener('click', () => {
    clearTimeout(timeoutId);
    toast.remove();
  });
}

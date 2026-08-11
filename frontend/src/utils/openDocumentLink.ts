/**
 * Open a short-lived document URL in a new tab when possible.
 * Mobile Safari / Zalo WebView often block window.open after await —
 * we open about:blank synchronously, then navigate; if blocked, show
 * a manual open sheet (new tap = fresh user gesture) + same-tab option.
 */

const FALLBACK_ROOT_ID = 'vasbot-doc-link-fallback';

function removeFallback() {
  document.getElementById(FALLBACK_ROOT_ID)?.remove();
}

function showManualOpenFallback(url: string, kind: 'preview' | 'download') {
  removeFallback();

  const root = document.createElement('div');
  root.id = FALLBACK_ROOT_ID;
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-modal', 'true');
  root.className = 'fixed inset-0 z-[200] flex items-end sm:items-center justify-center p-4 bg-black/40';

  const panel = document.createElement('div');
  panel.className =
    'bg-white rounded-2xl shadow-xl w-full max-w-sm overflow-hidden border border-gray-100';

  const header = document.createElement('div');
  header.className = 'px-5 py-4 border-b border-gray-100';
  const h2 = document.createElement('h2');
  h2.className = 'text-base font-semibold text-gray-900';
  h2.textContent = kind === 'download' ? 'Mở file tải xuống' : 'Mở tài liệu';
  const hint = document.createElement('p');
  hint.className = 'text-sm text-gray-500 mt-1';
  hint.textContent =
    'Trình duyệt đã chặn mở tab mới (Safari / Zalo). Hãy bấm nút bên dưới để mở.';
  header.append(h2, hint);

  const actions = document.createElement('div');
  actions.className = 'px-5 py-4 flex flex-col gap-2';

  const openBlank = document.createElement('a');
  openBlank.href = url;
  openBlank.target = '_blank';
  openBlank.rel = 'noopener noreferrer';
  openBlank.className =
    'w-full text-center px-4 py-3 rounded-xl bg-primary-600 text-white text-sm font-medium hover:bg-primary-700';
  openBlank.textContent = 'Mở tài liệu';

  const openSame = document.createElement('button');
  openSame.type = 'button';
  openSame.className =
    'w-full px-4 py-3 rounded-xl border border-gray-200 text-sm font-medium text-gray-800 hover:bg-gray-50';
  openSame.textContent = 'Mở tại trang này';

  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.className = 'w-full px-4 py-2.5 rounded-xl text-sm text-gray-500 hover:bg-gray-50';
  closeBtn.textContent = 'Đóng';

  actions.append(openBlank, openSame, closeBtn);
  panel.append(header, actions);

  const close = () => {
    document.removeEventListener('keydown', onKey);
    removeFallback();
  };

  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') close();
  };

  openBlank.addEventListener('click', () => {
    window.setTimeout(close, 300);
  });
  openSame.addEventListener('click', () => {
    close();
    window.location.assign(url);
  });
  closeBtn.addEventListener('click', close);
  root.addEventListener('click', (e) => {
    if (e.target === root) close();
  });

  root.appendChild(panel);
  document.body.appendChild(root);
  document.addEventListener('keydown', onKey);
}

/**
 * Call this synchronously at the start of the click handler (before await),
 * then pass the handle into {@link navigateOpenedDocumentWindow}.
 */
export function openDocumentWindowPlaceholder(): Window | null {
  try {
    return window.open('about:blank', '_blank');
  } catch {
    return null;
  }
}

export function navigateOpenedDocumentWindow(
  win: Window | null,
  url: string,
  kind: 'preview' | 'download' = 'preview',
): void {
  if (win && !win.closed) {
    try {
      win.location.href = url;
      return;
    } catch {
      try {
        win.close();
      } catch {
        /* ignore */
      }
    }
  }
  showManualOpenFallback(url, kind);
}

export function closeDocumentWindowPlaceholder(win: Window | null): void {
  if (!win || win.closed) return;
  try {
    win.close();
  } catch {
    /* ignore */
  }
}

/* LingKuma Zotero: narrow theme synchronization bridge.
 *
 * Upstream remains byte-for-byte unchanged. Zotero only needs a small bridge
 * because a2 updates the page/highlight theme asynchronously while a4/a7 keep
 * their tooltip surfaces inside CLOSED ShadowRoots.
 *
 * Safety rule: no MutationObserver and no permanent polling. The previous
 * 0.5.3 observer could observe a child mutation caused by updating the theme
 * icon, then update the icon again, creating a self-sustaining main-thread loop.
 */
(() => {
  'use strict';
  if (!globalThis.__LINGKUMA_ZOTERO_READER__) return;
  if (globalThis.__LINGKUMA_ZOTERO_THEME_EVENT_BRIDGE__?.installed) return;

  let pageDark = null;
  let tooltipMode = 'auto';
  let disposed = false;
  let unsubscribeCapture = null;


  const managerTheme = () => {
    try {
      if (typeof highlightManager !== 'undefined' && highlightManager &&
          typeof highlightManager.isDarkMode === 'boolean') {
        return highlightManager.isDarkMode;
      }
    } catch (_) {}
    return null;
  };

  const capturedRoot = hostId => {
    try { return globalThis.__LINGKUMA_ZOTERO_SHADOW_CAPTURE__?.get?.(hostId) || null; }
    catch (_) { return null; }
  };

  const tooltipRoot = () => capturedRoot('lingkuma-tooltip-host');

  const setDarkClass = (node, dark) => {
    if (!node?.classList) return;
    try { node.classList.toggle('dark-mode', dark === true); } catch (_) {}
  };

  const resolvedSurfaceDark = () => {
    if (tooltipMode === 'dark') return true;
    if (tooltipMode === 'light') return false;
    if (typeof pageDark === 'boolean') return pageDark;
    const current = managerTheme();
    return typeof current === 'boolean' ? current : false;
  };

  const syncCapturedCapsule = () => {
    const dark = resolvedSurfaceDark();
    const root = tooltipRoot();
    try {
      root?.querySelectorAll?.('.header-buttons-capsule')?.forEach?.(node => setDarkClass(node, dark));
      root?.querySelectorAll?.('.capsule-highlight-theme-btn')?.forEach?.(button => {
        try {
          if (typeof updateHighlightThemeButtonIcon === 'function') {
            updateHighlightThemeButtonIcon(button, pageDark === true);
          }
        } catch (_) {}
      });
    } catch (_) {}
  };

  const syncAll = () => {
    if (disposed) return;
    const current = managerTheme();
    if (typeof current === 'boolean') pageDark = current;
    if (typeof pageDark !== 'boolean') pageDark = false;
    syncCapturedCapsule();
  };

  const applyPageTheme = dark => {
    if (typeof dark !== 'boolean' || disposed) return;
    pageDark = dark;
    syncCapturedCapsule();
  };


  const onStorageChanged = (changes, areaName) => {
    if (areaName !== 'local' || disposed) return;

    if (changes.tooltipThemeMode) {
      const mode = String(changes.tooltipThemeMode.newValue || 'auto');
      tooltipMode = mode === 'dark' || mode === 'light' ? mode : 'auto';
      queueMicrotask(syncAll);
    }

  };

  const onRuntimeMessage = (message, _sender, sendResponse) => {
    if (!message || typeof message !== 'object' || disposed) return;

    if (message.action === 'updateHighlightTheme' && typeof message.isDark === 'boolean') {
      applyPageTheme(message.isDark);
      try { sendResponse?.({ success: true }); } catch (_) {}
      return;
    }

    if (message.action === 'updateTooltipThemeMode') {
      const requested = String(message.mode || 'auto');
      if (requested === 'auto') {
        chrome.storage.local.get({ tooltipThemeMode: 'auto' }, result => {
          const stored = String(result?.tooltipThemeMode || 'auto');
          tooltipMode = stored === 'dark' || stored === 'light' ? stored : 'auto';
          syncAll();
        });
      } else {
        tooltipMode = requested === 'dark' ? 'dark' : requested === 'light' ? 'light' : 'auto';
        syncAll();
      }
      try { sendResponse?.({ success: true }); } catch (_) {}
    }
  };

  try { chrome.storage.onChanged.addListener(onStorageChanged); } catch (_) {}
  try { chrome.runtime.onMessage.addListener(onRuntimeMessage); } catch (_) {}
  try {
    const capture = globalThis.__LINGKUMA_ZOTERO_SHADOW_CAPTURE__;
    if (typeof capture?.onCapture === 'function') {
      unsubscribeCapture = capture.onCapture((host) => {
        if (!disposed && host?.id === 'lingkuma-tooltip-host') syncCapturedCapsule();
      });
    }
  } catch (_) {}

  chrome.storage.local.get({ tooltipThemeMode: 'auto' }, result => {
    const mode = String(result?.tooltipThemeMode || 'auto');
    tooltipMode = mode === 'dark' || mode === 'light' ? mode : 'auto';
    const current = managerTheme();
    if (typeof current === 'boolean') pageDark = current;
    syncAll();
  });

  globalThis.__LINGKUMA_ZOTERO_THEME_EVENT_BRIDGE__ = {
    installed: true,
    sync: syncAll,
    cleanup() {
      if (disposed) return;
      disposed = true;
      try { chrome.storage.onChanged.removeListener(onStorageChanged); } catch (_) {}
      try { chrome.runtime.onMessage.removeListener(onRuntimeMessage); } catch (_) {}
      const unsubscribe = unsubscribeCapture;
      unsubscribeCapture = null;
      try { unsubscribe?.(); } catch (_) {}
    }
  };
})();

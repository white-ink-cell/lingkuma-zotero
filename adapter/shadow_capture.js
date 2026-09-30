/* LingKuma Zotero: capture only LingKuma's closed ShadowRoots.
 * This keeps vendored upstream untouched while allowing narrowly scoped
 * Gecko/PDF compatibility modules to observe their own LingKuma surfaces. */
(() => {
  'use strict';
  if (!globalThis.__LINGKUMA_ZOTERO_READER__) return;
  if (globalThis.__LINGKUMA_ZOTERO_SHADOW_CAPTURE__) return;

  const rootsByHost = new WeakMap();
  const rootsById = new Map();
  const listeners = new Set();
  const originalAttachShadow = Element.prototype.attachShadow;
  const allowedTags = new Set(['lingkuma-tooltip-root', 'lingkuma-explosion-root']);

  const remember = (host, root) => {
    rootsByHost.set(host, root);
    if (host.id) rootsById.set(host.id, root);
    queueMicrotask(() => {
      if (host.id) rootsById.set(host.id, root);
      for (const listener of Array.from(listeners)) {
        try { listener(host, root); } catch (_) {}
      }
    });
  };

  Element.prototype.attachShadow = function(init) {
    const root = originalAttachShadow.call(this, init);
    const tag = String(this.localName || '').toLowerCase();
    if (allowedTags.has(tag)) remember(this, root);
    return root;
  };

  globalThis.__LINGKUMA_ZOTERO_SHADOW_CAPTURE__ = {
    get(hostOrId) {
      if (typeof hostOrId === 'string') {
        const host = document.getElementById(hostOrId);
        return (host && rootsByHost.get(host)) || rootsById.get(hostOrId) || null;
      }
      return hostOrId ? rootsByHost.get(hostOrId) || null : null;
    },
    onCapture(listener) {
      if (typeof listener !== 'function') return () => {};
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    cleanup() {
      listeners.clear();
      try { Element.prototype.attachShadow = originalAttachShadow; } catch (_) {}
    }
  };
})();

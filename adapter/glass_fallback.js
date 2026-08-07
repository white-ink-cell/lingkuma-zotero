/* LingKuma Zotero: Gecko glass fallback.
 * Upstream continues to own glass enable/disable, DOM structure and theme
 * classes. This module only supplies a readable frosted surface in Zotero's
 * Gecko reader when Chromium's SVG liquid backdrop is unavailable. */
(() => {
  'use strict';
  if (!globalThis.__LINGKUMA_ZOTERO_READER__) return;
  if (globalThis.__LINGKUMA_ZOTERO_GLASS_FALLBACK__?.installed) return;

  const registry = globalThis.__LINGKUMA_ZOTERO_SHADOW_CAPTURE__;
  if (!registry) return;
  const STYLE_ID = 'lingkuma-zotero-gecko-glass-fallback-style';
  const CSS = `
.vocab-tooltip.liquid-glass-active,
.vocab-tooltip.firefox-glass-effect,
.vocab-tooltip.firefox-glass-effect.zotero-glass-effect {
    isolation: isolate !important;
    overflow: hidden !important;
    background: linear-gradient(145deg,
        rgba(255, 255, 255, 0.965) 0%,
        rgba(249, 247, 240, 0.935) 54%,
        rgba(255, 255, 255, 0.905) 100%) !important;
    backdrop-filter: blur(22px) saturate(145%) contrast(102%) !important;
    -webkit-backdrop-filter: blur(22px) saturate(145%) contrast(102%) !important;
    border: 1px solid rgba(255, 255, 255, 0.92) !important;
    box-shadow:
        0 18px 48px rgba(55, 44, 30, 0.24),
        0 2px 8px rgba(55, 44, 30, 0.10),
        inset 0 1px 0 rgba(255, 255, 255, 0.98),
        inset 0 -1px 0 rgba(89, 72, 52, 0.10) !important;
    color: #171512 !important;
}
.vocab-tooltip.liquid-glass-active.dark-mode,
.vocab-tooltip.firefox-glass-effect.dark-mode,
.vocab-tooltip.firefox-glass-effect.zotero-glass-effect.dark-mode {
    background: linear-gradient(145deg,
        rgba(36, 36, 40, 0.965) 0%,
        rgba(25, 25, 29, 0.945) 56%,
        rgba(43, 43, 48, 0.92) 100%) !important;
    border-color: rgba(255, 255, 255, 0.20) !important;
    box-shadow:
        0 18px 48px rgba(0, 0, 0, 0.55),
        0 2px 10px rgba(0, 0, 0, 0.32),
        inset 0 1px 0 rgba(255, 255, 255, 0.18),
        inset 0 -1px 0 rgba(0, 0, 0, 0.42) !important;
    color: #f4f1ea !important;
}
.vocab-tooltip.liquid-glass-active::before,
.vocab-tooltip.firefox-glass-effect::before,
.vocab-tooltip.liquid-glass-active .tooltip-video-background,
.vocab-tooltip.firefox-glass-effect .tooltip-video-background {
    display: none !important;
}
.vocab-tooltip.liquid-glass-active .scrollable-content,
.vocab-tooltip.firefox-glass-effect .scrollable-content {
    background: rgba(255, 255, 255, 0.24) !important;
    backdrop-filter: none !important;
    -webkit-backdrop-filter: none !important;
}
.vocab-tooltip.liquid-glass-active.dark-mode .scrollable-content,
.vocab-tooltip.firefox-glass-effect.dark-mode .scrollable-content {
    background: rgba(0, 0, 0, 0.14) !important;
}
.vocab-tooltip.liquid-glass-active .translation-item,
.vocab-tooltip.firefox-glass-effect .translation-item {
    background: rgba(229, 226, 216, 0.78) !important;
    border: 1px solid rgba(255, 255, 255, 0.72) !important;
    backdrop-filter: none !important;
    -webkit-backdrop-filter: none !important;
}
.vocab-tooltip.liquid-glass-active .ai-recommendation,
.vocab-tooltip.firefox-glass-effect .ai-recommendation,
.vocab-tooltip.liquid-glass-active .translation-item.ai-recommendation,
.vocab-tooltip.firefox-glass-effect .translation-item.ai-recommendation {
    background: rgba(165, 199, 221, 0.88) !important;
    border-color: rgba(255, 255, 255, 0.62) !important;
    border-left: 3px solid #007bff !important;
    backdrop-filter: none !important;
    -webkit-backdrop-filter: none !important;
}
.vocab-tooltip.liquid-glass-active .ai-recommendation-2,
.vocab-tooltip.firefox-glass-effect .ai-recommendation-2,
.vocab-tooltip.liquid-glass-active .translation-item.ai-recommendation-2,
.vocab-tooltip.firefox-glass-effect .translation-item.ai-recommendation-2 {
    background: rgba(225, 190, 146, 0.90) !important;
    border-color: rgba(255, 255, 255, 0.62) !important;
    border-left: 3px solid #ff7b00 !important;
    backdrop-filter: none !important;
    -webkit-backdrop-filter: none !important;
}
.vocab-tooltip.liquid-glass-active.dark-mode .translation-item,
.vocab-tooltip.firefox-glass-effect.dark-mode .translation-item {
    background: rgba(55, 55, 60, 0.82) !important;
    border-color: rgba(255, 255, 255, 0.14) !important;
}
.vocab-tooltip.liquid-glass-active.dark-mode .ai-recommendation,
.vocab-tooltip.firefox-glass-effect.dark-mode .ai-recommendation,
.vocab-tooltip.liquid-glass-active.dark-mode .translation-item.ai-recommendation,
.vocab-tooltip.firefox-glass-effect.dark-mode .translation-item.ai-recommendation {
    background: rgba(25, 101, 150, 0.72) !important;
}
.vocab-tooltip.liquid-glass-active.dark-mode .ai-recommendation-2,
.vocab-tooltip.firefox-glass-effect.dark-mode .ai-recommendation-2,
.vocab-tooltip.liquid-glass-active.dark-mode .translation-item.ai-recommendation-2,
.vocab-tooltip.firefox-glass-effect.dark-mode .translation-item.ai-recommendation-2 {
    background: rgba(142, 79, 25, 0.76) !important;
}
.header-buttons-capsule.liquid-glass-active,
.header-buttons-capsule.firefox-glass-effect {
    background: rgba(250, 248, 242, 0.94) !important;
    backdrop-filter: blur(18px) saturate(140%) !important;
    -webkit-backdrop-filter: blur(18px) saturate(140%) !important;
    border: 1px solid rgba(255, 255, 255, 0.90) !important;
    box-shadow: 0 12px 32px rgba(55, 44, 30, 0.22), inset 0 1px 0 rgba(255,255,255,.98) !important;
}
.header-buttons-capsule.liquid-glass-active.dark-mode,
.header-buttons-capsule.firefox-glass-effect.dark-mode {
    background: rgba(31, 31, 35, 0.94) !important;
    border-color: rgba(255,255,255,.18) !important;
}`;

  const install = (host, root) => {
    if (!root || root.getElementById?.(STYLE_ID)) return;
    const tag = String(host?.localName || '').toLowerCase();
    if (tag !== 'lingkuma-tooltip-root') return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = CSS;
    root.appendChild(style);
  };

  const off = registry.onCapture(install);
  const existingHost = document.getElementById('lingkuma-tooltip-host');
  install(existingHost, registry.get('lingkuma-tooltip-host'));

  globalThis.__LINGKUMA_ZOTERO_GLASS_FALLBACK__ = {
    installed: true,
    cleanup() { try { off?.(); } catch (_) {} }
  };
})();

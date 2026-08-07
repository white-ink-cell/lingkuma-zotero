/*
 * LingKuma for Zotero — Zotero lifecycle, reader injection and desktop UI.
 *
 * The actual language-learning/highlighting/tooltip implementation is loaded
 * from upstream/ in its original order. This adapter only supplies the host
 * APIs that a Chrome extension normally receives from the browser.
 */

const LK_INITIAL_CONTENT_SCRIPTS = Object.freeze([
  // Keep the exact order from LingKuma's browser manifest.
  "src/utils/highlight_floating_button.js",
  "src/service/a1_loadKnowWords.js",
  "src/service/a2_hightlight.js"
]);

const LK_RUNTIME_SCRIPTS = Object.freeze([
  // Zotero reader adaptation: keep LingKuma's original PDF/EPUB learning UI
  // and language-learning logic, but do not load browser account/subscription,
  // YouTube, mascot, ruler or other normal-web-page-only modules.
  "src/utils/lingqBlocker.js",
  "src/utils/cloudAPI.js",
  "src/utils/dataAccessLayer.js",
  "src/utils/evaluateExpression.js",
  "src/utils/pdfDetection.js",
  "src/utils/sentenseOoOo.js",
  "src/utils/liquid-glass.js",
  "src/plugin/min/compromise.js",
  "src/plugin/min/de-compromise.min.js",
  "src/utils/language-detector/eld.extrasmall.global.js",
  "src/service/a3_aiFragen.js",
  "src/service/a4_tooltip_new.js",
  "src/service/a5_custom_word_selection.js",
  "src/service/a6_custom_highlight.js",
  "src/service/a7_words_boom.js",
  "src/service/a7.1_sentence_navigator.js",
  "src/plugin/tts.js",
  "src/plugin/edge_tts.js",
  "src/plugin/orion_tts.js",
  "src/content.js"
]);

const LK_CRITICAL_SCRIPTS = new Set([
  ...LK_INITIAL_CONTENT_SCRIPTS,
  "src/service/a4_tooltip_new.js",
  "src/content.js"
]);

class LingKumaZoteroPlugin {
  constructor({ id, version, rootURI }) {
    this.id = id;
    this.version = version;
    this.rootURI = rootURI;
    this.contentCSS = typeof LK_CONTENT_CSS_TEXT === "string" ? LK_CONTENT_CSS_TEXT : "";
    this.resourceData = (typeof LK_RESOURCE_DATA === "object" && LK_RESOURCE_DATA) ? LK_RESOURCE_DATA : {};
    this.state = new LingKumaStateAdapter({ pluginID: id, version });
    this.host = new LingKumaMessageHost({ state: this.state, plugin: this, rootURI, pluginID: id });
    this.readerHandlers = [];
    this.windowMenus = new Map();
    this.contextsByWindow = new Map();
    this.readerTabIDs = new WeakMap();
    this.nextReaderTabID = 1000;
    this.scanTimers = new Map();
    this.started = false;
    this.audioElement = null;
    this.speechUtterance = null;
    this.lastDiagnostic = "尚未扫描阅读器";
  }

  debug(message) {
    try { Zotero.debug(`[LingKuma Zotero ${this.version}] ${message}`); } catch (_) {}
  }

  reportError(error, prefix = "") {
    const name = error && typeof error === "object" && error.name ? String(error.name) : "Error";
    const detail = error && typeof error === "object" && error.message ? String(error.message) : String(error);
    const stack = error && typeof error === "object" && error.stack ? String(error.stack) : "";
    const message = `${prefix}${name}: ${detail}${stack ? `\n${stack}` : ""}`;
    this.debug(message);
    try { Zotero.logError(error instanceof Error ? error : new Error(message)); } catch (_) {}
  }

  async start() {
    await this.state.load();
    this.registerReaderEvents();
    for (const win of Zotero.getMainWindows?.() || []) this.attachMainWindow(win);
    this.started = true;
    this.debug(`started; build=bridge17-thin-adapter-20260808; upstream LingKuma 1.1.0; words=${Object.keys(this.state.words).length}; resources=${Object.keys(this.resourceData).length}`);
    this.scanAllReaders("startup");
  }

  async stop() {
    this.started = false;
    for (const [type, handler] of this.readerHandlers) {
      try { Zotero.Reader.unregisterEventListener(type, handler); } catch (_) {}
    }
    this.readerHandlers = [];
    for (const win of Array.from(this.windowMenus.keys())) this.detachMainWindow(win);
    for (const timer of this.scanTimers.values()) {
      try { clearTimeout(timer); } catch (_) {}
    }
    this.scanTimers.clear();
    for (const context of Array.from(this.contextsByWindow.values())) {
      try { context.destroy(); } catch (_) {}
    }
    this.contextsByWindow.clear();
    this.stopAudio();
    await this.state.save();
    this.debug("stopped");
  }

  onMainWindowLoad(win) {
    this.attachMainWindow(win);
    win.LingKumaZoteroPlugin = this;
    this.scanAllReaders("main-window-load");
  }

  onMainWindowUnload(win) {
    try { delete win.LingKumaZoteroPlugin; } catch (_) {}
    this.detachMainWindow(win);
  }

  attachMainWindow(win) {
    if (!win || this.windowMenus.has(win)) return;
    const doc = win.document;
    const popup = doc.getElementById("menu_ToolsPopup") || doc.getElementById("menu_toolsPopup");
    if (!popup) {
      this.debug("Tools menu popup not found; toolbar integration remains available");
      this.windowMenus.set(win, []);
      return;
    }

    const nodes = [];
    const separator = doc.createXULElement ? doc.createXULElement("menuseparator") : doc.createElement("menuseparator");
    separator.id = "lingkuma-zotero-tools-separator";
    popup.appendChild(separator);
    nodes.push(separator);

    const addItem = (id, label, command) => {
      const item = doc.createXULElement ? doc.createXULElement("menuitem") : doc.createElement("menuitem");
      item.id = id;
      item.setAttribute("label", label);
      item.addEventListener("command", command);
      popup.appendChild(item);
      nodes.push(item);
      return item;
    };

    addItem("lingkuma-zotero-vocabulary", "LingKuma：词库与导入导出", () => this.openVocabularyManager(win));
    addItem("lingkuma-zotero-reinject", "LingKuma：重新载入当前阅读器", () => this.scanAllReaders("manual-menu", true));
    addItem("lingkuma-zotero-diagnostic", "LingKuma：运行诊断", () => this.showDiagnostics(win));
    this.windowMenus.set(win, nodes);
    win.LingKumaZoteroPlugin = this;
  }

  detachMainWindow(win) {
    const nodes = this.windowMenus.get(win) || [];
    for (const node of nodes) {
      try { node.remove(); } catch (_) {}
    }
    this.windowMenus.delete(win);
    try { delete win.LingKumaZoteroPlugin; } catch (_) {}
  }

  registerReaderEvents() {
    const register = (type, handler) => {
      Zotero.Reader.registerEventListener(type, handler, this.id);
      this.readerHandlers.push([type, handler]);
    };

    // Zotero events are used only as lifecycle hooks. The visible controls and
    // learning tooltip come from LingKuma's original browser scripts, so the
    // reader no longer gets a second Zotero-specific bear button or menu row.
    register("renderToolbar", event => {
      try { this.scheduleReaderScan(event.reader, "render-toolbar"); }
      catch (error) { this.reportError(error, "renderToolbar: "); }
    });

    register("renderTextSelectionPopup", event => {
      try { this.scheduleReaderScan(event.reader, "selection-popup"); }
      catch (error) { this.reportError(error, "renderTextSelectionPopup: "); }
    });
  }

  getReaderTabID(reader) {
    if (reader?.tabID) {
      const numeric = Number(String(reader.tabID).replace(/\D/g, ""));
      if (Number.isFinite(numeric) && numeric > 0) return numeric;
    }
    if (!this.readerTabIDs.has(reader)) this.readerTabIDs.set(reader, this.nextReaderTabID++);
    return this.readerTabIDs.get(reader);
  }

  getReaderSelectedText(reader) {
    try {
      const view = reader?._internalReader?._primaryView;
      const win = view?._iframeWindow?.wrappedJSObject || view?._iframeWindow;
      const text = win?.getSelection?.()?.toString?.();
      if (text) return text;
    } catch (_) {}
    try {
      const ranges = reader?._iframeWindow?.wrappedJSObject?._reader?._primaryView?._selectionRanges;
      if (Array.isArray(ranges) && ranges.length) {
        return ranges.map(range => range?.toString?.() || "").join(" ").trim();
      }
    } catch (_) {}
    return "";
  }

  collectReaderWindows(reader) {
    const found = [];
    const seen = new Set();
    const add = win => {
      if (!win) return;
      try { win = win.wrappedJSObject || win; } catch (_) {}
      if (!win || seen.has(win)) return;
      seen.add(win);
      found.push(win);
      try {
        for (let i = 0; i < win.frames.length; i++) add(win.frames[i]);
      } catch (_) {}
    };

    try { add(reader?._iframeWindow); } catch (_) {}
    try { add(reader?._internalReader?._primaryView?._iframeWindow); } catch (_) {}
    try { add(reader?._internalReader?._secondaryView?._iframeWindow); } catch (_) {}
    return found;
  }

  isInjectableReaderWindow(win, reader) {
    try {
      const doc = win.document;
      if (!doc?.documentElement || !doc.body) return false;
      const href = String(win.location?.href || "");
      const hasPDFSurface = !!doc.querySelector(".textLayer, .pdfViewer, #viewerContainer, #viewer");
      const isPDFURL = /\/pdf\/|viewer\.html|pdfjs/i.test(href);
      const readerType = String(reader?.type || reader?._type || "").toLowerCase();
      const textLength = String(doc.body.innerText || doc.body.textContent || "").trim().length;
      const looksLikeReaderShell = /\/reader\/reader\.html/i.test(href) && !hasPDFSurface;
      if (looksLikeReaderShell) return false;
      if (readerType === "pdf") return hasPDFSurface || isPDFURL;
      if (readerType === "epub" || readerType === "snapshot") {
        return textLength >= 40 && !doc.querySelector("#toolbarContainer, .toolbar");
      }
      return hasPDFSurface || textLength >= 80;
    } catch (_) {
      return false;
    }
  }

  pruneDeadContexts() {
    for (const [win, context] of Array.from(this.contextsByWindow.entries())) {
      let alive = false;
      try { alive = !context.destroyed && !!win?.document?.documentElement && !win.closed; } catch (_) {}
      if (!alive) {
        try { context.destroy(); } catch (_) {}
        this.contextsByWindow.delete(win);
      }
    }
  }

  onContentContextPageHide(context) {
    if (!context) return;
    for (const [win, candidate] of Array.from(this.contextsByWindow.entries())) {
      if (candidate !== context) continue;
      try { candidate.destroy(); } catch (_) {}
      this.contextsByWindow.delete(win);
      break;
    }
  }

  scheduleReaderScan(reader, reason = "scheduled", force = false) {
    if (!reader || !this.started) return;
    const key = reader;
    const previous = this.scanTimers.get(key);
    if (previous) clearTimeout(previous);
    const timer = setTimeout(() => {
      this.scanTimers.delete(key);
      this.injectReader(reader, { reason, force }).catch(error => this.reportError(error, "reader scan: "));
    }, force ? 50 : 350);
    this.scanTimers.set(key, timer);
  }

  scanAllReaders(reason = "manual", force = false) {
    const readers = Array.from(Zotero.Reader?._readers || []);
    this.debug(`scanAllReaders(${reason}): ${readers.length} reader(s)`);
    for (const reader of readers) this.scheduleReaderScan(reader, reason, force);
  }

  ensureStylesheet(win) {
    const doc = win.document;
    // Zotero PDF readers are not on LingKuma upstream's small URL whitelist.
    // Mark the actual PDF.js text surface so the original PDF highlight styles apply.
    try {
      if (doc.querySelector(".textLayer, .pdfViewer, #viewerContainer, #viewer")) {
        doc.documentElement.classList.add("pdf-viewer");
      }
    } catch (_) {}
    const existing = doc.getElementById("lingkuma-zotero-upstream-style");
    if (existing && existing.tagName?.toLowerCase() === "style" && existing.dataset?.build === "bridge17") return;
    try { existing?.remove(); } catch (_) {}

    // Zotero's resource:// PDF viewer rejects jar:file:// stylesheets from an
    // XPI. Inject LingKuma's original content.css as text instead.
    const style = doc.createElement("style");
    style.id = "lingkuma-zotero-upstream-style";
    style.dataset.build = "bridge17";
    style.textContent = this.contentCSS || "";
    (doc.head || doc.documentElement).appendChild(style);

    let patch = doc.getElementById("lingkuma-zotero-style-patch");
    if (!patch) {
      patch = doc.createElement("style");
      patch.id = "lingkuma-zotero-style-patch";
      (doc.head || doc.documentElement).appendChild(patch);
    }
    patch.textContent = `
      /* Zotero host compatibility and readable PDF highlight contrast. */
      #lingkuma-tooltip-host { z-index: 2147483647 !important; }
      lingkuma-tooltip-root { position: relative; z-index: 2147483647 !important; }
      :root.pdf-viewer ::highlight(default) { background-color: rgba(177, 211, 255, .72) !important; mix-blend-mode: normal !important; }
      :root.pdf-viewer ::highlight(state1) { background-color: rgba(255, 218, 87, .76) !important; mix-blend-mode: normal !important; }
      :root.pdf-viewer ::highlight(state2) { background-color: rgba(255, 232, 143, .70) !important; mix-blend-mode: normal !important; }
      :root.pdf-viewer ::highlight(state3) { background-color: rgba(255, 244, 193, .66) !important; mix-blend-mode: normal !important; }
      :root.pdf-viewer ::highlight(state4) { background-color: rgba(231, 235, 228, .62) !important; mix-blend-mode: normal !important; }
      :root.pdf-viewer ::highlight(dark-default) { background-color: rgba(80, 145, 225, .68) !important; mix-blend-mode: normal !important; }
      :root.pdf-viewer ::highlight(dark-state1) { background-color: rgba(183, 143, 63, .70) !important; mix-blend-mode: normal !important; }
      :root.pdf-viewer ::highlight(dark-state2) { background-color: rgba(132, 112, 70, .66) !important; mix-blend-mode: normal !important; }
      :root.pdf-viewer ::highlight(dark-state3) { background-color: rgba(92, 99, 105, .65) !important; mix-blend-mode: normal !important; }
      :root.pdf-viewer ::highlight(dark-state4) { background-color: rgba(92, 99, 105, .55) !important; mix-blend-mode: normal !important; }
    `;
  }

  cleanupStylesheet(win) {
    try {
      win?.document?.getElementById("lingkuma-zotero-upstream-style")?.remove();
      win?.document?.getElementById("lingkuma-zotero-style-patch")?.remove();
      win?.document?.getElementById("lingkuma-tooltip-host")?.remove();
      win?.document?.querySelector("lingkuma-tooltip-root")?.remove?.();
      win?.document?.getElementById("lingkuma-word-highlight-floating-root")?.remove?.();
      win?.document?.getElementById("lingkuma-explosion-host")?.remove?.();
    } catch (_) {}
  }

  getResourceURL(path) {
    const key = String(path || "").replace(/^\/+/, "");
    const mapped = this.resourceData && this.resourceData[key];
    if (typeof mapped === "string" && mapped) return mapped;
    // Any random SVG path should resolve to a valid upstream pattern even if a
    // future LingKuma release requests a number outside the embedded set.
    if (/^src\/service\/image\/tg\/pattern-\d+\.svg$/i.test(key)) {
      return this.resourceData["src/service/image/tg/pattern-1.svg"] || "";
    }
    return this.rootURI + "upstream/" + key;
  }

  loadUpstreamScript(context, relativePath) {
    const uri = this.rootURI + "upstream/" + relativePath;
    try {
      const sandbox = context.createSandbox();
      Services.scriptloader.loadSubScript(uri, sandbox, "UTF-8");
      context.loadedScripts ||= [];
      context.loadedScripts.push(relativePath);
      return true;
    } catch (error) {
      const detail = error && typeof error === "object" && error.message ? String(error.message) : String(error);
      context.scriptErrors ||= [];
      context.scriptErrors.push({ file: relativePath, error: detail });
      this.reportError(error, `upstream ${relativePath}: `);
      return false;
    }
  }

  loadTrustedReaderTopLevelScript(context, relativePath) {
    // LingKuma intentionally skips ordinary iframes. Zotero's actual reader
    // document is a trusted iframe, so expose only this sandbox as top-level
    // while loading the original floating-control script. The vendored source
    // remains byte-for-byte unchanged and normal iframe semantics are restored
    // immediately afterwards.
    try {
      context.createSandbox();
      context._eval(`(() => {
        const previous = Object.getOwnPropertyDescriptor(globalThis, 'top') || null;
        Object.defineProperty(globalThis, '__LINGKUMA_ZOTERO_PREVIOUS_TOP__', { value: previous, configurable: true });
        Object.defineProperty(globalThis, 'top', { value: globalThis, configurable: true });
      })()`);
      return this.loadUpstreamScript(context, relativePath);
    } finally {
      try {
        context._eval(`(() => {
          const previous = globalThis.__LINGKUMA_ZOTERO_PREVIOUS_TOP__;
          try { delete globalThis.top; } catch (_) {}
          if (previous) {
            try { Object.defineProperty(globalThis, 'top', previous); } catch (_) {}
          }
          try { delete globalThis.__LINGKUMA_ZOTERO_PREVIOUS_TOP__; } catch (_) {}
        })()`);
      } catch (_) {}
    }
  }

  loadAdapterScript(context, relativePath) {
    const uri = this.rootURI + "adapter/" + relativePath;
    try {
      const sandbox = context.createSandbox();
      Services.scriptloader.loadSubScript(uri, sandbox, "UTF-8");
      context.loadedScripts ||= [];
      context.loadedScripts.push("adapter/" + relativePath);
      return true;
    } catch (error) {
      const detail = error && typeof error === "object" && error.message ? String(error.message) : String(error);
      context.scriptErrors ||= [];
      context.scriptErrors.push({ file: "adapter/" + relativePath, error: detail });
      this.reportError(error, `adapter ${relativePath}: `);
      return false;
    }
  }

  async injectReader(reader, { reason = "unknown", force = false } = {}) {
    if (!this.started) return;
    this.pruneDeadContexts();
    const windows = this.collectReaderWindows(reader);
    const candidates = windows.filter(win => this.isInjectableReaderWindow(win, reader));
    let injected = 0;
    for (const win of candidates) {
      if (force) this.destroyContextForWindow(win);
      if (this.contextsByWindow.has(win)) continue;
      let context = null;
      try {
        this.ensureStylesheet(win);
        context = new LingKumaContentContext({
          host: this.host,
          win,
          reader,
          tabId: this.getReaderTabID(reader),
          rootURI: this.rootURI,
          pluginID: this.id
        });
        context.readerType = reader?.type || reader?._type || "unknown";
        context.injectedAt = new Date().toISOString();
        context.reason = reason;

        for (const file of LK_INITIAL_CONTENT_SCRIPTS) {
          const loaded = file === "src/utils/highlight_floating_button.js"
            ? this.loadTrustedReaderTopLevelScript(context, file)
            : this.loadUpstreamScript(context, file);
          if (!loaded) throw new Error(`Critical LingKuma script failed: ${file}`);
        }

        // Capture only LingKuma's closed tooltip/explosion ShadowRoots before
        // a4/a7 create them. This is infrastructure for explicit Zotero-only
        // compatibility modules; it does not change upstream DOM behavior.
        if (!this.loadAdapterScript(context, "shadow_capture.js")) {
          throw new Error("Critical Zotero ShadowRoot compatibility adapter failed: shadow_capture.js");
        }

        for (const file of LK_RUNTIME_SCRIPTS) {
          const loaded = this.loadUpstreamScript(context, file);
          if (!loaded && LK_CRITICAL_SCRIPTS.has(file)) throw new Error(`Critical LingKuma script failed: ${file}`);
        }
        if (!this.loadAdapterScript(context, "sentence_patch.js")) {
          throw new Error("Critical Zotero PDF sentence adapter failed: sentence_patch.js");
        }
        if (!this.loadAdapterScript(context, "sentence_panel_patch.js")) {
          throw new Error("Critical Zotero sentence-panel adapter failed: sentence_panel_patch.js");
        }
        if (!this.loadAdapterScript(context, "theme_event_bridge.js")) {
          throw new Error("Critical Zotero theme event adapter failed: theme_event_bridge.js");
        }
        if (!this.loadAdapterScript(context, "language_bridge.js")) {
          throw new Error("Critical Zotero language compatibility adapter failed: language_bridge.js");
        }
        if (!this.loadAdapterScript(context, "glass_fallback.js")) {
          throw new Error("Critical Zotero Gecko glass adapter failed: glass_fallback.js");
        }

        // Upstream normally asks the highlighter to initialize Word Explosion
        // after both scripts have loaded. Calling the idempotent upstream entry
        // point here removes a race that is more common in Zotero's PDF iframe.
        try {
          context._eval(`if (typeof initWordExplosionSystem === 'function') { initWordExplosionSystem({ manualActivation: true }); }`);
        } catch (error) {
          context.scriptErrors ||= [];
          context.scriptErrors.push({ file: "adapter:word-explosion-init", error: error?.message || String(error) });
          this.reportError(error, "word explosion init: ");
        }

        context.bridgeBuild = "bridge17-thin-adapter-20260808";
        try {
          context.sentencePatch = JSON.parse(context._eval(`JSON.stringify(globalThis.__LINGKUMA_POSITIONED_SENTENCE_PATCH__ ? { installed: true, version: globalThis.__LINGKUMA_POSITIONED_SENTENCE_PATCH__.version } : { installed: false })`));
        } catch (_) { context.sentencePatch = { installed: false }; }
        try {
          context.sentencePanelPatch = JSON.parse(context._eval(`JSON.stringify(globalThis.__LINGKUMA_SENTENCE_PANEL_PATCH__ ? { installed: true, version: globalThis.__LINGKUMA_SENTENCE_PANEL_PATCH__.version, activations: globalThis.__LINGKUMA_SENTENCE_PANEL_PATCH__.activations || 0, fallbacks: globalThis.__LINGKUMA_SENTENCE_PANEL_PATCH__.fallbacks || 0 } : { installed: false })`));
        } catch (_) { context.sentencePanelPatch = { installed: false }; }
        context.loadedCount = context.loadedScripts?.length || 0;
        context.errorCount = context.scriptErrors?.length || 0;
        this.contextsByWindow.set(win, context);
        injected++;
      } catch (error) {
        try { context?.destroy(); } catch (_) {}
        this.contextsByWindow.delete(win);
        this.cleanupStylesheet(win);
        this.reportError(error, "inject candidate: ");
      }
    }

    const totalErrors = Array.from(this.contextsByWindow.values()).reduce((n, c) => n + (c.scriptErrors?.length || 0), 0);
    this.lastDiagnostic = `原因=${reason}; 发现窗口=${windows.length}; 可注入=${candidates.length}; 本次注入=${injected}; 活动上下文=${this.contextsByWindow.size}; 脚本错误=${totalErrors}`;
    this.debug(this.lastDiagnostic);

    // The PDF text iframe can be created after toolbar rendering. Retry only
    // when this reader still has no live context. Earlier builds kept retrying
    // after successful injection, producing needless scans in the debug log.
    const activeForReader = this.getContextsForReader(reader).length;
    if ((!candidates.length || injected === 0) && activeForReader === 0) {
      const retries = Number(reader.__lingkumaRetryCount || 0);
      if (retries < 8) {
        reader.__lingkumaRetryCount = retries + 1;
        const timer = setTimeout(() => {
          this.scanTimers.delete(reader);
          this.injectReader(reader, { reason: `${reason}-retry-${retries + 1}`, force: false })
            .catch(error => this.reportError(error, "reader retry: "));
        }, 700 + retries * 350);
        this.scanTimers.set(reader, timer);
      }
    } else {
      reader.__lingkumaRetryCount = 0;
    }
  }

  destroyContextForWindow(win) {
    const context = this.contextsByWindow.get(win);
    if (!context) return;
    try { context.destroy(); } catch (_) {}
    this.contextsByWindow.delete(win);
    this.cleanupStylesheet(win);
  }

  getContextsForReader(reader) {
    return Array.from(this.contextsByWindow.values()).filter(context => context.reader === reader && !context.destroyed);
  }

  openTermInReader(reader, rawTerm) {
    const term = String(rawTerm || "").trim().replace(/\s+/g, " ");
    if (!term) return;
    this.scheduleReaderScan(reader, "open-term");
    const context = this.getContextsForReader(reader)[0];
    try {
      const sandbox = context?.sandbox;
      if (sandbox && typeof sandbox.showEnhancedTooltipForWord === "function") {
        const win = context.win;
        const rect = new win.DOMRect(Math.max(20, win.innerWidth / 2 - 15), Math.max(20, win.innerHeight / 2 - 15), 30, 20);
        sandbox.showEnhancedTooltipForWord(term, term, rect, win.document.body, term);
      }
    } catch (error) {
      this.reportError(error, "open upstream tooltip: ");
    }
  }


  async saveTermAsChildNote(reader, term, explanation = "") {
    const attachment = Zotero.Items.get(reader?.itemID || reader?._item?.id);
    if (!attachment) throw new Error("无法确定当前附件");
    const parent = attachment.parentItem || attachment;
    const note = new Zotero.Item("note");
    note.libraryID = parent.libraryID;
    if (parent.isRegularItem?.()) note.parentID = parent.id;
    const escapedTerm = Zotero.Utilities.htmlSpecialChars(term);
    const escapedExplanation = Zotero.Utilities.htmlSpecialChars(explanation || "").replace(/\n/g, "<br>");
    note.setNote(`<h2>LingKuma: ${escapedTerm}</h2><p>${escapedExplanation}</p><p><small>来源：LingKuma for Zotero ${this.version}</small></p>`);
    await note.saveTx();
    return note;
  }

  async speak(text, options = {}) {
    const win = Zotero.getMainWindow();
    if (!win?.speechSynthesis || !win?.SpeechSynthesisUtterance) return;
    this.stopAudio();
    const utterance = new win.SpeechSynthesisUtterance(String(text || ""));
    if (options.lang) utterance.lang = options.lang;
    if (Number.isFinite(Number(options.rate))) utterance.rate = Number(options.rate);
    if (Number.isFinite(Number(options.pitch))) utterance.pitch = Number(options.pitch);
    this.speechUtterance = utterance;
    await new Promise((resolve, reject) => {
      utterance.onend = resolve;
      utterance.onerror = event => reject(new Error(event?.error || "TTS failed"));
      win.speechSynthesis.speak(utterance);
    });
  }

  async playAudioMessage(message) {
    const text = message?.text || message?.sentence || message?.data?.text || message?.options?.text;
    const url = message?.url || message?.audioUrl || message?.data?.url;
    if (url) {
      const win = Zotero.getMainWindow();
      this.stopAudio();
      this.audioElement = new win.Audio(url);
      await this.audioElement.play();
      return;
    }
    if (text) {
      const options = { ...(message?.options || {}) };
      // Upstream LingKuma sends the source language at the top level for
      // playLocal/playAudio. Preserve that contract so Chinese/Japanese/Korean
      // source text is spoken with a matching system voice.
      const sourceLang = message?.lang || message?.language || message?.data?.lang || message?.data?.language;
      if (sourceLang) options.lang = sourceLang;
      await this.speak(text, options);
    }
  }

  stopAudio() {
    try { Zotero.getMainWindow()?.speechSynthesis?.cancel(); } catch (_) {}
    try { this.audioElement?.pause(); } catch (_) {}
    this.audioElement = null;
    this.speechUtterance = null;
  }

  showMessage(title, message, win = null) {
    try { Services.prompt.alert(win || Zotero.getMainWindow(), title, message); }
    catch (_) { this.debug(`${title}: ${message}`); }
  }

  async openVocabularyManager(win = null) {
    win ||= Zotero.getMainWindow();
    const ps = Services.prompt;
    const count = Object.keys(this.state.words).length;
    const flags = ps.BUTTON_POS_0 * ps.BUTTON_TITLE_IS_STRING
      + ps.BUTTON_POS_1 * ps.BUTTON_TITLE_IS_STRING
      + ps.BUTTON_POS_2 * ps.BUTTON_TITLE_IS_STRING;
    const choice = ps.confirmEx(
      win,
      "LingKuma 词库",
      `当前词库：${count} 个词条\n\n导入支持 LingKuma 导出的 JSON；导出会复制 JSON 到剪贴板。`,
      flags,
      "导入 JSON",
      "导出到剪贴板",
      "查看统计",
      null,
      {}
    );
    if (choice === 0) {
      const input = { value: "" };
      const ok = ps.prompt(win, "导入 LingKuma JSON", "粘贴导出的 JSON 内容：", input, null, {});
      if (!ok || !input.value.trim()) return;
      try {
        const imported = this.state.importLingKuma(input.value, true);
        await this.state.save();
        this.host.broadcast({ action: "customWordUpdated" });
        this.showMessage("LingKuma", `已导入/合并 ${imported} 个词条。`, win);
        this.scanAllReaders("vocabulary-import", true);
      } catch (error) {
        this.showMessage("LingKuma", `导入失败：${error?.message || error}`, win);
      }
    } else if (choice === 1) {
      const json = JSON.stringify(this.state.exportData(), null, 2);
      try {
        await win.navigator.clipboard.writeText(json);
        this.showMessage("LingKuma", `已复制 ${count} 个词条的 JSON 到剪贴板。`, win);
      } catch (_) {
        const out = { value: json };
        ps.prompt(win, "导出 LingKuma JSON", "复制下面的 JSON：", out, null, {});
      }
    } else if (choice === 2) {
      const byStatus = {};
      for (const record of Object.values(this.state.words)) byStatus[record.status || "0"] = (byStatus[record.status || "0"] || 0) + 1;
      const custom = Object.values(this.state.words).filter(x => x.isCustom).length;
      this.showMessage("LingKuma 词库统计", `总词条：${count}\n自定义短语：${custom}\n熟悉度：${JSON.stringify(byStatus)}\n数据文件：${this.state.statePath || "Zotero 首选项回退存储"}`, win);
    }
  }

  showDiagnostics(win = null) {
    win ||= Zotero.getMainWindow();
    const contexts = Array.from(this.contextsByWindow.values());
    const lines = [
      `插件版本：${this.version}`,
      `上游 LingKuma：1.1.0 (commit ef15914a85166c24ae6db1b7d98773127dcaf4a4)`,
      `词条数量：${Object.keys(this.state.words).length}`,
      `默认免费 AI：${this.state.getEffectiveAIConfig().source === "custom" ? "已改为自定义" : "启用（无需用户 API Key）"}`,
      `活动阅读器：${Array.from(Zotero.Reader?._readers || []).length}`,
      `注入上下文：${contexts.length}`,
      `最近扫描：${this.lastDiagnostic}`,
      "",
      ...contexts.map((c, i) => `#${i + 1} ${c.readerType}; scripts=${c.loadedScripts?.length || 0}; errors=${c.scriptErrors?.length || 0}; url=${c.url}`)
    ];
    const errors = contexts.flatMap(c => c.scriptErrors || []).slice(0, 10);
    if (errors.length) {
      lines.push("", "前 10 个脚本错误：");
      for (const item of errors) lines.push(`- ${item.file}: ${item.error}`);
    }
    this.showMessage("LingKuma 运行诊断", lines.join("\n"), win);
  }
}

this.LingKumaZoteroPlugin = LingKumaZoteroPlugin;

(function () {
  "use strict";

  const HTML_NS = "http://www.w3.org/1999/xhtml";
  const STATUS_LABELS_ZH = ["未知", "学习中", "熟悉", "认识", "几乎掌握", "完全掌握"];
  const STATUS_LABELS_EN = ["Unknown", "Learning", "Familiar", "Known", "Almost mastered", "Mastered"];
  const UI_EN = {
  "熊": "Kuma",
  "LingKuma 设置导航": "LingKuma settings navigation",
  "数据库操作": "Database operations",
  "单词库操作": "Vocabulary operations",
  "导入已知单词": "Import known words",
  "备份数据": "Backup data",
  "API 配置": "API configuration",
  "基本设置": "Basic settings",
  "单词解释": "Word explanation",
  "第二个单词解释": "Second word explanation",
  "语言检测": "Language detection",
  "词性标签": "Grammar tags",
  "例句翻译": "Sentence translation",
  "句子解析": "Sentence analysis",
  "侧边栏解析": "Sidebar analysis",
  "单词列表": "Word list",
  "本地词库": "Local vocabulary",
  "学习统计": "Learning statistics",
  "TTS 配置": "TTS configuration",
  "本地 TTS": "Local TTS",
  "自定义 URL": "Custom URL",
  "弹窗设置": "Popup settings",
  "基础设置": "Basic settings",
  "弹窗行为": "Popup behavior",
  "背景设置": "Background settings",
  "自定义胶囊": "Custom capsules",
  "EPUB 文本修复": "EPUB text repair",
  "关于": "About",
  "浅色模式": "Light mode",
  "深色模式": "Dark mode",
  "界面语言": "Interface language",
  "自动 / Auto": "Auto",
  "中文": "Chinese",
  "正在载入设置……": "Loading settings…",
  "词库": "Vocabulary",
  "应用": "Apply",
  "诊断": "Diagnostics",
  "单词高亮": "Word highlighting",
  "在 Zotero PDF 和 EPUB 中标记未知词与学习中词汇。": "Highlight unknown and learning words in Zotero PDF and EPUB readers.",
  "Kuma 悬浮开关": "Kuma floating controls",
  "显示阅读页面上的 Kuma、明暗与收起控制。": "Show Kuma, theme, and collapse controls on the reader page.",
  "单词爆炸 💥": "Word Explosion 💥",
  "点击单词时显示整句翻译和句内词汇列表。": "Show sentence translation and in-sentence vocabulary when a word is clicked.",
  "词性高亮": "Part-of-speech highlighting",
  "保留原版词性标签与学习状态高亮。": "Keep upstream part-of-speech tags and learning-status highlighting.",
  "整句中显示原文": "Show source sentence",
  "在整句翻译上方显示被识别的原句。": "Show the detected source sentence above the full-sentence translation.",
  "语言与 AI": "Language & AI",
  "目标语言": "Target language",
  "简体中文": "Simplified Chinese",
  "繁體中文": "Traditional Chinese",
  "第一条 AI 释义": "First AI explanation",
  "第二条 AI 释义": "Second AI explanation",
  "自动保存未知词释义": "Auto-save explanations for unknown words",
  "默认展开释义胶囊": "Expand explanation capsule by default",
  "中文高亮": "Chinese highlighting",
  "日语高亮": "Japanese highlighting",
  "韩语高亮": "Korean highlighting",
  "捐赠与账号": "Donation & account",
  "LingKuma 上游项目采用 MIT 许可证。这里保留原设置页的入口，但 Zotero 移植版不代替上游作者提供账号服务。": "The upstream LingKuma project is MIT-licensed. This port keeps the original entry points, but does not replace upstream account services.",
  "爱发电 (afdian)": "Afdian",
  "服务器配置": "Server configuration",
  "启用云端数据库": "Enable cloud database",
  "仅保存配置。上游账号登录接口尚未接入 Zotero。": "Configuration only. Upstream account login is not connected in Zotero.",
  "启用双写": "Enable dual write",
  "同时保留本地词库与云端副本。": "Keep both a local vocabulary and a cloud copy.",
  "自建服务器": "Self-hosted server",
  "保存自建 LingKuma 服务地址。": "Save a self-hosted LingKuma service URL.",
  "服务器 URL": "Server URL",
  "Zotero 版当前可直接使用下方 WebDAV 完成跨设备词库与设置备份。Cloud Database 登录和付费账号验证仍属于浏览器扩展专属服务。": "The Zotero port can use WebDAV below for cross-device vocabulary and settings backups. Cloud Database login and paid-account verification remain browser-extension-only services.",
  "WebDAV 配置": "WebDAV configuration",
  "WebDAV 目录 URL": "WebDAV folder URL",
  "账号": "Username",
  "密码或应用专用密码": "Password or app password",
  "备份文件名": "Backup filename",
  "测试连接": "Test connection",
  "上传本地数据": "Upload local data",
  "下载并合并": "Download & merge",
  "下载并替换": "Download & replace",
  "WebDAV 凭据保存在 Zotero 数据目录中的 LingKuma 状态文件内。": "WebDAV credentials are stored in the LingKuma state file inside the Zotero data directory.",
  "数据库概况": "Database overview",
  "词条总数": "Total words",
  "例句总数": "Total sentences",
  "状态 4–5": "Status 4–5",
  "清理操作": "Cleanup",
  "每个词最多保留的例句数量": "Maximum sentences kept per word",
  "清理多余例句": "Trim extra sentences",
  "恢复完整单词弹窗": "Restore full word popup",
  "清空本地词库": "Clear local vocabulary",
  "导入": "Import",
  "导入词汇": "Import vocabulary",
  "支持 LingKuma JSON、Zotero 版备份 JSON，或每行一个单词。纯单词列表会按“已掌握 5”导入。": "Supports LingKuma JSON, Zotero backup JSON, or one word per line. Plain word lists are imported as status 5.",
  "粘贴 JSON，或每行输入一个单词": "Paste JSON, or enter one word per line",
  "导入方式": "Import mode",
  "合并，不覆盖已有记录": "Merge without overwriting existing records",
  "替换全部词库": "Replace the entire vocabulary",
  "纯词表状态": "Plain word-list status",
  "5 完全掌握": "5 Mastered",
  "4 几乎掌握": "4 Almost mastered",
  "1 学习中": "1 Learning",
  "0 未知": "0 Unknown",
  "开始导入": "Start import",
  "清空输入": "Clear input",
  "备份": "Backup",
  "词库与设置备份": "Vocabulary & settings backup",
  "备份内容包括词汇状态、释义、例句、标签及全部 Zotero 适配设置。": "The backup includes word status, explanations, sentences, tags, and all Zotero adapter settings.",
  "复制完整备份 JSON": "Copy full backup JSON",
  "仅复制设置 JSON": "Copy settings JSON only",
  "点击上方按钮生成备份；也可以粘贴备份后恢复。": "Use the buttons above to create a backup, or paste a backup here to restore it.",
  "恢复并合并": "Restore & merge",
  "恢复并替换": "Restore & replace",
  "API 基本": "API basics",
  "API 配置 · 基本设置": "API configuration · Basic settings",
  "AI 通道": "AI channel",
  "LingKuma 默认免费 AI / 自定义兼容接口": "LingKuma default free AI / custom compatible endpoint",
  "留空使用 LingKuma 默认免费 AI": "Leave blank to use LingKuma default free AI",
  "模型": "Model",
  "留空使用默认模型": "Leave blank to use the default model",
  "留空使用默认免费 AI": "Leave blank to use the default free AI",
  "只有填写自定义 Base URL 时，插件才切换到你自己的 API。留空时继续使用从 LingKuma 源码移植的默认服务。": "The plugin switches to your own API only when a custom Base URL is entered. Leave it blank to continue using the default service ported from LingKuma.",
  "API 配置 · 单词解释": "API configuration · Word explanation",
  "单词解释 AI 提示词": "Word explanation AI prompt",
  "留空使用 LingKuma 原版默认提示词": "Leave blank to use the upstream LingKuma default prompt",
  "恢复默认提示词": "Restore default prompt",
  "API 配置 · 第二个单词解释": "API configuration · Second word explanation",
  "第二个单词解释 AI 提示词": "Second word explanation AI prompt",
  "API 配置 · 语言检测": "API configuration · Language detection",
  "语言检测 AI 提示词": "Language detection AI prompt",
  "API 配置 · 词性标签": "API configuration · Grammar tags",
  "词性标签分析提示词": "Grammar-tag analysis prompt",
  "API 配置 · 例句翻译": "API configuration · Sentence translation",
  "例句与整句翻译提示词": "Example/full-sentence translation prompt",
  "API 配置 · 句子解析": "API configuration · Sentence analysis",
  "句子解析 AI 提示词": "Sentence-analysis AI prompt",
  "API 配置 · 侧边栏解析": "API configuration · Sidebar analysis",
  "侧边栏 AI 解析提示词": "Sidebar AI analysis prompt",
  "本地词条": "Local entries",
  "刷新": "Refresh",
  "搜索": "Search",
  "单词、释义、标签": "Word, explanation, tag",
  "状态": "Status",
  "全部状态": "All statuses",
  "2 熟悉": "2 Familiar",
  "3 认识": "3 Known",
  "每页": "Per page",
  "单词": "Word",
  "释义": "Explanation",
  "例句": "Sentences",
  "操作": "Actions",
  "上一页": "Previous",
  "第 1 页": "Page 1",
  "下一页": "Next",
  "当前词库统计": "Current vocabulary statistics",
  "语言分布": "Language distribution",
  "TTS 配置 · 基本设置": "TTS configuration · Basic settings",
  "发音渠道": "Speech channel",
  "单词发音渠道": "Word speech channel",
  "系统本地 TTS": "System local TTS",
  "句子发音渠道": "Sentence speech channel",
  "启用单词 TTS": "Enable word TTS",
  "启用句子 TTS": "Enable sentence TTS",
  "TTS 配置 · 本地 TTS": "TTS configuration · Local TTS",
  "系统语音": "System voice",
  "默认语音名称（留空自动选择）": "Default voice name (leave blank for automatic selection)",
  "语速": "Rate",
  "音调": "Pitch",
  "测试本地 TTS": "Test local TTS",
  "TTS 配置 · Edge TTS": "TTS configuration · Edge TTS",
  "自动根据语言选择声音": "Automatically select voice by language",
  "声音名称": "Voice name",
  "音量": "Volume",
  "TTS 配置 · GPT TTS": "TTS configuration · GPT TTS",
  "输出格式": "Output format",
  "TTS 配置 · 自定义 URL": "TTS configuration · Custom URL",
  "自定义语音 URL 模板": "Custom speech URL template",
  "支持变量 {word} 与 {lang}。点击发音时插件会替换变量并请求该 URL。": "Supports {word} and {lang}. The plugin substitutes them when pronunciation is requested.",
  "URL 模板 1": "URL template 1",
  "URL 模板 2": "URL template 2",
  "弹窗设置 · 弹窗行为": "Popup settings · Behavior",
  "单词弹窗行为": "Word popup behavior",
  "仅点击时打开": "Open only on click",
  "自动展开弹窗": "Auto-expand popup",
  "自动关闭弹窗": "Auto-close popup",
  "自动刷新弹窗": "Auto-refresh popup",
  "优先显示在单词上方": "Prefer above the word",
  "选择文本时优先向下": "Prefer below text selections",
  "单词弹窗间距": "Word popup gap",
  "选区弹窗间距": "Selection popup gap",
  "清除缩小状态": "Clear minimized state",
  "重新载入当前阅读器": "Reload current reader",
  "整句翻译面板": "Full-sentence translation panel",
  "触发模式": "Trigger mode",
  "点击": "Click",
  "悬停": "Hover",
  "位置模式": "Position mode",
  "自动": "Auto",
  "手动": "Manual",
  "字号": "Font size",
  "最大宽度": "Maximum width",
  "单词排列": "Word columns",
  "单列": "One column",
  "双列": "Two columns",
  "三列": "Three columns",
  "每词释义数": "Explanations per word",
  "全部": "All",
  "整句翻译数量": "Sentence translations",
  "优先向上": "Prefer above",
  "高亮当前句子": "Highlight current sentence",
  "句子高亮颜色": "Sentence highlight color",
  "弹窗设置 · 背景设置": "Popup settings · Background",
  "弹窗外观": "Popup appearance",
  "弹窗主题": "Popup theme",
  "浅色": "Light",
  "深色": "Dark",
  "图案背景": "Pattern background",
  "液态玻璃效果": "Liquid glass effect",
  "分析窗口玻璃效果": "Analysis-window glass effect",
  "设备像素缩放": "Device pixel scaling",
  "玻璃类型": "Glass type",
  "无": "None",
  "磨砂": "Frosted",
  "液态（Zotero 中使用兼容玻璃）": "Liquid (uses compatible glass in Zotero)",
  "Zotero 基于 Gecko，无法渲染 Chromium 的 SVG 液态扭曲滤镜；启用后会使用可读性更稳定的兼容毛玻璃效果。": "Zotero is Gecko-based and cannot render Chromium's SVG liquid-distortion filter; the port uses a more stable compatible frosted-glass effect instead.",
  "弹窗设置 · 自定义胶囊": "Popup settings · Custom capsules",
  "自定义搜索胶囊": "Custom search capsules",
  "使用 JSON 编辑原版 customCapsules 配置。URL 中可使用 {word} 和 {sentence}。": "Edit the upstream customCapsules configuration as JSON. URLs may use {word} and {sentence}.",
  "格式化 JSON": "Format JSON",
  "恢复默认": "Restore default",
  "EPUB 阅读适配": "EPUB reading adaptation",
  "浏览器版的 EPUB 拆分、Telegra.ph 上传和罗马注音清理是独立文件转换工具。Zotero 插件不会在设置窗口内改写你的原始电子书文件。": "The browser build's EPUB splitting, Telegra.ph upload, and romanization cleanup are separate file-conversion tools. The Zotero plugin does not rewrite original ebook files from the settings window.",
  "自动清理 EPUB 文本中的软连字符": "Automatically clean soft hyphens in EPUB text",
  "只影响 LingKuma 在 Zotero 阅读器中获取的文本，不修改附件文件。": "Affects only text LingKuma reads inside Zotero; attachment files are not modified.",
  "合并断行单词": "Repair line-broken words",
  "尝试把分页或断行造成的英文连字符重新连接。": "Try to reconnect English words split by page or line-break hyphenation.",
  "需要转换 EPUB 文件时，仍建议使用 LingKuma 原仓库中的独立工具或 Calibre。这里的设置仅作用于 Zotero 阅读器中的语言学习识别。": "For EPUB file conversion, use the standalone tools in the upstream LingKuma repository or Calibre. These settings affect only language-learning recognition inside Zotero.",
  "这是基于 LingKuma 1.1.0 源代码的非官方 Zotero 适配版。语言学习、高亮、AI 释义、整句翻译和弹窗逻辑来自 LingKuma；当前页面是直接嵌入 Zotero 设置窗口的原生设置面板，不再加载 iframe 或跳转浏览器网页。": "This is an unofficial Zotero port based on LingKuma 1.1.0. Language learning, highlighting, AI explanations, sentence translation, and popup logic come from LingKuma; this page is a native Zotero settings panel rather than an iframe or browser page.",
  "打开 LingKuma GitHub": "Open LingKuma GitHub",
  "运行诊断": "Run diagnostics",
  "恢复默认设置": "Restore default settings",
  "恢复默认设置不会删除词库、熟悉度、释义或例句。": "Restoring defaults does not delete vocabulary, familiarity status, explanations, or sentences.",
  "插件主进程尚未就绪。请关闭设置窗口并重新打开。": "The plugin process is not ready yet. Close and reopen the settings window.",
  "设置直接保存在 Zotero 中；当前使用自定义 AI。": "Settings are saved directly in Zotero; a custom AI endpoint is active.",
  "设置直接保存在 Zotero 中；当前使用 LingKuma 默认免费 AI。": "Settings are saved directly in Zotero; LingKuma's default free AI is active.",
  "正在保存设置……": "Saving settings…",
  "设置已直接保存到 Zotero。": "Settings saved directly to Zotero.",
  "已把设置重新应用到所有打开的阅读器。": "Settings reapplied to all open readers.",
  "本地词库已清空。": "Local vocabulary cleared.",
  "已恢复默认设置，词库数据保持不变。": "Default settings restored; vocabulary data was kept.",
  "正在播放本地 TTS 测试。": "Playing local TTS test.",
  "词库为空。": "Vocabulary is empty.",
  "没有匹配的词条": "No matching entries",
  "删除": "Delete"
};
  const ORIGINAL_TEXT = new WeakMap();
  const ORIGINAL_ATTRS = new WeakMap();

  function clone(value) {
    if (value === undefined) return undefined;
    return JSON.parse(JSON.stringify(value));
  }

  function escapeHTML(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  window.LingKumaZoteroPrefs = {
    initialized: false,
    saveTimer: null,
    applyTimer: null,
    wordPage: 1,
    wordRows: [],

    interfaceLanguage() {
      const selector = document.getElementById("lk-ui-language");
      const configured = String(selector?.value || this.state()?.storage?.interfaceLanguage || "auto").toLowerCase();
      if (configured === "zh" || configured === "en") return configured;
      let locale = "";
      try { locale = String(Zotero?.locale || Zotero?.getMainWindow?.()?.Zotero?.locale || ""); } catch (_) {}
      if (!locale) { try { locale = String(navigator?.language || ""); } catch (_) {} }
      return locale.toLowerCase().startsWith("zh") ? "zh" : "en";
    },

    isEnglishUI() { return this.interfaceLanguage() === "en"; },

    tr(text) {
      const value = String(text ?? "");
      if (!this.isEnglishUI()) return value;
      if (UI_EN[value]) return UI_EN[value];
      const patterns = [
        [/^操作失败：(.+)$/, "Operation failed: $1"],
        [/^设置未保存：(.+)$/, "Settings were not saved: $1"],
        [/^已删除 (\d+) 条多余例句。$/, "Removed $1 extra sentences."],
        [/^已读取文件：(.+)$/, "Loaded file: $1"],
        [/^已导入 (\d+) 个词条。$/, "Imported $1 entries."]
      ];
      for (const [pattern, replacement] of patterns) {
        if (pattern.test(value)) return value.replace(pattern, replacement);
      }
      return value;
    },

    statusLabels() { return this.isEnglishUI() ? STATUS_LABELS_EN : STATUS_LABELS_ZH; },

    applyInterfaceLanguage() {
      const english = this.isEnglishUI();
      const root = document.getElementById("lk-settings-app") || document.documentElement;
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      let node = null;
      while ((node = walker.nextNode())) {
        const current = node.nodeValue || "";
        if (!ORIGINAL_TEXT.has(node)) ORIGINAL_TEXT.set(node, current);
        const original = ORIGINAL_TEXT.get(node) || "";
        const trimmed = original.trim();
        if (!trimmed) { node.nodeValue = original; continue; }
        const translated = english ? (UI_EN[trimmed] || trimmed) : trimmed;
        node.nodeValue = original.replace(trimmed, translated);
      }
      const attrs = ["title", "placeholder", "aria-label", "data-title"];
      for (const element of root.querySelectorAll("*")) {
        let originals = ORIGINAL_ATTRS.get(element);
        if (!originals) { originals = {}; ORIGINAL_ATTRS.set(element, originals); }
        for (const attr of attrs) {
          if (!element.hasAttribute(attr) && originals[attr] === undefined) continue;
          if (originals[attr] === undefined) originals[attr] = element.getAttribute(attr);
          const original = originals[attr];
          if (original === null || original === undefined) continue;
          element.setAttribute(attr, english ? (UI_EN[original] || original) : original);
        }
      }
      document.documentElement.setAttribute("lang", english ? "en" : "zh-CN");
      // Dynamic sections are rebuilt in the selected interface language.
      this.renderWordList();
      this.renderStatistics();
      const currentPanel = document.querySelector("[data-lk-page-panel].active");
      const title = document.getElementById("lk-page-title");
      if (currentPanel && title) title.textContent = currentPanel.dataset.title || this.tr("基础设置");
    },

    plugin() {
      try {
        return Zotero.getMainWindow()?.LingKumaZoteroPlugin || null;
      } catch (_) {
        return null;
      }
    },

    state() {
      return this.plugin()?.state || null;
    },

    status(message, state = "") {
      const node = document.getElementById("lk-settings-status");
      if (!node) return;
      node.textContent = this.tr(String(message || ""));
      if (state) node.dataset.state = state;
      else delete node.dataset.state;
    },

    async init() {
      if (this.initialized) return;
      this.initialized = true;
      let plugin = this.plugin();
      for (let i = 0; !plugin && i < 30; i++) {
        await new Promise(resolve => setTimeout(resolve, 100));
        plugin = this.plugin();
      }
      if (!plugin) {
        this.status("插件主进程尚未就绪。请关闭设置窗口并重新打开。", "error");
        return;
      }

      this.bindNavigation();
      this.bindControls();
      this.bindActions();
      this.loadControls();
      this.applyInterfaceLanguage();
      this.setTheme(plugin.state.storage.settingsPanelTheme || "light", false);
      this.refreshWordSummary();
      this.renderWordList();
      this.renderStatistics();
      this.status(
        plugin.state.storage.aiConfig?.apiBaseURL
          ? "设置直接保存在 Zotero 中；当前使用自定义 AI。"
          : "设置直接保存在 Zotero 中；当前使用 LingKuma 默认免费 AI。",
        "saved"
      );
    },

    bindNavigation() {
      for (const button of document.querySelectorAll("[data-lk-toggle-group]")) {
        button.addEventListener("click", () => {
          const group = document.querySelector(`[data-lk-group="${button.dataset.lkToggleGroup}"]`);
          if (!group) return;
          if (group.hasAttribute("hidden")) group.removeAttribute("hidden");
          else group.setAttribute("hidden", "hidden");
        });
      }

      for (const button of document.querySelectorAll("[data-lk-page]")) {
        button.addEventListener("click", () => this.showPage(button.dataset.lkPage));
      }
    },

    showPage(page) {
      for (const panel of document.querySelectorAll("[data-lk-page-panel]")) {
        panel.classList.toggle("active", panel.dataset.lkPagePanel === page);
      }
      for (const button of document.querySelectorAll("[data-lk-page]")) {
        button.classList.toggle("active", button.dataset.lkPage === page);
      }
      const panel = document.querySelector(`[data-lk-page-panel="${page}"]`);
      const title = document.getElementById("lk-page-title");
      if (panel && title) title.textContent = panel.dataset.title || "LingKuma 设置";
      if (page === "word-list") this.renderWordList();
      if (page === "statistics") this.renderStatistics();
      if (page === "word-operations") this.refreshWordSummary();
      document.querySelector(".lk-main")?.scrollTo({ top: 0, behavior: "instant" });
    },

    bindControls() {
      const selector = "[data-lk-key], [data-lk-object], [data-lk-special]";
      for (const control of document.querySelectorAll(selector)) {
        const eventName = ["text", "password", "number", "search", "range"].includes(control.type) || control.tagName === "TEXTAREA"
          ? "input"
          : "change";
        control.addEventListener(eventName, () => this.scheduleSave());
        if (eventName !== "change") control.addEventListener("change", () => this.scheduleSave());
      }
      document.getElementById("lk-import-file")?.addEventListener("change", event => this.readImportFile(event));
      document.getElementById("lk-word-search")?.addEventListener("input", () => {
        this.wordPage = 1;
        this.renderWordList();
      });
      document.getElementById("lk-word-status-filter")?.addEventListener("change", () => {
        this.wordPage = 1;
        this.renderWordList();
      });
      document.getElementById("lk-word-page-size")?.addEventListener("change", () => {
        this.wordPage = 1;
        this.renderWordList();
      });
      document.getElementById("lk-ui-language")?.addEventListener("change", () => {
        this.applyInterfaceLanguage();
      });
    },

    bindActions() {
      for (const button of document.querySelectorAll("[data-lk-action]")) {
        button.addEventListener("click", event => {
          const action = event.currentTarget.dataset.lkAction;
          this.handleAction(action, event.currentTarget).catch(error => {
            this.status(`操作失败：${error?.message || error}`, "error");
            try { Zotero.logError(error); } catch (_) {}
          });
        });
      }
    },

    async handleAction(action, button) {
      switch (action) {
        case "theme-light": return this.setTheme("light", true);
        case "theme-dark": return this.setTheme("dark", true);
        case "apply-now": return this.applyNow();
        case "diagnostic": return this.plugin()?.showDiagnostics(Zotero.getMainWindow());
        case "open-vocabulary": return this.plugin()?.openVocabularyManager(Zotero.getMainWindow());
        case "open-upstream": return Zotero.launchURL("https://github.com/lingkuma/LingKuma");
        case "open-afdian": return Zotero.launchURL("https://afdian.com/");
        case "reset-minimized": return this.resetMinimized();
        case "clear-words": return this.clearWords();
        case "trim-sentences": return this.trimSentences();
        case "clear-import": document.getElementById("lk-import-text").value = ""; return;
        case "import-words": return this.importWords();
        case "copy-full-backup": return this.copyBackup(false);
        case "copy-settings-backup": return this.copyBackup(true);
        case "restore-merge": return this.restoreBackup(true);
        case "restore-replace": return this.restoreBackup(false);
        case "webdav-test": return this.webdavTest();
        case "webdav-upload": return this.webdavUpload();
        case "webdav-download-merge": return this.webdavDownload(true);
        case "webdav-download-replace": return this.webdavDownload(false);
        case "clear-setting": return this.clearSetting(button.dataset.key);
        case "refresh-word-list": return this.renderWordList();
        case "word-prev": this.wordPage = Math.max(1, this.wordPage - 1); return this.renderWordList();
        case "word-next": this.wordPage += 1; return this.renderWordList();
        case "format-capsules": return this.formatCapsules();
        case "test-local-tts": return this.testLocalTTS();
        case "reset-settings": return this.resetSettings();
        default: return undefined;
      }
    },

    loadControls() {
      const storage = this.state()?.storage || {};
      for (const control of document.querySelectorAll("[data-lk-key]")) {
        const key = control.dataset.lkKey;
        let value = storage[key];
        if (control.dataset.lkType === "json") {
          control.value = value === undefined ? "" : JSON.stringify(value, null, 2);
          continue;
        }
        if (control.type === "checkbox") control.checked = value === true;
        else if (value !== undefined && value !== null) control.value = String(value);
        else control.value = "";
      }
      for (const control of document.querySelectorAll("[data-lk-object]")) {
        const obj = storage[control.dataset.lkObject] || {};
        const value = obj[control.dataset.lkSubkey];
        if (control.type === "checkbox") control.checked = value === true;
        else if (value !== undefined && value !== null) control.value = String(value);
        else control.value = "";
      }
      const bg = document.querySelector('[data-lk-special="tooltipBackgroundEnabled"]');
      if (bg) bg.checked = storage.tooltipBackground?.enabled !== false;
    },

    readControl(control) {
      if (control.type === "checkbox") return control.checked;
      if (control.dataset.lkType === "number") {
        const value = Number(control.value);
        return Number.isFinite(value) ? value : 0;
      }
      if (control.dataset.lkType === "json") {
        const text = control.value.trim();
        if (!text) return [];
        return JSON.parse(text);
      }
      return control.value;
    },

    collectSettings() {
      const plugin = this.plugin();
      const values = {};
      for (const control of document.querySelectorAll("[data-lk-key]")) {
        values[control.dataset.lkKey] = this.readControl(control);
      }
      for (const control of document.querySelectorAll("[data-lk-object]")) {
        const objectName = control.dataset.lkObject;
        values[objectName] ||= clone(plugin.state.storage[objectName] || {});
        values[objectName][control.dataset.lkSubkey] = this.readControl(control);
      }
      const bg = document.querySelector('[data-lk-special="tooltipBackgroundEnabled"]');
      if (bg) {
        values.tooltipBackground = {
          ...(plugin.state.storage.tooltipBackground || {}),
          enabled: bg.checked,
          useCustom: false,
          defaultType: plugin.state.storage.tooltipBackground?.defaultType || "svg"
        };
      }
      // In Zotero the true Chromium SVG liquid distortion is unavailable.
      // Do not allow the old "liquid enabled + no material" combination,
      // which makes the tooltip transparent with no glass layer.
      if (values.liquidGlassEnabled === true && (!values.glassEffectType || values.glassEffectType === "none")) {
        values.glassEffectType = "rough";
        const materialControl = document.querySelector('[data-lk-key="glassEffectType"]');
        if (materialControl) materialControl.value = "rough";
      }
      values.cloudConfig = {
        ...(plugin.state.storage.cloudConfig || {}),
        cloudDbEnabled: values.cloudDbEnabled === true,
        cloudDualWrite: values.cloudDualWrite === true,
        cloudSelfHosted: values.cloudSelfHosted === true,
        serverUrl: values.cloudServerUrl || ""
      };
      return values;
    },

    scheduleSave() {
      this.status("正在保存设置……");
      clearTimeout(this.saveTimer);
      this.saveTimer = setTimeout(() => this.saveSettings(true), 300);
    },

    async saveSettings(scheduleApply = true) {
      const plugin = this.plugin();
      if (!plugin) return;
      try {
        const values = this.collectSettings();
        plugin.state.storageSet(values);
        await plugin.state.save();
        plugin.host.broadcast({ action: "toggleHighlight", enabled: values.enablePlugin !== false });
        this.status("设置已直接保存到 Zotero。", "saved");
        if (scheduleApply) {
          clearTimeout(this.applyTimer);
          this.applyTimer = setTimeout(() => {
            try { plugin.scanAllReaders("native-settings-auto-apply", true); } catch (_) {}
          }, 700);
        }
      } catch (error) {
        this.status(`设置未保存：${error?.message || error}`, "error");
        throw error;
      }
    },

    setTheme(theme, persist) {
      const normalized = theme === "dark" ? "dark" : "light";
      document.getElementById("lk-settings-app")?.setAttribute("data-theme", normalized);
      for (const button of document.querySelectorAll('[data-lk-action="theme-light"], [data-lk-action="theme-dark"]')) {
        button.classList.toggle("active", button.dataset.lkAction === `theme-${normalized}`);
      }
      if (persist) {
        this.plugin()?.state.storageSet({ settingsPanelTheme: normalized });
        this.plugin()?.state.save();
      }
    },

    async applyNow() {
      if (this.saveTimer) {
        clearTimeout(this.saveTimer);
        this.saveTimer = null;
        await this.saveSettings(false);
      }
      this.plugin()?.scanAllReaders("native-settings-apply-now", true);
      this.status("已把设置重新应用到所有打开的阅读器。", "saved");
    },

    refreshWordSummary() {
      const words = Object.values(this.state()?.words || {});
      const sentences = words.reduce((sum, record) => sum + (Array.isArray(record.sentences) ? record.sentences.length : 0), 0);
      const learned = words.filter(record => Number(record.status || 0) >= 4).length;
      const set = (id, value) => { const node = document.getElementById(id); if (node) node.textContent = String(value); };
      set("lk-word-count", words.length);
      set("lk-sentence-count", sentences);
      set("lk-learned-count", learned);
    },

    async clearWords() {
      if (!window.confirm("确认清空 LingKuma 本地词库？此操作不会删除插件设置，但会删除所有熟悉度、释义和例句。")) return;
      this.state().clearWords();
      await this.state().save();
      this.refreshWordSummary();
      this.renderWordList();
      this.renderStatistics();
      this.plugin()?.scanAllReaders("native-settings-clear-words", true);
      this.status("本地词库已清空。", "saved");
    },

    async trimSentences() {
      const keep = Math.max(0, Number(document.getElementById("lk-keep-sentences")?.value || 0));
      let removed = 0;
      for (const record of Object.values(this.state().words || {})) {
        const current = Array.isArray(record.sentences) ? record.sentences : [];
        if (current.length > keep) {
          removed += current.length - keep;
          record.sentences = current.slice(0, keep);
          record.updatedAt = new Date().toISOString();
        }
      }
      this.state().scheduleSave();
      await this.state().save();
      this.refreshWordSummary();
      this.status(`已删除 ${removed} 条多余例句。`, "saved");
    },

    async resetMinimized() {
      this.state().storageSet({ tooltipMinimized: false });
      await this.state().save();
      this.plugin()?.scanAllReaders("native-settings-reset-minimized", true);
      this.status("已清除缩小状态。下一次查词将显示完整弹窗。", "saved");
    },

    async readImportFile(event) {
      const file = event.target.files?.[0];
      if (!file) return;
      const text = await file.text();
      document.getElementById("lk-import-text").value = text;
      this.status(`已读取文件：${file.name}`, "saved");
    },

    parseImportText(text, status) {
      const trimmed = String(text || "").trim();
      if (!trimmed) throw new Error("请先选择文件或粘贴词汇数据");
      try { return JSON.parse(trimmed); }
      catch (_) {
        const words = trimmed.split(/[\r\n,;]+/).map(item => item.trim()).filter(Boolean);
        if (!words.length) throw new Error("没有识别到可导入的单词");
        return words.map(word => ({ word, term: word, status: String(status || 5) }));
      }
    },

    async importWords() {
      const text = document.getElementById("lk-import-text")?.value || "";
      const mode = document.getElementById("lk-import-mode")?.value || "merge";
      const status = document.getElementById("lk-import-status")?.value || "5";
      const parsed = this.parseImportText(text, status);
      const count = this.state().importLingKuma(parsed, mode === "merge");
      await this.state().save();
      this.refreshWordSummary();
      this.renderWordList();
      this.renderStatistics();
      this.plugin()?.scanAllReaders("native-settings-import", true);
      this.status(`已导入 ${count} 个词条。`, "saved");
    },

    async copyText(text) {
      const win = Zotero.getMainWindow();
      if (win?.navigator?.clipboard?.writeText) {
        await win.navigator.clipboard.writeText(text);
        return;
      }
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        return;
      }
      throw new Error("当前系统不允许写入剪贴板");
    },

    async copyBackup(settingsOnly) {
      const payload = settingsOnly
        ? { format: "lingkuma-zotero-settings", version: 10, exportedAt: new Date().toISOString(), storage: clone(this.state().storage) }
        : this.state().exportData();
      const text = JSON.stringify(payload, null, 2);
      document.getElementById("lk-backup-text").value = text;
      await this.copyText(text);
      this.status(settingsOnly ? "设置备份已复制到剪贴板。" : "完整备份已复制到剪贴板。", "saved");
    },

    async restoreBackup(merge) {
      const text = document.getElementById("lk-backup-text")?.value.trim();
      if (!text) throw new Error("请先粘贴备份 JSON");
      const parsed = JSON.parse(text);
      if (!merge && !window.confirm("替换会覆盖当前词库和设置。确认继续？")) return;
      if (!merge) this.state().storageClear();
      if (parsed.storage && typeof parsed.storage === "object") this.state().storageSet(parsed.storage);
      if (parsed.words || parsed.wordDetails || parsed.vocabulary || parsed.data) this.state().importLingKuma(parsed, merge);
      await this.state().save();
      this.loadControls();
      this.refreshWordSummary();
      this.renderWordList();
      this.renderStatistics();
      this.plugin()?.scanAllReaders("native-settings-restore", true);
      this.status(merge ? "备份已合并。" : "备份已替换当前数据。", "saved");
    },

    webdavConfig() {
      return clone(this.state().storage.webdavConfig || {});
    },

    webdavURL() {
      const config = this.webdavConfig();
      const base = String(config.url || "").trim();
      if (!base) throw new Error("请填写 WebDAV 目录 URL");
      const filename = String(config.filename || "lingkuma-zotero-backup.json").trim();
      return `${base.replace(/\/+$/, "")}/${encodeURIComponent(filename)}`;
    },

    webdavHeaders(extra = {}) {
      const config = this.webdavConfig();
      const headers = { ...extra };
      if (config.username || config.password) {
        headers.Authorization = `Basic ${btoa(`${config.username || ""}:${config.password || ""}`)}`;
      }
      return headers;
    },

    setWebdavStatus(message, error = false) {
      const node = document.getElementById("lk-webdav-status");
      if (node) {
        node.textContent = message;
        node.style.color = error ? "var(--lk-danger)" : "";
      }
      this.status(message, error ? "error" : "saved");
    },

    async webdavTest() {
      await this.saveSettings(false);
      const config = this.webdavConfig();
      const base = String(config.url || "").replace(/\/+$/, "") + "/";
      if (!config.url) throw new Error("请填写 WebDAV 目录 URL");
      this.setWebdavStatus("正在测试 WebDAV……");
      await Zotero.HTTP.request("PROPFIND", base, {
        headers: this.webdavHeaders({ Depth: "0", "Content-Type": "application/xml" }),
        body: '<?xml version="1.0"?><propfind xmlns="DAV:"><prop><resourcetype/></prop></propfind>',
        timeout: 30000
      });
      this.setWebdavStatus("WebDAV 连接成功。", false);
    },

    async webdavUpload() {
      await this.saveSettings(false);
      const url = this.webdavURL();
      this.setWebdavStatus("正在上传 LingKuma 备份……");
      await Zotero.HTTP.request("PUT", url, {
        headers: this.webdavHeaders({ "Content-Type": "application/json; charset=utf-8" }),
        body: JSON.stringify(this.state().exportData(), null, 2),
        timeout: 60000
      });
      this.setWebdavStatus("WebDAV 上传完成。", false);
    },

    async webdavDownload(merge) {
      await this.saveSettings(false);
      if (!merge && !window.confirm("下载并替换会覆盖当前 LingKuma 词库与设置。确认继续？")) return;
      const url = this.webdavURL();
      this.setWebdavStatus("正在下载 WebDAV 备份……");
      const xhr = await Zotero.HTTP.request("GET", url, {
        headers: this.webdavHeaders(),
        responseType: "text",
        timeout: 60000
      });
      const parsed = JSON.parse(xhr.responseText || xhr.response || "{}");
      if (!merge) this.state().storageClear();
      if (parsed.storage) this.state().storageSet(parsed.storage);
      if (parsed.words) this.state().restoreWords(parsed.words, merge);
      await this.state().save();
      this.loadControls();
      this.refreshWordSummary();
      this.renderWordList();
      this.renderStatistics();
      this.plugin()?.scanAllReaders("native-settings-webdav-download", true);
      this.setWebdavStatus(merge ? "WebDAV 数据已下载并合并。" : "WebDAV 数据已下载并替换。", false);
    },

    async clearSetting(key) {
      if (!key) return;
      this.state().storageRemove(key);
      await this.state().save();
      const control = document.querySelector(`[data-lk-key="${key}"]`);
      if (control) control.value = control.dataset.lkType === "json" ? "[]" : "";
      this.plugin()?.scanAllReaders("native-settings-clear-setting", true);
      this.status("已恢复该项目的 LingKuma 默认值。", "saved");
    },

    formatCapsules() {
      const node = document.getElementById("lk-custom-capsules");
      if (!node) return;
      const parsed = node.value.trim() ? JSON.parse(node.value) : [];
      node.value = JSON.stringify(parsed, null, 2);
      this.scheduleSave();
    },

    filteredWords() {
      const query = String(document.getElementById("lk-word-search")?.value || "").trim().toLowerCase();
      const status = document.getElementById("lk-word-status-filter")?.value || "all";
      const visibleWords = this.state()?.getAllWordDetails?.() || this.state()?.words || {};
      const rows = Object.values(visibleWords).filter(record => {
        if (status !== "all" && String(record.status || "0") !== status) return false;
        if (!query) return true;
        return [record.term, record.word, ...(record.translations || []), ...(record.tags || [])]
          .join(" ").toLowerCase().includes(query);
      });
      rows.sort((a, b) => String(a.term || a.word).localeCompare(String(b.term || b.word)));
      return rows;
    },

    renderWordList() {
      const tbody = document.getElementById("lk-word-table-body");
      if (!tbody) return;
      const rows = this.filteredWords();
      const pageSize = Math.max(1, Number(document.getElementById("lk-word-page-size")?.value || 20));
      const pages = Math.max(1, Math.ceil(rows.length / pageSize));
      this.wordPage = Math.min(Math.max(1, this.wordPage), pages);
      const start = (this.wordPage - 1) * pageSize;
      const pageRows = rows.slice(start, start + pageSize);
      const fragment = document.createDocumentFragment();

      if (!pageRows.length) {
        const row = document.createElementNS(HTML_NS, "tr");
        const cell = document.createElementNS(HTML_NS, "td");
        cell.colSpan = 5;
        cell.style.textAlign = "center";
        cell.style.padding = "24px";
        cell.textContent = this.tr("没有匹配的词条");
        row.appendChild(cell);
        fragment.appendChild(row);
      } else {
        for (const record of pageRows) {
          const word = record.word || String(record.term || "").toLowerCase();
          const row = document.createElementNS(HTML_NS, "tr");
          row.dataset.word = word;

          const wordCell = document.createElementNS(HTML_NS, "td");
          const strong = document.createElementNS(HTML_NS, "strong");
          strong.textContent = record.term || record.word || word;
          const br = document.createElementNS(HTML_NS, "br");
          const small = document.createElementNS(HTML_NS, "small");
          small.textContent = record.language || "auto";
          wordCell.append(strong, br, small);

          const statusCell = document.createElementNS(HTML_NS, "td");
          const select = document.createElementNS(HTML_NS, "select");
          select.dataset.wordAction = "status";
          this.statusLabels().forEach((label, index) => {
            const option = document.createElementNS(HTML_NS, "option");
            option.value = String(index);
            option.textContent = `${index} ${label}`;
            option.selected = String(record.status || 0) === String(index);
            select.appendChild(option);
          });
          statusCell.appendChild(select);

          const translationCell = document.createElementNS(HTML_NS, "td");
          const input = document.createElementNS(HTML_NS, "input");
          input.dataset.wordAction = "translations";
          input.value = (record.translations || []).join("；");
          translationCell.appendChild(input);

          const sentenceCell = document.createElementNS(HTML_NS, "td");
          sentenceCell.textContent = String(Array.isArray(record.sentences) ? record.sentences.length : 0);

          const actionCell = document.createElementNS(HTML_NS, "td");
          const button = document.createElementNS(HTML_NS, "button");
          button.type = "button";
          button.className = "delete";
          button.dataset.wordAction = "delete";
          button.textContent = this.tr("删除");
          actionCell.appendChild(button);

          row.append(wordCell, statusCell, translationCell, sentenceCell, actionCell);
          fragment.appendChild(row);
        }
      }
      tbody.replaceChildren(fragment);
      const info = document.getElementById("lk-word-page-info");
      if (info) info.textContent = this.isEnglishUI()
        ? `Page ${this.wordPage} / ${pages}, ${rows.length} entries`
        : `第 ${this.wordPage} / ${pages} 页，共 ${rows.length} 条`;
      this.bindWordRows();
    },

    bindWordRows() {
      const tbody = document.getElementById("lk-word-table-body");
      if (!tbody) return;
      for (const row of tbody.querySelectorAll("tr[data-word]")) {
        const word = row.dataset.word;
        row.querySelector('[data-word-action="status"]')?.addEventListener("change", async event => {
          this.state().updateWordStatus(word, event.target.value);
          await this.state().save();
          this.renderStatistics();
          this.plugin()?.scanAllReaders("native-settings-word-status", true);
        });
        row.querySelector('[data-word-action="translations"]')?.addEventListener("change", async event => {
          const translations = event.target.value.split(/[；;\n]+/).map(item => item.trim()).filter(Boolean);
          const state = this.state();
          const current = state.getWordDetails(word)?.translations || [];
          for (const value of current) if (!translations.includes(value)) state.removeTranslation(word, value);
          for (const value of translations) if (!current.includes(value)) state.addTranslation(word, value);
          await state.save();
        });
        row.querySelector('[data-word-action="delete"]')?.addEventListener("click", async () => {
          this.state().deleteWord(word);
          await this.state().save();
          this.renderWordList();
          this.renderStatistics();
          this.refreshWordSummary();
          this.plugin()?.scanAllReaders("native-settings-word-delete", true);
        });
      }
    },

    renderStatistics() {
      const words = Object.values(this.state()?.words || {});
      const statusCounts = Array(6).fill(0);
      const languageCounts = {};
      for (const record of words) {
        const status = Math.max(0, Math.min(5, Number(record.status || 0)));
        statusCounts[status]++;
        const language = record.language || "auto";
        languageCounts[language] = (languageCounts[language] || 0) + 1;
      }
      const statusNode = document.getElementById("lk-status-stats");
      if (statusNode) {
        const fragment = document.createDocumentFragment();
        statusCounts.forEach((count, index) => {
          const item = document.createElementNS(HTML_NS, "div");
          item.className = "lk-stat";
          const strong = document.createElementNS(HTML_NS, "strong");
          strong.textContent = String(count);
          const span = document.createElementNS(HTML_NS, "span");
          span.textContent = `${index} ${this.statusLabels()[index]}`;
          item.append(strong, span);
          fragment.appendChild(item);
        });
        statusNode.replaceChildren(fragment);
      }
      const languageNode = document.getElementById("lk-language-stats");
      if (languageNode) {
        const entries = Object.entries(languageCounts).sort((a, b) => b[1] - a[1]);
        const fragment = document.createDocumentFragment();
        if (!entries.length) {
          const empty = document.createElementNS(HTML_NS, "div");
          empty.className = "lk-note";
          empty.textContent = this.tr("词库为空。");
          fragment.appendChild(empty);
        } else {
          for (const [language, count] of entries) {
            const item = document.createElementNS(HTML_NS, "div");
            item.className = "lk-list-item";
            const span = document.createElementNS(HTML_NS, "span");
            span.textContent = language;
            const strong = document.createElementNS(HTML_NS, "strong");
            strong.textContent = String(count);
            item.append(span, strong);
            fragment.appendChild(item);
          }
        }
        languageNode.replaceChildren(fragment);
      }
    },

    testLocalTTS() {
      const win = Zotero.getMainWindow();
      const synth = win?.speechSynthesis;
      const Utterance = win?.SpeechSynthesisUtterance;
      if (!synth || !Utterance) throw new Error("当前系统没有可用的本地 TTS");
      const utterance = new Utterance("LingKuma language learning test");
      utterance.rate = Number(this.state().storage.localTTSRate || 1);
      utterance.pitch = Number(this.state().storage.localTTSPitch || 1);
      const preferred = String(this.state().storage.localTTSVoice || "").toLowerCase();
      if (preferred) utterance.voice = synth.getVoices().find(voice => voice.name.toLowerCase().includes(preferred)) || null;
      synth.cancel();
      synth.speak(utterance);
      this.status("正在播放本地 TTS 测试。", "saved");
    },

    async resetSettings() {
      if (!window.confirm("恢复 LingKuma 默认设置？词库、释义、例句和熟悉度不会被删除。")) return;
      this.state().storageClear();
      await this.state().save();
      this.loadControls();
      this.setTheme(this.state().storage.settingsPanelTheme || "light", false);
      this.plugin()?.scanAllReaders("native-settings-reset", true);
      this.status("已恢复默认设置，词库数据保持不变。", "saved");
    }
  };
})();

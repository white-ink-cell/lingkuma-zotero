var LingKumaPluginInstance = null;
var LingKumaBootstrapData = null;
var LingKumaBootstrapScope = this;

function lkBootLog(message) {
  try { Zotero.debug(`[LingKuma Bootstrap] ${message}`); } catch (_) {}
}

function lkBootError(error, prefix = "") {
  try { Zotero.logError(error instanceof Error ? error : new Error(prefix + String(error))); } catch (_) {}
  lkBootLog(prefix + (error?.stack || error?.message || String(error)));
}

function loadIntoBootstrap(rootURI, path) {
  Services.scriptloader.loadSubScript(rootURI + path, LingKumaBootstrapScope, "UTF-8");
}

async function startup({ id, version, rootURI }, reason) {
  LingKumaBootstrapData = { id, version, rootURI };
  try {
    await Zotero.uiReadyPromise;
    // Bootstrapped plugin globals do not always include window timers on every
    // Zotero/Mozilla build. Borrow them from the main window when necessary.
    const mainWindow = Zotero.getMainWindow?.();
    if (typeof LingKumaBootstrapScope.setTimeout !== "function" && mainWindow?.setTimeout) {
      LingKumaBootstrapScope.setTimeout = mainWindow.setTimeout.bind(mainWindow);
      LingKumaBootstrapScope.clearTimeout = mainWindow.clearTimeout.bind(mainWindow);
    }
    if (typeof LingKumaBootstrapScope.atob !== "function" && mainWindow?.atob) {
      LingKumaBootstrapScope.atob = mainWindow.atob.bind(mainWindow);
    }
    loadIntoBootstrap(rootURI, "adapter/state.js");
    loadIntoBootstrap(rootURI, "adapter/resources.js");
    loadIntoBootstrap(rootURI, "adapter/bridge.js");
    loadIntoBootstrap(rootURI, "adapter/main.js");
    LingKumaPluginInstance = new LingKumaZoteroPlugin({ id, version, rootURI });
    await LingKumaPluginInstance.start();
    try {
      await Zotero.PreferencePanes.register({
        pluginID: id,
        src: rootURI + "ui/prefs.xhtml",
        scripts: [rootURI + "ui/prefs.js"],
        stylesheets: [rootURI + "ui/prefs.css"]
      });
    } catch (error) {
      // A missing preference pane must never stop reader integration.
      lkBootError(error, "Preference pane registration failed: ");
    }
    lkBootLog(`startup complete ${version}; reason=${reason}`);
  } catch (error) {
    lkBootError(error, "startup failed: ");
    throw error;
  }
}

async function shutdown({ id, version, rootURI }, reason) {
  if (reason === APP_SHUTDOWN) return;
  try { await LingKumaPluginInstance?.stop(); }
  catch (error) { lkBootError(error, "shutdown failed: "); }
  LingKumaPluginInstance = null;
  LingKumaBootstrapData = null;
}

function install(data, reason) {
  lkBootLog(`installed ${data?.version || ""}; reason=${reason}`);
}

function uninstall(data, reason) {
  lkBootLog(`uninstalled ${data?.version || ""}; reason=${reason}`);
}

function onMainWindowLoad({ window }) {
  try { LingKumaPluginInstance?.onMainWindowLoad(window); }
  catch (error) { lkBootError(error, "onMainWindowLoad failed: "); }
}

function onMainWindowUnload({ window }) {
  try { LingKumaPluginInstance?.onMainWindowUnload(window); }
  catch (error) { lkBootError(error, "onMainWindowUnload failed: "); }
}

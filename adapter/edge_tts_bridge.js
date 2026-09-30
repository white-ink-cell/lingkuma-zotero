/* LingKuma Zotero: lifecycle wrapper around the vendored upstream Edge TTS engine. */
(() => {
  'use strict';
  if (!globalThis.__LINGKUMA_ZOTERO_READER__) return;
  if (globalThis.__LINGKUMA_ZOTERO_EDGE_TTS__?.installed) return;
  if (typeof globalThis.edgetts_speak !== 'function' || typeof globalThis.edgetts_connWebsocket !== 'function') return;

  const originalConnect = globalThis.edgetts_connWebsocket;
  let generation = 0;
  let activeSocket = null;
  let activeAudio = null;
  let activeURL = '';

  globalThis.edgetts_connWebsocket = function lkTrackedEdgeConnection(...args) {
    const ownerGeneration = generation;
    return Promise.resolve(originalConnect.apply(this, args)).then(socket => {
      if (ownerGeneration !== generation) {
        try { socket?.close?.(); } catch (_) {}
        return socket;
      }
      activeSocket = socket;
      return socket;
    });
  };

  function releaseMedia() {
    try { activeSocket?.close?.(); } catch (_) {}
    activeSocket = null;
    try { activeAudio?.pause?.(); } catch (_) {}
    activeAudio = null;
    if (activeURL) {
      try { URL.revokeObjectURL(activeURL); } catch (_) {}
      activeURL = '';
    }
  }

  function stop() {
    generation++;
    releaseMedia();
  }

  function xmlText(value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  function prosody(value) {
    if (value === undefined || value === null || value === '' || value === 'default') return 'default';
    if (typeof value === 'string' && /^[+-]?\d+(?:\.\d+)?%$/.test(value.trim())) return value.trim();
    const number = Number(value);
    if (!Number.isFinite(number) || number === 1) return 'default';
    const percent = Math.abs(number) <= 3 ? Math.round((number - 1) * 100) : Math.round(number);
    return `${percent >= 0 ? '+' : ''}${percent}%`;
  }

  async function play(options = {}) {
    const text = String(options.text || '').trim();
    if (!text) throw new Error('Edge TTS requires non-empty text');
    stop();
    const ownGeneration = generation;
    const timeoutMs = 20_000;
    let timeout;
    try {
      const synthesis = Promise.resolve(globalThis.edgetts_speak({
        text: xmlText(text),
        voice: String(options.voice || 'en-US-AriaNeural'),
        language: String(options.language || 'en-US'),
        rate: prosody(options.rate),
        volume: prosody(options.volume),
        pitch: prosody(options.pitch),
      }));
      const result = await Promise.race([
        synthesis,
        new Promise((_, reject) => {
          timeout = setTimeout(() => reject(new Error('Edge TTS timed out')), timeoutMs);
        }),
      ]);
      if (ownGeneration !== generation) return { success: false, cancelled: true };
      const blob = globalThis.edgetts_mp3Blob(result);
      if (!blob || Number(blob.size || 0) < 1) throw new Error('Edge TTS returned no audio');
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      activeURL = url;
      activeAudio = audio;
      audio.addEventListener?.('ended', () => {
        if (ownGeneration === generation) releaseMedia();
      }, { once: true });
      await audio.play();
      if (ownGeneration !== generation) return { success: false, cancelled: true };
      return { success: true };
    } catch (error) {
      if (ownGeneration !== generation) return { success: false, cancelled: true };
      releaseMedia();
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }

  function cleanup() {
    stop();
    if (globalThis.edgetts_connWebsocket === lkTrackedConnect) {
      globalThis.edgetts_connWebsocket = originalConnect;
    }
    try { delete globalThis.__LINGKUMA_ZOTERO_EDGE_TTS__; } catch (_) {}
  }

  const lkTrackedConnect = globalThis.edgetts_connWebsocket;
  globalThis.__LINGKUMA_ZOTERO_EDGE_TTS__ = Object.freeze({
    installed: true,
    version: '1.0.0',
    play,
    stop,
    cleanup,
  });
})();

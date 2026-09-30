/* LingKuma sentence-boundary compatibility adapter
 *
 * Two upstream edge cases need host-side compatibility handling without
 * modifying the frozen LingKuma sources:
 *   1. PDF.js/converted layouts can split one sentence into many absolutely
 *      positioned fragments.
 *   2. The upstream normal-HTML sentence-start marker list treats closing
 *      parentheses (and some clause punctuation) as sentence boundaries.
 *      That can shorten a sentence after parentheticals such as "(AI) is...".
 *
 * This module reconstructs mapped text around the clicked word and uses real
 * terminal punctuation plus Intl.Segmenter fallback. Upstream remains the final
 * fallback when a safe mapped sentence cannot be produced.
 */
(() => {
  'use strict';

  const PATCH_VERSION = '1.3.0';
  const PARAGRAPH_SEPARATOR = '\u2029';
  const MAX_SENTENCE_LENGTH = 1600;
  const originalGetSentenceForWord = globalThis.getSentenceForWord;

  if (typeof originalGetSentenceForWord !== 'function') return;
  if (globalThis.__LINGKUMA_POSITIONED_SENTENCE_PATCH__?.installed) return;

  const readerTextSettings = {
    epubSoftHyphenCleanup: true,
    epubHyphenRepair: true
  };
  const applyReaderTextSettings = values => {
    if (!values || typeof values !== 'object') return;
    for (const key of Object.keys(readerTextSettings)) {
      if (typeof values[key] === 'boolean') readerTextSettings[key] = values[key];
    }
  };
  try {
    globalThis.chrome?.storage?.local?.get?.(Object.keys(readerTextSettings), applyReaderTextSettings);
    globalThis.chrome?.storage?.onChanged?.addListener?.((changes, areaName) => {
      if (areaName && areaName !== 'local') return;
      const values = {};
      for (const key of Object.keys(readerTextSettings)) {
        if (changes?.[key] && typeof changes[key].newValue === 'boolean') values[key] = changes[key].newValue;
      }
      applyReaderTextSettings(values);
    });
  } catch (_) {}

  const safeElement = node => {
    if (!node) return null;
    if (node.nodeType === Node.ELEMENT_NODE) return node;
    return node.parentElement || null;
  };

  const closest = (element, selector) => {
    try { return element?.closest?.(selector) || null; }
    catch (_) { return null; }
  };

  const isIgnoredNode = node => {
    const element = safeElement(node);
    if (!element) return true;
    if (closest(element, '#lingkuma-tooltip-host, lingkuma-tooltip-root, #lingkuma-explosion-host, #lingkuma-word-highlight-floating-root')) return true;
    const tag = String(element.tagName || '').toLowerCase();
    if (['script', 'style', 'noscript', 'textarea', 'input', 'button', 'select', 'option'].includes(tag)) return true;
    try {
      if (element.closest('[aria-hidden="true"]')) return true;
      const style = getComputedStyle(element);
      if (style.display === 'none' || style.visibility === 'hidden') return true;
    } catch (_) {}
    return false;
  };

  const getNodeRect = node => {
    try {
      const range = document.createRange();
      range.selectNodeContents(node);
      const rects = Array.from(range.getClientRects?.() || []);
      if (rects.length) return rects.reduce((best, rect) => (rect.width * rect.height > best.width * best.height ? rect : best), rects[0]);
    } catch (_) {}
    try { return safeElement(node)?.getBoundingClientRect?.() || null; }
    catch (_) { return null; }
  };

  const positionedChildrenCount = parent => {
    if (!parent?.children) return 0;
    let count = 0;
    for (const child of Array.from(parent.children)) {
      const text = String(child.textContent || '').trim();
      if (!text) continue;
      try {
        const position = getComputedStyle(child).position;
        if (position === 'absolute' || position === 'fixed') count++;
      } catch (_) {}
      if (count >= 4) break;
    }
    return count;
  };

  const isStructuralBreak = (previousRect, currentRect) => {
    if (!previousRect || !currentRect) return false;
    const previousHeight = Math.max(1, Number(previousRect.height || 0));
    const currentHeight = Math.max(1, Number(currentRect.height || 0));
    const lineHeight = Math.max(6, previousHeight, currentHeight);
    const previousCenter = previousRect.top + previousHeight / 2;
    const currentCenter = currentRect.top + currentHeight / 2;
    const verticalGap = currentRect.top - previousRect.bottom;

    // A visibly blank line/large vertical gap is a paragraph boundary. This is
    // especially important on title pages where the article metadata and the
    // author footnote are separate blocks but adjacent in PDF.js DOM order.
    if (Number.isFinite(verticalGap) && verticalGap > lineHeight * 0.72) return true;

    // PDF.js can move to a new column or detached block by jumping upward in
    // visual coordinates while preserving DOM order.
    if (Number.isFinite(previousRect.top) && Number.isFinite(currentRect.top)
        && currentRect.top < previousRect.top - lineHeight * 0.65) return true;

    // A large right-to-left jump on the same visual line generally indicates a
    // column/block transition rather than continuation of the same sentence.
    const sameLine = Math.abs(previousCenter - currentCenter) <= lineHeight * 0.45;
    if (sameLine && Number.isFinite(previousRect.left) && Number.isFinite(currentRect.left)
        && currentRect.left < previousRect.left - Math.max(80, lineHeight * 5)) return true;

    return false;
  };

  const findPositionedTextRoot = detail => {
    const startElement = safeElement(detail?.range?.startContainer);
    if (!startElement) return null;

    const textLayer = closest(startElement, '.textLayer');
    if (textLayer) return { root: textLayer, kind: 'pdfjs' };

    // calibre's PDF conversion and some web readers generate a container with
    // many absolutely positioned text fragments without using .textLayer.
    let cursor = startElement;
    for (let depth = 0; cursor && cursor !== document.body && depth < 7; depth++, cursor = cursor.parentElement) {
      const parent = cursor.parentElement;
      if (parent && positionedChildrenCount(parent) >= 4) return { root: parent, kind: 'positioned' };
    }
    return null;
  };

  const NORMAL_SENTENCE_TAGS = new Set([
    'p', 'li', 'dd', 'dt', 'blockquote', 'figcaption', 'td', 'th',
    'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'pre'
  ]);

  const isInlineLike = element => {
    try {
      const display = getComputedStyle(element).display;
      return display === 'inline' || display === 'inline-block' || display === 'contents';
    } catch (_) {
      return false;
    }
  };

  const textLength = element => {
    try { return String(element?.innerText || element?.textContent || '').trim().length; }
    catch (_) { return 0; }
  };

  const findNormalTextRoots = detail => {
    const startElement = safeElement(detail?.range?.startContainer);
    if (!startElement) return [];
    if (findPositionedTextRoot(detail)) return [];

    const roots = [];
    let cursor = startElement;
    for (let depth = 0; cursor && cursor !== document.body && cursor !== document.documentElement && depth < 8; depth++, cursor = cursor.parentElement) {
      if (isIgnoredNode(cursor)) continue;
      let position = '';
      try { position = getComputedStyle(cursor).position; } catch (_) {}
      if (position === 'absolute' || position === 'fixed') break;
      if (isInlineLike(cursor) || textLength(cursor) < 10) continue;

      roots.push(cursor);
      const tag = String(cursor.tagName || '').toLowerCase();
      // Explicit paragraph/list/table/header elements are already semantic
      // sentence containers. Generic DIV wrappers are allowed to expand one or
      // two levels so inline/converted EPUB fragments cannot clip the left side.
      if (NORMAL_SENTENCE_TAGS.has(tag)) break;
      if (roots.length >= 3) break;
    }
    return roots;
  };

  const collectEntries = root => {
    const entries = [];
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        if (isIgnoredNode(node)) return NodeFilter.FILTER_REJECT;
        return String(node.textContent || '').length ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
      }
    });
    let node;
    while ((node = walker.nextNode())) entries.push({ node, rect: getNodeRect(node) });
    return entries;
  };

  const firstVisibleCharacter = text => {
    const match = String(text || '').match(/[^\s\u00a0\u00ad]/);
    return match ? match[0] : '';
  };

  const shouldJoinHyphenatedLine = (chars, nextText, previousRect, currentRect) => {
    if (!chars.length || chars[chars.length - 1] !== '-') return false;
    const next = firstVisibleCharacter(nextText);
    if (!/[a-z]/.test(next)) return false;
    if (!previousRect || !currentRect) return true;
    const previousCenter = previousRect.top + previousRect.height / 2;
    const currentCenter = currentRect.top + currentRect.height / 2;
    const tolerance = Math.max(2, Math.min(previousRect.height || 0, currentRect.height || 0) * 0.55);
    return Math.abs(previousCenter - currentCenter) > tolerance;
  };

  const needsInsertedSpace = (chars, nextText, previousRect, currentRect) => {
    if (!chars.length) return false;
    const previous = chars[chars.length - 1];
    const next = firstVisibleCharacter(nextText);
    if (!next || /\s/.test(previous)) return false;
    if (/^[,.;:!?%\)\]\}»”’]/.test(next)) return false;
    if (/[\(\[\{«“‘\/]$/.test(previous)) return false;

    if (previousRect && currentRect) {
      const previousCenter = previousRect.top + previousRect.height / 2;
      const currentCenter = currentRect.top + currentRect.height / 2;
      const tolerance = Math.max(2, Math.min(previousRect.height || 0, currentRect.height || 0) * 0.55);
      const sameLine = Math.abs(previousCenter - currentCenter) <= tolerance;
      if (sameLine) {
        const gap = currentRect.left - previousRect.right;
        const glyph = Math.max(3, Math.min(previousRect.height || 0, currentRect.height || 0));
        // Fragments touching or overlapping are usually two parts of one word.
        if (Number.isFinite(gap) && gap <= glyph * 0.10) return false;
      }
    }
    return true;
  };

  const buildPositionedText = (entries, targetNode, targetOriginalOffset, options = {}) => {
    const positioned = options.positioned !== false;
    const chars = [];
    const map = [];
    let clickedOffset = -1;
    let previousRect = null;

    let paragraphBreaks = 0;
    const appendSpace = () => {
      if (!chars.length || chars[chars.length - 1] === ' ' || chars[chars.length - 1] === PARAGRAPH_SEPARATOR) return;
      chars.push(' ');
      map.push(null);
    };
    const appendParagraphSeparator = () => {
      while (chars.length && chars[chars.length - 1] === ' ') {
        chars.pop();
        map.pop();
      }
      if (!chars.length || chars[chars.length - 1] === PARAGRAPH_SEPARATOR) return;
      chars.push(PARAGRAPH_SEPARATOR);
      map.push(null);
      paragraphBreaks++;
    };

    entries.forEach((entry, entryIndex) => {
      const node = entry.node;
      const raw = String(node.textContent || '');

      if (entryIndex > 0) {
        if (positioned && isStructuralBreak(previousRect, entry.rect)) {
          appendParagraphSeparator();
        } else if (options.repairHyphens !== false && shouldJoinHyphenatedLine(chars, raw, previousRect, entry.rect)) {
          chars.pop();
          map.pop();
          if (clickedOffset > chars.length) clickedOffset = chars.length;
        } else if (needsInsertedSpace(chars, raw, previousRect, entry.rect)) {
          appendSpace();
        }
      }

      let index = 0;
      while (index < raw.length) {
        if (node === targetNode && clickedOffset < 0 && index >= targetOriginalOffset) clickedOffset = chars.length;

        const rest = raw.slice(index);
        const citation = rest.match(/^\[\d+(?:\s*[-–,]\s*\d+)*\]/);
        if (citation) {
          index += citation[0].length;
          continue;
        }

        const character = raw[index];
        if (character === '\u00ad' && options.cleanSoftHyphens !== false) {
          index++;
          continue;
        }
        if (/[\s\u00a0]/.test(character)) {
          const start = index;
          while (index < raw.length && /[\s\u00a0]/.test(raw[index])) index++;
          if (!chars.length || chars[chars.length - 1] !== ' ') {
            chars.push(' ');
            map.push({ node, start, end: index });
          }
          continue;
        }

        chars.push(character);
        map.push({ node, start: index, end: index + 1 });
        index++;
      }
      if (node === targetNode && clickedOffset < 0 && targetOriginalOffset >= raw.length) clickedOffset = chars.length;
      previousRect = entry.rect;
    });

    // Trim without losing the relationship between text and map.
    while (chars.length && chars[0] === ' ') {
      chars.shift();
      map.shift();
      if (clickedOffset >= 0) clickedOffset--;
    }
    while (chars.length && chars[chars.length - 1] === ' ') {
      chars.pop();
      map.pop();
    }

    return { text: chars.join(''), map, clickedOffset, paragraphBreaks };
  };

  const hasTerminalPunctuation = text => /[.!?。！？][\s\)\]\}»”’"']*$/.test(String(text || ''));

  const refineSegmentBounds = (text, segments, index, clickedOffset) => {
    let first = index;
    let last = index;
    let start = segments[index].index;
    let end = start + segments[index].segment.length;

    const endsStructuredNamePrefix = value => {
      const trimmed = String(value || '').trim();
      // A title followed by zero or more initials is structurally clear even
      // though "Dr. A." superficially resembles a dotted acronym.
      if (/^(?:Dr|Mr|Mrs|Ms|Prof|Sr|Jr)\.(?:\s+[A-Z]\.)*$/i.test(trimmed)) return true;
      // Protect mixed-case dotted acronyms such as Ph.D. as well as U.S.
      if (/^(?:[A-Za-z]{1,3}\.){2,}$/.test(trimmed)) return false;
      return /^[A-Z]\.$/.test(trimmed);
    };

    // Merge only structurally clear false splits: a lower-case continuation,
    // or a title/single-initial chain such as "Dr. A. Smith". Semantic cases
    // such as "U.S. Government" remain delegated to Intl.Segmenter.
    while (first > 0) {
      const candidate = text.slice(start, end).trimStart();
      const previousSegment = segments[first - 1].segment.trim();
      const clearContinuation = /^[a-z]/.test(candidate)
        || (/^[A-Z]/.test(candidate) && endsStructuredNamePrefix(previousSegment));
      if (!clearContinuation || end - segments[first - 1].index > MAX_SENTENCE_LENGTH) break;
      first--;
      start = segments[first].index;
    }

    // When the clicked token is the title or initial itself, extend forward to
    // the capitalized name/body segment rather than returning "Dr."/"Dr. A.".
    while (last + 1 < segments.length && endsStructuredNamePrefix(text.slice(start, end))) {
      const nextCandidate = segments[last + 1].segment.trimStart();
      const nextEnd = segments[last + 1].index + segments[last + 1].segment.length;
      if (!/^[A-Z]/.test(nextCandidate) || nextEnd - start > MAX_SENTENCE_LENGTH) break;
      last++;
      end = nextEnd;
    }

    // PDF line/page fragments sometimes make Segmenter return a clause with no
    // final punctuation. Continue until a true sentence ending is found.
    while (last + 1 < segments.length && !hasTerminalPunctuation(text.slice(start, end))) {
      const nextEnd = segments[last + 1].index + segments[last + 1].segment.length;
      if (nextEnd - start > MAX_SENTENCE_LENGTH) break;
      last++;
      end = nextEnd;
    }

    // Ensure the selected word remains in the refined range.
    if (clickedOffset < start || clickedOffset > end) return null;
    return { start, end };
  };

  const isLikelyAbbreviationPeriod = (text, index) => {
    const left = text.slice(Math.max(0, index - 48), index + 1);
    const right = text.slice(index + 1);

    // Decimal, version, section and date-like numeric runs.
    const previous = text[index - 1] || '';
    const next = text[index + 1] || '';
    if (/\d/.test(previous) && /\d/.test(next)) return true;

    // Common titles, scholarly abbreviations and Latin abbreviations.
    if (/(?:\b(?:e\.g|i\.e|et al|fig|figs|eq|eqs|no|nos|dr|mr|mrs|ms|prof|sr|jr|st|mt|gen|sen|rep|gov|vs|inc|ltd|co|corp|dept|approx|est|misc|resp|cf|al|p|pp|sec|secs|ch|chap|ref|refs|vol|rev|ed|eds|jan|feb|mar|apr|jun|jul|aug|sep|sept|oct|nov|dec)\.)$/i.test(left)) return true;

    // Initials and acronym chains: "A. Smith", "U.S. market", "Ph.D. student".
    // Intl.Segmenter owns semantically ambiguous acronym + capitalized-word
    // cases. The hard fallback is conservative: lower-case continuations stay
    // attached, while an upper-case token may begin a new sentence.
    if (/(?:\b(?:[A-Za-z]{1,3}\.){2,})$/.test(left)) return /^\s*[a-z]/.test(right);
    if (/(?:\b[A-Z]\.)$/.test(left) && /^\s*[A-Z]/.test(right)) return true;

    return false;
  };

  const isSentenceStartCharacter = character => {
    if (!character) return false;
    // Latin/Greek/Cyrillic upper-case letters, CJK characters, or an opening
    // quote followed later by one of those are all plausible sentence starts.
    return /[A-Z0-9\u00c0-\u00de\u0391-\u03ab\u0400-\u042f\u4e00-\u9fff\u3040-\u30ff\uac00-\ud7af]/.test(character);
  };

  const scanAfterTerminal = (text, punctuationIndex) => {
    let cursor = punctuationIndex + 1;
    const length = text.length;

    // Closing quotation marks or brackets belong to the sentence that ends.
    while (cursor < length && /[\)\]\}»”’"']/.test(text[cursor])) cursor++;
    const sentenceEnd = cursor;

    // PDF text layers often flatten a superscript footnote marker into normal
    // text, producing strings such as "alpha.2 In this paper".  Treat a short
    // number/symbol sequence between terminal punctuation and the next capital
    // letter as a footnote marker, not as part of the following sentence.
    const beforeWhitespace = cursor;
    while (cursor < length && /\s/.test(text[cursor])) cursor++;
    const markerStart = cursor;
    if (cursor < length) {
      const rest = text.slice(cursor);
      const marker = rest.match(/^(?:\(?\d{1,3}\)?|[⁰¹²³⁴⁵⁶⁷⁸⁹]{1,3}|[*∗⁎✱✲※†‡§¶#]{1,3})/);
      if (marker) cursor += marker[0].length;
    }
    const hadMarker = cursor > markerStart;
    while (cursor < length && /\s/.test(text[cursor])) cursor++;
    while (cursor < length && /[“‘"'\(\[\{]/.test(text[cursor])) cursor++;

    if (cursor >= length) {
      return { isBoundary: true, nextStart: length, hadMarker, sentenceEnd };
    }

    // A marker is only accepted when the following token looks like a new
    // sentence. This avoids treating references such as "Fig. 2 shows" as a
    // boundary. Without a marker, require whitespace (or end of text) after the
    // punctuation, except for CJK punctuation where spacing is optional.
    const next = text[cursor];
    const cjkTerminal = /[。！？]/.test(text[punctuationIndex]);
    const hadWhitespace = beforeWhitespace !== cursor || /\s/.test(text[punctuationIndex + 1] || '');
    if (hadMarker && isSentenceStartCharacter(next)) {
      return { isBoundary: true, nextStart: cursor, hadMarker: true, sentenceEnd };
    }
    if ((cjkTerminal || hadWhitespace) && isSentenceStartCharacter(next)) {
      return { isBoundary: true, nextStart: cursor, hadMarker: false, sentenceEnd };
    }
    return { isBoundary: false, nextStart: punctuationIndex + 1, hadMarker: false, sentenceEnd: punctuationIndex + 1 };
  };

  const hardSentenceBounds = (text, clickedOffset) => {
    const boundaries = [];
    for (let index = 0; index < text.length; index++) {
      const character = text[index];
      if (character === PARAGRAPH_SEPARATOR) {
        boundaries.push({ end: index, nextStart: index + 1, hadMarker: false, kind: 'paragraph' });
        continue;
      }
      if (!/[.!?。！？]/.test(character)) continue;
      if (character === '.') {
        const previous = text[index - 1] || '';
        const next = text[index + 1] || '';
        if (/\d/.test(previous) && /\d/.test(next)) continue; // decimal/section number
        if (isLikelyAbbreviationPeriod(text, index)) continue;
      }
      const scanned = scanAfterTerminal(text, index);
      if (scanned.isBoundary) {
        boundaries.push({ end: scanned.sentenceEnd || index + 1, nextStart: scanned.nextStart, hadMarker: scanned.hadMarker, kind: scanned.hadMarker ? 'footnote-marker' : 'punctuation' });
      }
    }

    if (!boundaries.length) return null;
    let start = 0;
    let startBoundary = null;
    for (const boundary of boundaries) {
      if (boundary.nextStart <= clickedOffset) {
        start = boundary.nextStart;
        startBoundary = boundary;
      } else break;
    }
    let end = text.length;
    let matched = null;
    for (const boundary of boundaries) {
      if (boundary.end > clickedOffset) {
        end = boundary.end;
        matched = boundary;
        break;
      }
    }
    if (end <= start || clickedOffset < start || clickedOffset > end) return null;
    const structural = [startBoundary, matched].some(boundary => boundary?.kind === 'paragraph' || boundary?.hadMarker);
    const method = matched?.kind === 'paragraph' || startBoundary?.kind === 'paragraph'
      ? 'hard-paragraph'
      : ((matched?.hadMarker || startBoundary?.hadMarker) ? 'hard-footnote' : 'hard');
    return { start, end, method, structural };
  };

  const fallbackSentenceBounds = (text, clickedOffset) => {
    const min = Math.max(0, clickedOffset - MAX_SENTENCE_LENGTH);
    const max = Math.min(text.length, clickedOffset + MAX_SENTENCE_LENGTH);
    let start = min;
    let end = max;

    for (let index = clickedOffset - 1; index >= min; index--) {
      const character = text[index];
      if (character === PARAGRAPH_SEPARATOR) { start = index + 1; break; }
      if (!/[.!?。！？]/.test(character)) continue;
      if (character === '.' && isLikelyAbbreviationPeriod(text, index)) continue;
      start = index + 1;
      while (start < text.length && /[\s\)\]\}»”’"']/.test(text[start])) start++;
      break;
    }

    for (let index = clickedOffset; index < max; index++) {
      const character = text[index];
      if (character === PARAGRAPH_SEPARATOR) { end = index; break; }
      if (!/[.!?。！？]/.test(character)) continue;
      if (character === '.' && isLikelyAbbreviationPeriod(text, index)) continue;
      end = index + 1;
      while (end < text.length && /[\)\]\}»”’"']/.test(text[end])) end++;
      break;
    }
    return { start, end };
  };

  const findSentenceBounds = (text, clickedOffset) => {
    if (!text || clickedOffset < 0) return null;
    const offset = Math.max(0, Math.min(clickedOffset, Math.max(0, text.length - 1)));

    // Keep explicit PDF paragraph/footnote boundaries authoritative, then use
    // the platform sentence segmenter for linguistic ambiguity. The hard scan
    // remains a conservative fallback when Intl.Segmenter is unavailable.
    const hard = hardSentenceBounds(text, offset);
    if (hard?.structural) return hard;

    try {
      if (typeof Intl?.Segmenter === 'function') {
        const segments = Array.from(new Intl.Segmenter(undefined, { granularity: 'sentence' }).segment(text));
        let index = segments.findIndex(segment => offset >= segment.index && offset < segment.index + segment.segment.length);
        if (index < 0 && segments.length) index = segments.length - 1;
        if (index >= 0) {
          const refined = refineSegmentBounds(text, segments, index, offset);
          if (refined) return { ...refined, method: 'segmenter' };
        }
      }
    } catch (_) {}
    if (hard) return hard;
    return { ...fallbackSentenceBounds(text, offset), method: 'fallback' };
  };

  const trimBounds = (text, start, end) => {
    while (start < end && /\s/.test(text[start])) start++;
    while (end > start && /\s/.test(text[end - 1])) end--;
    return { start, end };
  };

  const createMappedRange = (map, start, end) => {
    let first = start;
    let last = end - 1;
    while (first < end && !map[first]) first++;
    while (last >= first && !map[last]) last--;
    if (first > last || !map[first]?.node || !map[last]?.node) return null;
    try {
      const range = document.createRange();
      range.setStart(map[first].node, map[first].start);
      range.setEnd(map[last].node, map[last].end);
      return range;
    } catch (_) {
      return null;
    }
  };

  const normalizeSentenceText = text => String(text || '')
    .replace(new RegExp(PARAGRAPH_SEPARATOR, 'g'), ' ')
    .replace(/\s+/g, ' ')
    .replace(/^[*∗⁎✱✲※†‡§¶#⁰¹²³⁴⁵⁶⁷⁸⁹\d]+\s*/, '')
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .trim();

  const sentenceFromBuilt = (built, kind) => {
    if (!built?.text || built.clickedOffset < 0) return null;
    const rawBounds = findSentenceBounds(built.text, built.clickedOffset);
    if (!rawBounds) return null;
    const bounds = trimBounds(built.text, rawBounds.start, rawBounds.end);
    if (bounds.end <= bounds.start) return null;

    const boundedText = built.text.slice(bounds.start, bounds.end);
    let sentence = normalizeSentenceText(boundedText);
    if (!sentence) return null;
    if (sentence.length > MAX_SENTENCE_LENGTH) sentence = sentence.slice(0, MAX_SENTENCE_LENGTH).trim();

    const clickedInBounds = Math.max(0, Math.min(built.clickedOffset - bounds.start, boundedText.length));
    const cursorMarker = '\uE000';
    const normalizedThroughClick = normalizeSentenceText(`${boundedText.slice(0, clickedInBounds)}${cursorMarker}`);
    const markerOffset = normalizedThroughClick.indexOf(cursorMarker);
    const clickedSurfaceStart = markerOffset >= 0 ? markerOffset : 0;

    const mappedEnd = Math.min(bounds.end, bounds.start + MAX_SENTENCE_LENGTH);
    const range = createMappedRange(built.map, bounds.start, mappedEnd);
    return { sentence, range, bounds, rawBounds, kind, clickedSurfaceStart };
  };

  const getNormalSentence = detail => {
    const targetNode = detail?.range?.startContainer?.nodeType === Node.TEXT_NODE
      ? detail.range.startContainer
      : null;
    if (!targetNode) return null;

    const roots = findNormalTextRoots(detail);
    if (!roots.length) return null;
    let best = null;

    for (let index = 0; index < roots.length; index++) {
      const root = roots[index];
      if (!root.contains(targetNode)) continue;
      // Avoid walking a whole chapter/document through a generic wrapper.
      const length = textLength(root);
      if (length > 12000 && index > 0) break;

      const entries = collectEntries(root);
      if (!entries.length) continue;
      const built = buildPositionedText(entries, targetNode, Number(detail.range.startOffset || 0), {
        positioned: false,
        repairHyphens: readerTextSettings.epubHyphenRepair,
        cleanSoftHyphens: readerTextSettings.epubSoftHyphenCleanup
      });
      const result = sentenceFromBuilt(built, 'html');
      if (!result?.sentence) continue;
      best = result;

      const tag = String(root.tagName || '').toLowerCase();
      const semanticRoot = NORMAL_SENTENCE_TAGS.has(tag);
      const rootStart = built.text.slice(0, Math.min(built.text.length, 80)).trimStart();
      // Only call the left edge suspicious when it visibly begins mid-clause.
      // Expanding every DIV whose sentence starts at offset 0 can accidentally
      // absorb a preceding heading/paragraph from a generic chapter wrapper.
      const clippedLeft = result.bounds.start === 0 && built.clickedOffset > 12
        && /^[a-z,;:]/.test(rootStart);
      const clippedRight = result.bounds.end >= built.text.length && !hasTerminalPunctuation(result.sentence);

      // A semantic paragraph is authoritative. For generic converted-EPUB DIV
      // wrappers, retry the next block ancestor only when the extracted range
      // touches an edge, which catches line/span wrappers without scanning a
      // whole chapter unnecessarily.
      if (semanticRoot || (!clippedLeft && !clippedRight) || index === roots.length - 1) break;
    }

    if (!best) return null;
    globalThis.__LINGKUMA_POSITIONED_SENTENCE_PATCH__.last = {
      kind: 'html',
      sentenceLength: best.sentence.length,
      hasRange: !!best.range,
      method: best.rawBounds.method || 'unknown',
      preview: best.sentence.slice(0, 180)
    };
    globalThis.__LINGKUMA_POSITIONED_SENTENCE_PATCH__.lastRange = best.range || null;
    globalThis.__LINGKUMA_POSITIONED_SENTENCE_PATCH__.lastSentence = best.sentence;
    return { sentence: best.sentence, range: best.range, clickedSurfaceStart: best.clickedSurfaceStart };
  };

  const getPositionedSentence = detail => {
    const context = findPositionedTextRoot(detail);
    if (!context) return null;

    const targetNode = detail.range.startContainer?.nodeType === Node.TEXT_NODE
      ? detail.range.startContainer
      : null;
    if (!targetNode || !context.root.contains(targetNode)) return null;

    const entries = collectEntries(context.root);
    if (entries.length < 2) return null;
    const pdfTextLayer = context.kind === 'pdfjs';
    const built = buildPositionedText(entries, targetNode, Number(detail.range.startOffset || 0), {
      repairHyphens: pdfTextLayer || readerTextSettings.epubHyphenRepair,
      cleanSoftHyphens: pdfTextLayer || readerTextSettings.epubSoftHyphenCleanup
    });
    if (!built.text || built.clickedOffset < 0) return null;

    const result = sentenceFromBuilt(built, context.kind);
    if (!result) return null;
    globalThis.__LINGKUMA_POSITIONED_SENTENCE_PATCH__.last = {
      kind: context.kind,
      sentenceLength: result.sentence.length,
      sourceLength: built.text.length,
      hasRange: !!result.range,
      method: result.rawBounds.method || 'unknown',
      paragraphBreaks: built.paragraphBreaks || 0,
      preview: result.sentence.slice(0, 180)
    };
    globalThis.__LINGKUMA_POSITIONED_SENTENCE_PATCH__.lastRange = result.range || null;
    globalThis.__LINGKUMA_POSITIONED_SENTENCE_PATCH__.lastSentence = result.sentence;
    return { sentence: result.sentence, range: result.range, clickedSurfaceStart: result.clickedSurfaceStart };
  };

  const patchedGetSentenceForWord = detail => {
    try {
      const positioned = getPositionedSentence(detail);
      if (positioned?.sentence) return positioned;
    } catch (error) {
      try { console.warn('[LingKumaSentencePatch] positioned extraction failed; trying HTML/upstream fallback', error); } catch (_) {}
    }

    try {
      const normal = getNormalSentence(detail);
      if (normal?.sentence) return normal;
    } catch (error) {
      try { console.warn('[LingKumaSentencePatch] HTML extraction failed; using upstream fallback', error); } catch (_) {}
    }
    return originalGetSentenceForWord(detail);
  };

  globalThis.__LINGKUMA_POSITIONED_SENTENCE_PATCH__ = {
    installed: true,
    version: PATCH_VERSION,
    last: null,
    lastRange: null,
    lastSentence: '',
    readerTextSettings,
    original: originalGetSentenceForWord,
    test: { findSentenceBounds, scanAfterTerminal, isStructuralBreak, isLikelyAbbreviationPeriod, normalizeSentenceText }
  };
  globalThis.getSentenceForWord = patchedGetSentenceForWord;
  try { getSentenceForWord = patchedGetSentenceForWord; } catch (_) {}
})();

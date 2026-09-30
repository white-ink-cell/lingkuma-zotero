# G-004 C2 — Zotero settings parity

Status: implementation and automated verification complete; real Zotero GUI validation remains manual pending.

## Result

The Zotero port retains one native LingKuma preference pane and one state store. The control-level matrix is `G-004-ZOTERO-SETTINGS-COVERAGE.csv`; it is generated deterministically from the native bindings plus an explicit unsupported/deferred inventory and is guarded by `tests/settings_coverage_matrix.test.mjs`.

Matrix totals:

- `EXPOSED_AND_WORKING`: 162
- `BROWSER_ONLY_NA`: 23
- `HOST_INAPPLICABLE_NA`: 4
- `INTENTIONALLY_DISABLED`: 33
- `OPTIONAL_SHALLOW_DEFERRED`: 13
- total rows: 235

Clipboard Subtitles is explicitly `HOST_INAPPLICABLE_NA`. No setting no no-op bridge and no clipboard listener is present.

## Applicable gaps closed

- Restored upstream-compatible API profile selection add copy delete polling temperature exclusion and bounded custom request-body fields through the existing Zotero state/request adapter.
- Preserved legacy single-endpoint data by migrating it in memory to the default editable profile.
- Restored the upstream `autoAddSentencesLimit` editable maximum of 999 and `wordExplosionMaxWidth` range of 20–200000 with step 10.
- Added plain-list import source language including validated custom ISO 639-1 codes and statuses 0–5; imported records now carry language and status history.
- Restored the exact frozen LingKuma bundled known-sentence animation closure: balloon HTML/JS six TGS assets and `tgs-player.min.js`. The upstream boundary now verifies 62 files against the immutable 1.1.1 ZIP.
- Unsupported Edge GPT MiniMaxi and Supertone browser-provider messages are rejected explicitly rather than silently played as local system speech.
- Restored the two reader-time EPUB text-repair controls from the proven Zotero port: soft-hyphen cleanup and line-break hyphen repair now drive the existing sentence adapter without modifying attachment files. PDF.js text-layer repair remains mandatory and unaffected.
- Restored the four upstream color-opacity controls for POS backgrounds and Word Explosion highlight/underline colors; the native controls update the alpha channel consumed by the unchanged upstream renderers.
- Exposed `tooltipBackground.defaultType` only for the fully packaged 33-pattern SVG set. Random image, video, and specific-asset modes are explicitly disabled because their resource/picker closure is absent; `specificBgPath` is recorded separately instead of silently disappearing.

## Deliberate boundaries

- Browser website lists YouTube side panel Orion account/subscription and hosted-cloud controls stay absent.
- Highlight forced-day/forced-night website lists are explicitly browser-only; the upstream-only `audioUrlNotebook` field is intentionally disabled because frozen 1.1.1 has no runtime consumer.
- Clipboard and browser EPUB conversion tools stay host-inapplicable; only the already-applicable reader-time EPUB cleanup controls are exposed.
- Remote browser TTS providers self-hosted cloud and custom uploaded background/animation asset persistence stay intentionally disabled; their stored values are not presented as working features.
- Thanox and Waifu remain optional-shallow deferred.
- Dictionary actions are identified as `PORT_EXTENSION` rows and continue to use the existing lookup service; they are not represented as upstream browser settings.

## Default reconciliation

Existing explicit user values remain authoritative. The component does not bulk-reset older profiles. Where the concrete desktop reader consumer requires a host-specific effective default—such as default-off Bionic Reading Reading Ruler and POS Highlight or Gecko-compatible glass behavior—the matrix points to the actual runtime consumer rather than treating the browser popup table as sole execution proof.

The matrix now records concrete frozen-upstream defaults/ranges and labels known Zotero default adaptations rather than claiming they are upstream defaults. Its regression gate contains an independent frozen-upstream key inventory; it is not derived from the current Zotero page, so an omitted applicable or unsupported key fails even if the generated row count remains high.

## Verification scope

Automated evidence covers state migration profile polling/request bodies profile CRUD import semantics numeric bounds one-pane registration unsupported-control absence resource closure immutable-source hashes package layout and unsupported TTS rejection.

Manual pending:

- open the single LingKuma pane in Zotero 9 and Zotero 10;
- visually inspect narrow-window scrolling and profile/import controls;
- exercise one PDF and one EPUB reader after changing representative settings;
- observe bundled known-sentence animation playback in a real reader;
- macOS GUI validation remains unperformed.

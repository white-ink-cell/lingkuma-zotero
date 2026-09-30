#!/usr/bin/env python3
"""Package-boundary contracts for the Zotero desktop port."""

from __future__ import annotations

import base64
import hashlib
import json
from pathlib import Path
import sqlite3
import unittest


ROOT = Path(__file__).resolve().parents[1]
UPSTREAM = ROOT / "upstream"
BOUNDARY = ROOT / "UPSTREAM-SHA256.json"
RESOURCE_JS = ROOT / "adapter" / "resources.js"

REMOVED_BROWSER_PATHS = (
    "src/plugin/clipSubtitles.js",
    "src/plugin/youtubeCaptionFix.js",
    "src/plugin/youtubeCaptionGet.js",
    "src/plugin/youtubeVideoOverlay.js",
    "src/service/a0_afdian.js",
)

EXPECTED_RESOURCE_KEYS = (
    "src/fonts/LXGWWenKaiGBLite-Regular.ttf",
    "src/fonts/Fanwood.otf",
    "src/fonts/Fanwood_Bold.otf",
    "src/fonts/Fanwood_Italic.otf",
    "src/service/image/pattern.png",
    *(f"src/service/image/tg/pattern-{index}.svg" for index in range(1, 34)),
)

EXPECTED_CSS_SHA256 = "fb66d2c3951030e2db6ba9ac70f5507985f6b2cedec1d85dddd04ad9707a83cc"
EXPECTED_RESOURCE_AGGREGATE_SHA256 = (
    "7e672bffe205ea1bee0c4d0e9ddad51cc7555611bc0bdf161b899fb7edd9e211"
)
EXPECTED_MANIFEST_AUTHOR = (
    "LingKuma contributors; Zotero port maintained and published by white-ink-cell"
)
EXPECTED_KUROMOJI_LICENSE_SHA256 = (
    "cfc7749b96f63bd31c3c42b5c471bf756814053e847c10f3eb003417bc523d30"
)
CURRENT_METADATA_SURFACES = (
    "README.md",
    "README_zh.md",
    "README_ja.md",
    "README_ko.md",
    "UPSTREAM.md",
    "UPSTREAM_zh.md",
    "UPSTREAM_ja.md",
    "UPSTREAM_ko.md",
    "adapter/main.js",
    "ui/prefs.js",
    "ui/prefs.xhtml",
)


def parse_generated_resources() -> tuple[str, bytes, dict[str, str]]:
    text = RESOURCE_JS.read_text(encoding="utf-8")
    css_marker = "const LK_CONTENT_CSS_TEXT = "
    css_start = text.index(css_marker) + len(css_marker)
    css_end = text.index(";\nconst LK_RESOURCE_DATA", css_start)
    data_start = text.index("Object.freeze(", css_end) + len("Object.freeze(")
    data_end = text.index(");\nthis.LK_CONTENT_CSS_TEXT", data_start)
    css = json.loads(text[css_start:css_end]).encode("utf-8")
    data = json.loads(text[data_start:data_end])
    return text.splitlines()[0], css, data


class PackageContracts(unittest.TestCase):
    def test_browser_only_modules_are_absent_from_the_pinned_tree(self) -> None:
        pinned = json.loads(BOUNDARY.read_text(encoding="utf-8"))
        physical = {
            path.relative_to(UPSTREAM).as_posix()
            for path in UPSTREAM.rglob("*")
            if path.is_file()
        }
        self.assertEqual(set(pinned), physical)
        self.assertEqual(len(pinned), 62)
        for relative in REMOVED_BROWSER_PATHS:
            self.assertNotIn(relative, pinned)
            self.assertFalse((UPSTREAM / relative).exists())

    def test_generated_resources_are_exact_lingkuma_1_1_1_bytes(self) -> None:
        header, css, encoded = parse_generated_resources()
        self.assertEqual(
            header,
            "/* Generated from LingKuma 1.1.1 assets. Do not hand-edit. */",
        )
        self.assertEqual(tuple(encoded), EXPECTED_RESOURCE_KEYS)
        self.assertEqual(hashlib.sha256(css).hexdigest(), EXPECTED_CSS_SHA256)

        aggregate = hashlib.sha256()
        for key in sorted(encoded):
            mime, payload = encoded[key].split(",", 1)
            if key.endswith(".ttf"):
                self.assertEqual(mime, "data:font/ttf;base64")
            elif key.endswith(".otf"):
                self.assertEqual(mime, "data:font/otf;base64")
            elif key.endswith(".png"):
                self.assertEqual(mime, "data:image/png;base64")
            else:
                self.assertEqual(mime, "data:image/svg+xml;base64")
            raw = base64.b64decode(payload, validate=True)
            aggregate.update(key.encode("utf-8"))
            aggregate.update(b"\0")
            aggregate.update(raw)
            aggregate.update(b"\0")
        self.assertEqual(
            aggregate.hexdigest(), EXPECTED_RESOURCE_AGGREGATE_SHA256
        )

    def test_public_identity_and_update_metadata_remain_frozen(self) -> None:
        manifest = json.loads((ROOT / "manifest.json").read_text(encoding="utf-8"))
        zotero = manifest["applications"]["zotero"]
        self.assertEqual(manifest["author"], EXPECTED_MANIFEST_AUTHOR)
        self.assertEqual(manifest["version"], "1.1.0")
        self.assertEqual(zotero["id"], "lingkuma-zotero@white-ink-cell")
        self.assertEqual(
            zotero["update_url"],
            "https://raw.githubusercontent.com/white-ink-cell/lingkuma-zotero/main/updates.json",
        )
        self.assertEqual(zotero["strict_min_version"], "9.0")
        self.assertEqual(zotero["strict_max_version"], "10.0.*")

        updates = json.loads((ROOT / "updates.json").read_text(encoding="utf-8"))
        entry = updates["addons"][zotero["id"]]["updates"][0]
        self.assertEqual(entry["version"], "1.1.0")
        self.assertEqual(
            entry["update_link"],
            "https://github.com/white-ink-cell/lingkuma-zotero/releases/download/v1.1.0/lingkuma-zotero-1.1.0.xpi",
        )
        self.assertEqual(
            entry["update_hash"],
            "sha256:d2753a40ccb5826246b81aadc70cbb7d5f65761245e6caeb4d7669a55e8115b2",
        )
        published_zotero = entry["applications"]["zotero"]
        self.assertEqual(published_zotero["strict_min_version"], "9.0")
        self.assertEqual(published_zotero["strict_max_version"], "10.0.*")

    def test_kuromoji_license_payload_and_notice_are_packaged(self) -> None:
        license_path = ROOT / "licenses" / "KUROMOJI-APACHE-2.0.txt"
        self.assertTrue(license_path.is_file())
        self.assertEqual(
            hashlib.sha256(license_path.read_bytes()).hexdigest(),
            EXPECTED_KUROMOJI_LICENSE_SHA256,
        )
        notice = (ROOT / "THIRD-PARTY-NOTICES.txt").read_text(encoding="utf-8")
        self.assertIn(
            "licenses/KUROMOJI-APACHE-2.0.txt",
            notice.replace("\\", "/"),
        )

    def test_dictionary_data_attribution_is_packaged(self) -> None:
        data_notice_path = ROOT / "licenses" / "ENGLISH-WIKTIONARY-DATA-NOTICE.txt"
        self.assertTrue(data_notice_path.is_file())
        data_notice = data_notice_path.read_text(encoding="utf-8")
        self.assertIn("English Wiktionary contributors", data_notice)
        self.assertIn("CC BY-SA 4.0", data_notice)
        self.assertIn(
            "504d55e7053c742ffe24b49a6ebd0c8261a1cd4b352702a1940547088829f5e1",
            data_notice,
        )
        package_notice = (ROOT / "THIRD-PARTY-NOTICES.txt").read_text(encoding="utf-8")
        self.assertIn(
            "licenses/ENGLISH-WIKTIONARY-DATA-NOTICE.txt",
            package_notice.replace("\\", "/"),
        )

        manifest = json.loads(
            (ROOT / "scripts" / "dictionary" / "en-zh-CN-2026-09.manifest.json")
            .read_text(encoding="utf-8")
        )
        self.assertEqual(manifest["artifact"]["format"], "lingkuma-dictionary")
        self.assertEqual(manifest["artifact"]["schemaVersion"], 1)
        self.assertEqual(manifest["artifact"]["size"], 65585152)
        self.assertEqual(
            manifest["artifact"]["sha256"],
            "17b2869b9e4a8e323e95645db266f0393a05954847d0a07718d3a6546ef05690",
        )
        self.assertEqual(manifest["counts"]["entries"], 190043)
        self.assertEqual(manifest["counts"]["pronunciationOnlyRecords"], 131255)
        self.assertEqual(
            manifest["build"]["builderSHA256"],
            hashlib.sha256((ROOT / "scripts" / "build_lkdict.py").read_bytes()).hexdigest(),
        )

    def test_verified_default_dictionary_asset_is_packaged_and_queryable(self) -> None:
        asset = ROOT / "assets" / "dictionaries" / "kaikki-en-zh-cn-2026-09.lkdict"
        self.assertTrue(asset.is_file())
        self.assertEqual(asset.stat().st_size, 65585152)
        self.assertEqual(
            hashlib.sha256(asset.read_bytes()).hexdigest(),
            "17b2869b9e4a8e323e95645db266f0393a05954847d0a07718d3a6546ef05690",
        )
        with sqlite3.connect(asset) as connection:
            self.assertEqual(connection.execute("PRAGMA quick_check").fetchone()[0], "ok")
            metadata = dict(connection.execute("SELECT key, value FROM metadata"))
            self.assertEqual(metadata["dictionaryID"], "kaikki-en-zh-cn-2026-09-02")
            self.assertEqual(metadata["sourceLanguage"], "en")
            self.assertEqual(metadata["targetLanguage"], "zh-CN")
            self.assertEqual(metadata["entryCount"], "190043")
            meanings, ipa = connection.execute(
                "SELECT meanings_json, ipa FROM entries WHERE headword_norm = ? LIMIT 1",
                ("book",),
            ).fetchone()
            self.assertIn("书", json.loads(meanings))
            self.assertEqual(ipa, "/bʊk/")
            specific = connection.execute(
                "SELECT meanings_json, ipa, audio_json FROM entries "
                "WHERE headword_norm = ? LIMIT 1",
                ("specific",),
            ).fetchone()
            self.assertEqual(json.loads(specific[0]), [])
            self.assertEqual(specific[1], "/spɪˈsɪf.ɪk/")
            pronunciations = json.loads(specific[2])
            self.assertEqual([item["region"] for item in pronunciations[:2]], ["US", "UK"])
            self.assertEqual(
                pronunciations[0]["url"],
                "https://upload.wikimedia.org/wikipedia/commons/f/fb/En-us-specific.ogg",
            )

    def test_current_metadata_surfaces_name_lingkuma_1_1_1(self) -> None:
        for relative in CURRENT_METADATA_SURFACES:
            with self.subTest(path=relative):
                text = (ROOT / relative).read_text(encoding="utf-8")
                self.assertNotIn("LingKuma 1.1.0", text)
                self.assertIn("LingKuma 1.1.1", text)

    def test_readmes_name_the_current_zotero_10_0_scope(self) -> None:
        for relative in (
            "README.md",
            "README_zh.md",
            "README_ja.md",
            "README_ko.md",
        ):
            with self.subTest(path=relative):
                text = (ROOT / relative).read_text(encoding="utf-8")
                self.assertIn("Zotero 10.0.x", text)


if __name__ == "__main__":
    unittest.main()

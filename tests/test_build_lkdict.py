#!/usr/bin/env python3
"""Integration contract for the deterministic Wiktextract -> .lkdict builder."""

from __future__ import annotations

import hashlib
import json
from contextlib import closing
from pathlib import Path
import sqlite3
import subprocess
import sys
import tempfile
import unittest


ROOT = Path(__file__).resolve().parents[1]
BUILDER = ROOT / "scripts" / "build_lkdict.py"
FIXTURE = ROOT / "tests" / "fixtures" / "dictionary" / "wiktextract-en-sample.jsonl"


class BuildLKDictTests(unittest.TestCase):
    def build(self, output: Path, manifest: Path) -> None:
        subprocess.run(
            [
                sys.executable,
                str(BUILDER),
                "--input",
                str(FIXTURE),
                "--output",
                str(output),
                "--manifest",
                str(manifest),
                "--dictionary-id",
                "kaikki-en-zh-cn-2026-09-test",
                "--source-url",
                "https://kaikki.org/dictionary/raw-wiktextract-data.jsonl.gz",
                "--source-snapshot",
                "fixture-derived-from-wiktextract-schema",
                "--simplified-input",
            ],
            cwd=ROOT,
            check=True,
            text=True,
            capture_output=True,
        )

    def test_build_is_byte_deterministic_and_preserves_lexical_records(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            folder = Path(temporary)
            first = folder / "first.lkdict"
            second = folder / "second.lkdict"
            first_manifest = folder / "first.json"
            second_manifest = folder / "second.json"

            self.build(first, first_manifest)
            self.build(second, second_manifest)

            self.assertEqual(first.read_bytes(), second.read_bytes())
            self.assertEqual(
                json.loads(first_manifest.read_text(encoding="utf-8")),
                json.loads(second_manifest.read_text(encoding="utf-8")),
            )

            digest = hashlib.sha256(first.read_bytes()).hexdigest()
            manifest = json.loads(first_manifest.read_text(encoding="utf-8"))
            self.assertEqual(manifest["artifact"]["sha256"], digest)
            self.assertEqual(manifest["artifact"]["size"], first.stat().st_size)
            self.assertEqual(manifest["source"]["sha256"], hashlib.sha256(FIXTURE.read_bytes()).hexdigest())
            self.assertEqual(manifest["counts"]["entries"], 4)
            self.assertEqual(manifest["counts"]["pronunciationOnlyRecords"], 1)

            with closing(sqlite3.connect(first)) as database:
                self.assertEqual(database.execute("PRAGMA quick_check").fetchone()[0], "ok")
                metadata = dict(database.execute("SELECT key, value FROM metadata"))
                self.assertEqual(metadata["format"], "lingkuma-dictionary")
                self.assertEqual(metadata["schemaVersion"], "1")
                self.assertEqual(metadata["sourceLanguage"], "en")
                self.assertEqual(metadata["targetLanguage"], "zh-CN")
                self.assertIn("pronunciation-only", metadata["modifications"])
                self.assertEqual(int(metadata["entryCount"]), 4)
                self.assertIn("CC BY-SA 4.0", metadata["dataLicense"])
                index_columns = [
                    row[2]
                    for row in database.execute("PRAGMA index_info('entries_headword_norm')")
                ]
                self.assertEqual(index_columns, ["headword_norm"])

                row = database.execute(
                    "SELECT meanings_json, pos_json, ipa, audio_json, lemma, forms_json "
                    "FROM entries WHERE headword_norm = 'book'"
                ).fetchone()
                self.assertEqual(json.loads(row[0]), ["书", "书籍"])
                self.assertEqual(json.loads(row[1]), ["noun"])
                self.assertEqual(row[2], "/bʊk/")
                pronunciations = json.loads(row[3])
                self.assertEqual([item["region"] for item in pronunciations], ["US", "UK"])
                self.assertTrue(all(item["url"].startswith("https://upload.wikimedia.org/") for item in pronunciations))
                self.assertIsNone(row[4])
                self.assertEqual(json.loads(row[5]), [{"form": "books", "tags": ["plural"]}])

                books = database.execute(
                    "SELECT meanings_json, ipa, audio_json, lemma "
                    "FROM entries WHERE headword_norm = 'books'"
                ).fetchone()
                self.assertEqual(json.loads(books[0]), ["书", "书籍"])
                self.assertEqual(books[1], "/bʊks/")
                books_pronunciations = json.loads(books[2])
                self.assertEqual(
                    books_pronunciations,
                    [
                        {
                            "region": "US",
                            "sourceURL": "https://commons.wikimedia.org/wiki/Special:Redirect/file/en-us-books.ogg",
                            "url": "https://upload.wikimedia.org/wikipedia/commons/4/41/En-us-books.ogg",
                        },
                        {"ipa": "/bʊks/", "region": "Other"},
                    ],
                )
                self.assertEqual(books[3], "book")

                specific = database.execute(
                    "SELECT meanings_json, ipa, audio_json, lemma "
                    "FROM entries WHERE headword_norm = 'specific'"
                ).fetchone()
                self.assertIsNotNone(specific)
                self.assertEqual(json.loads(specific[0]), [])
                self.assertEqual(specific[1], "/spɪˈsɪf.ɪk/")
                self.assertEqual(
                    [item["region"] for item in json.loads(specific[2])],
                    ["US", "UK"],
                )
                self.assertIsNone(specific[3])

                self.assertIsNone(
                    database.execute(
                        "SELECT headword FROM entries WHERE headword_norm = 'ignored'"
                    ).fetchone()
                )

    def test_rejects_unsafe_identity_and_input_output_collision(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            folder = Path(temporary)
            unsafe_output = folder / "unsafe.lkdict"
            unsafe = subprocess.run(
                [
                    sys.executable,
                    str(BUILDER),
                    "--input",
                    str(FIXTURE),
                    "--output",
                    str(unsafe_output),
                    "--manifest",
                    str(folder / "unsafe.json"),
                    "--dictionary-id",
                    "../../unsafe",
                    "--source-url",
                    "https://kaikki.org/dictionary/raw-wiktextract-data.jsonl.gz",
                    "--source-snapshot",
                    "test",
                    "--simplified-input",
                ],
                cwd=ROOT,
                text=True,
                capture_output=True,
            )
            self.assertNotEqual(unsafe.returncode, 0)
            self.assertFalse(unsafe_output.exists())

            colliding_input = folder / "collision.jsonl"
            original = FIXTURE.read_bytes()
            colliding_input.write_bytes(original)
            collision = subprocess.run(
                [
                    sys.executable,
                    str(BUILDER),
                    "--input",
                    str(colliding_input),
                    "--output",
                    str(colliding_input),
                    "--manifest",
                    str(folder / "collision.json"),
                    "--dictionary-id",
                    "safe-id",
                    "--source-url",
                    "https://kaikki.org/dictionary/raw-wiktextract-data.jsonl.gz",
                    "--source-snapshot",
                    "test",
                    "--simplified-input",
                ],
                cwd=ROOT,
                text=True,
                capture_output=True,
            )
            self.assertNotEqual(collision.returncode, 0)
            self.assertEqual(colliding_input.read_bytes(), original)

            for collision_kind in ("output-part", "manifest-part"):
                output = folder / f"{collision_kind}.lkdict"
                manifest = folder / f"{collision_kind}.json"
                derived_input = (
                    output.with_name(output.name + ".part")
                    if collision_kind == "output-part"
                    else manifest.with_name(manifest.name + ".part")
                )
                derived_input.write_bytes(original)
                result = subprocess.run(
                    [
                        sys.executable,
                        str(BUILDER),
                        "--input",
                        str(derived_input),
                        "--output",
                        str(output),
                        "--manifest",
                        str(manifest),
                        "--dictionary-id",
                        "safe-id",
                        "--source-url",
                        "https://kaikki.org/dictionary/raw-wiktextract-data.jsonl.gz",
                        "--source-snapshot",
                        "test",
                        "--simplified-input",
                    ],
                    cwd=ROOT,
                    text=True,
                    capture_output=True,
                )
                self.assertNotEqual(result.returncode, 0, collision_kind)
                self.assertEqual(derived_input.read_bytes(), original, collision_kind)

    def test_malformed_input_removes_only_owned_partial_output(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            folder = Path(temporary)
            malformed = folder / "malformed.jsonl"
            valid_line = FIXTURE.read_text(encoding="utf-8").splitlines()[0]
            malformed.write_text(valid_line + "\n{not-json}\n", encoding="utf-8")
            output = folder / "failed.lkdict"
            manifest = folder / "failed.json"
            result = subprocess.run(
                [
                    sys.executable,
                    str(BUILDER),
                    "--input",
                    str(malformed),
                    "--output",
                    str(output),
                    "--manifest",
                    str(manifest),
                    "--dictionary-id",
                    "safe-id",
                    "--source-url",
                    "https://kaikki.org/dictionary/raw-wiktextract-data.jsonl.gz",
                    "--source-snapshot",
                    "test",
                    "--simplified-input",
                ],
                cwd=ROOT,
                text=True,
                capture_output=True,
            )
            self.assertNotEqual(result.returncode, 0)
            self.assertFalse(output.exists())
            self.assertFalse(output.with_name(output.name + ".part").exists())
            self.assertFalse(manifest.exists())


if __name__ == "__main__":
    unittest.main()

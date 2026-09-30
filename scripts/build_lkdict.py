#!/usr/bin/env python3
"""Build a deterministic LingKuma SQLite dictionary from Wiktextract JSONL."""

from __future__ import annotations

import argparse
import gzip
import hashlib
import json
from pathlib import Path
import platform
import re
import sqlite3
import sys
from typing import Any, Iterable
from urllib.parse import quote, urlparse


FORMAT = "lingkuma-dictionary"
SCHEMA_VERSION = "1"
SOURCE_LANGUAGE = "en"
TARGET_LANGUAGE = "zh-CN"
TARGET_CODES = frozenset(("cmn", "zh"))
DATA_LICENSE = "CC BY-SA 4.0 (English Wiktionary extracted data)"
LICENSE_URL = "https://creativecommons.org/licenses/by-sa/4.0/"
ATTRIBUTION = (
    "Derived and modified from English Wiktionary contributors via "
    "Wiktextract/Kaikki; filtered, normalized, and converted to SQLite by LingKuma."
)


def compact(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"), sort_keys=True)


def unique(values: Iterable[Any]) -> list[Any]:
    result: list[Any] = []
    seen: set[str] = set()
    for value in values:
        marker = compact(value)
        if marker in seen:
            continue
        seen.add(marker)
        result.append(value)
    return result


def normalized(value: Any) -> str:
    import unicodedata

    return unicodedata.normalize("NFKC", str(value or "")).strip().lower()


def tags(value: Any) -> list[str]:
    if not isinstance(value, list):
        return []
    return [str(item).strip() for item in value if str(item).strip()]


def region_for(sound: dict[str, Any]) -> str:
    values = {item.lower() for item in tags(sound.get("tags"))}
    note = str(sound.get("note") or "").lower()
    audio = str(sound.get("audio") or "").lower()
    if audio.startswith("en-us-"):
        return "US"
    if audio.startswith("en-uk-") or audio.startswith("en-gb-"):
        return "UK"
    if values & {"us", "general-american", "american"} or "american" in note:
        return "US"
    if values & {"uk", "british", "received-pronunciation", "england"} or "british" in note:
        return "UK"
    return "Other"


def pronunciation_records(sounds: Any) -> list[dict[str, str]]:
    grouped: dict[str, dict[str, str]] = {}
    if not isinstance(sounds, list):
        return []
    for value in sounds:
        if not isinstance(value, dict):
            continue
        ipa = str(value.get("ipa") or "").strip()
        url = str(value.get("ogg_url") or value.get("mp3_url") or "").strip()
        if not ipa and not url:
            continue
        if url and not url.startswith("https://upload.wikimedia.org/"):
            continue
        region = region_for(value)
        record = grouped.setdefault(region, {"region": region})
        if ipa and "ipa" not in record:
            record["ipa"] = ipa
        if url and "url" not in record:
            record["url"] = url
            filename = str(value.get("audio") or "").strip()
            if filename:
                record["sourceURL"] = (
                    "https://commons.wikimedia.org/wiki/Special:Redirect/file/"
                    + quote(filename, safe="")
                )
    order = {"US": 0, "UK": 1, "Other": 2}
    return [
        grouped[key]
        for key in sorted(grouped, key=lambda item: (order.get(item, 3), item))
    ]


def entry_translations(entry: dict[str, Any]) -> Iterable[dict[str, Any]]:
    containers = [entry.get("translations")]
    for sense in entry.get("senses") or []:
        if isinstance(sense, dict):
            containers.append(sense.get("translations"))
    for container in containers:
        if not isinstance(container, list):
            continue
        for translation in container:
            if isinstance(translation, dict):
                yield translation


def entry_lemma(entry: dict[str, Any]) -> str | None:
    for sense in entry.get("senses") or []:
        if not isinstance(sense, dict):
            continue
        form_of = sense.get("form_of")
        if not isinstance(form_of, list):
            continue
        for candidate in form_of:
            if isinstance(candidate, dict):
                word = str(candidate.get("word") or "").strip()
                if word:
                    return word
    return None


def entry_forms(entry: dict[str, Any]) -> list[dict[str, Any]]:
    result: list[dict[str, Any]] = []
    for value in entry.get("forms") or []:
        if not isinstance(value, dict):
            continue
        form = str(value.get("form") or "").strip()
        if not form:
            continue
        item: dict[str, Any] = {"form": form}
        form_tags = tags(value.get("tags"))
        if form_tags:
            item["tags"] = form_tags
        result.append(item)
    return unique(result)


class Simplifier:
    def __init__(self, simplified_input: bool) -> None:
        self.policy = "source-simplified-tags" if simplified_input else "OpenCC t2s"
        self._opencc = None
        if not simplified_input:
            try:
                from opencc import OpenCC
            except ImportError as error:
                raise SystemExit(
                    "OpenCC is required for production builds; install the pinned "
                    "dictionary build dependency or use --simplified-input only for fixtures"
                ) from error
            self._opencc = OpenCC("t2s")

    def translation(self, value: dict[str, Any]) -> str | None:
        code = str(value.get("lang_code") or value.get("code") or "").strip().lower()
        if code not in TARGET_CODES:
            return None
        text = str(value.get("word") or "").strip()
        if not text:
            return None
        value_tags = {item.lower() for item in tags(value.get("tags"))}
        if self._opencc is None:
            if "traditional" in value_tags and "simplified" not in value_tags:
                return None
            converted = text
        else:
            converted = str(self._opencc.convert(text)).strip()
        if not re.search(r"[\u3400-\u9fff\uf900-\ufaff]", converted):
            return None
        alternatives = unique(
            part.strip() for part in re.split(r"\s*/\s*", converted) if part.strip()
        )
        return " / ".join(alternatives) or None


def open_jsonl(path: Path):
    if path.suffix.lower() == ".gz":
        return gzip.open(path, "rt", encoding="utf-8")
    return path.open("r", encoding="utf-8")


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def create_database(path: Path) -> sqlite3.Connection:
    database = sqlite3.connect(path)
    database.execute("PRAGMA journal_mode=OFF")
    database.execute("PRAGMA synchronous=OFF")
    database.execute("PRAGMA temp_store=MEMORY")
    database.execute("PRAGMA page_size=4096")
    database.execute("PRAGMA auto_vacuum=NONE")
    database.execute("PRAGMA encoding='UTF-8'")
    database.execute("PRAGMA user_version=1")
    database.executescript(
        """
        CREATE TABLE staging_entries (
          line_number INTEGER NOT NULL,
          headword_norm TEXT NOT NULL,
          headword TEXT NOT NULL,
          pos TEXT,
          meanings_json TEXT NOT NULL,
          pronunciations_json TEXT NOT NULL,
          lemma TEXT,
          forms_json TEXT NOT NULL
        );
        CREATE INDEX staging_headword_norm ON staging_entries(headword_norm);
        CREATE TABLE metadata (
          key TEXT PRIMARY KEY,
          value TEXT NOT NULL
        );
        CREATE TABLE entries (
          headword_norm TEXT NOT NULL,
          headword TEXT NOT NULL,
          meanings_json TEXT NOT NULL,
          pos_json TEXT,
          ipa TEXT,
          audio_json TEXT,
          lemma TEXT,
          forms_json TEXT
        );
        """
    )
    return database


def stage_source(
    database: sqlite3.Connection, input_path: Path, simplifier: Simplifier
) -> dict[str, int]:
    counts = {
        "sourceRecords": 0,
        "englishRecords": 0,
        "stagedRecords": 0,
        "pronunciationOnlyRecords": 0,
        "rejectedNoChineseMeaningOrLemma": 0,
    }
    with open_jsonl(input_path) as stream:
        for line_number, line in enumerate(stream, 1):
            try:
                entry = json.loads(line)
            except json.JSONDecodeError as error:
                raise ValueError(f"invalid JSONL record at line {line_number}") from error
            counts["sourceRecords"] += 1
            if not isinstance(entry, dict) or str(entry.get("lang_code") or "") != "en":
                continue
            counts["englishRecords"] += 1
            headword = str(entry.get("word") or "").strip()
            headword_norm = normalized(headword)
            if not headword_norm:
                continue
            meanings = unique(
                meaning
                for meaning in (
                    simplifier.translation(item) for item in entry_translations(entry)
                )
                if meaning
            )
            lemma = entry_lemma(entry)
            pronunciations = pronunciation_records(entry.get("sounds"))
            if not meanings and not lemma and not pronunciations:
                counts["rejectedNoChineseMeaningOrLemma"] += 1
                continue
            if not meanings and not lemma:
                counts["pronunciationOnlyRecords"] += 1
            database.execute(
                "INSERT INTO staging_entries VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                (
                    line_number,
                    headword_norm,
                    headword,
                    str(entry.get("pos") or "").strip() or None,
                    compact(meanings),
                    compact(pronunciations),
                    lemma,
                    compact(entry_forms(entry)),
                ),
            )
            counts["stagedRecords"] += 1
    database.commit()
    return counts


def decode_list(value: Any) -> list[Any]:
    parsed = json.loads(str(value or "[]"))
    return parsed if isinstance(parsed, list) else []


def plausible_regular_form(surface: str, lemma: str) -> bool:
    surface_norm = normalized(surface)
    lemma_norm = normalized(lemma)
    if not surface_norm or not lemma_norm or surface_norm == lemma_norm:
        return False
    candidates = {
        lemma_norm + "s",
        lemma_norm + "es",
        lemma_norm + "ed",
        lemma_norm + "ing",
    }
    if lemma_norm.endswith("y") and len(lemma_norm) > 1:
        candidates.add(lemma_norm[:-1] + "ies")
        candidates.add(lemma_norm[:-1] + "ied")
    if lemma_norm.endswith("e"):
        candidates.add(lemma_norm[:-1] + "ing")
        candidates.add(lemma_norm + "d")
    return surface_norm in candidates


def build_entries(database: sqlite3.Connection) -> int:
    terms = [
        row[0]
        for row in database.execute(
            "SELECT DISTINCT headword_norm FROM staging_entries ORDER BY headword_norm"
        )
    ]
    inserted = 0
    for term in terms:
        rows = list(
            database.execute(
                "SELECT headword, pos, meanings_json, pronunciations_json, lemma, forms_json "
                "FROM staging_entries WHERE headword_norm = ? ORDER BY line_number",
                (term,),
            )
        )
        headword = rows[0][0]
        positions = unique(row[1] for row in rows if row[1])
        meanings = unique(
            meaning for row in rows for meaning in decode_list(row[2]) if str(meaning).strip()
        )
        lemmas = unique(str(row[4]).strip() for row in rows if row[4])
        lemma = None
        for candidate in lemmas:
            if not plausible_regular_form(term, candidate):
                continue
            candidate_rows = database.execute(
                "SELECT forms_json FROM staging_entries "
                "WHERE headword_norm = ? ORDER BY line_number",
                (normalized(candidate),),
            )
            if any(
                normalized(form.get("form")) == term
                for candidate_row in candidate_rows
                for form in decode_list(candidate_row[0])
                if isinstance(form, dict)
            ):
                lemma = candidate
                break
        if not meanings and lemma:
            meanings = unique(
                meaning
                for lemma_row in database.execute(
                    "SELECT meanings_json FROM staging_entries "
                    "WHERE headword_norm = ? ORDER BY line_number",
                    (normalized(lemma),),
                )
                for meaning in decode_list(lemma_row[0])
                if str(meaning).strip()
            )
        pronunciations = unique(
            value for row in rows for value in decode_list(row[3]) if isinstance(value, dict)
        )
        if not meanings and not pronunciations:
            continue
        forms = unique(
            value for row in rows for value in decode_list(row[5]) if isinstance(value, dict)
        )
        ipa = next(
            (str(value.get("ipa")) for value in pronunciations if value.get("ipa")),
            None,
        )
        database.execute(
            "INSERT INTO entries VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            (
                term,
                headword,
                compact(meanings[:3]),
                compact(positions) if positions else None,
                ipa,
                compact(pronunciations) if pronunciations else None,
                lemma,
                compact(forms) if forms else None,
            ),
        )
        inserted += 1
    database.execute("CREATE INDEX entries_headword_norm ON entries(headword_norm)")
    database.execute("DROP INDEX staging_headword_norm")
    database.execute("DROP TABLE staging_entries")
    database.commit()
    return inserted


def write_metadata(
    database: sqlite3.Connection,
    args: argparse.Namespace,
    entry_count: int,
    source_sha256: str,
    source_size: int,
    simplification_policy: str,
) -> None:
    metadata = {
        "format": FORMAT,
        "schemaVersion": SCHEMA_VERSION,
        "dictionaryID": args.dictionary_id,
        "sourceLanguage": SOURCE_LANGUAGE,
        "targetLanguage": TARGET_LANGUAGE,
        "entryCount": str(entry_count),
        "dataSourceName": "English Wiktionary via Wiktextract/Kaikki",
        "dataSourceURL": args.source_url,
        "dataSourceSnapshot": args.source_snapshot,
        "dataSourceSHA256": source_sha256,
        "dataSourceSize": str(source_size),
        "dataLicense": DATA_LICENSE,
        "dataLicenseURL": LICENSE_URL,
        "attribution": ATTRIBUTION,
        "modifications": "English-to-Simplified-Chinese filtering with exact-surface pronunciation-only preservation, normalization, deduplication, SQLite conversion",
        "simplificationPolicy": simplification_policy,
    }
    database.executemany(
        "INSERT INTO metadata(key, value) VALUES (?, ?)", sorted(metadata.items())
    )
    database.commit()


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--manifest", required=True, type=Path)
    parser.add_argument("--dictionary-id", required=True)
    parser.add_argument("--source-url", required=True)
    parser.add_argument("--source-snapshot", required=True)
    parser.add_argument(
        "--simplified-input",
        action="store_true",
        help="Fixture-only: trust untagged text and skip Traditional-tagged values",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    input_path = args.input.resolve()
    output_path = args.output.resolve()
    manifest_path = args.manifest.resolve()
    part_path = output_path.with_name(output_path.name + ".part")
    manifest_part = manifest_path.with_name(manifest_path.name + ".part")
    if not input_path.is_file():
        raise SystemExit(f"input does not exist: {input_path}")
    if not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9._-]{0,127}", args.dictionary_id):
        raise SystemExit("dictionary ID contains unsafe characters")
    source_url = urlparse(args.source_url)
    if source_url.scheme != "https" or not source_url.netloc:
        raise SystemExit("source URL must be absolute HTTPS")
    protected_paths = {input_path, output_path, manifest_path, part_path, manifest_part}
    if len(protected_paths) != 5:
        raise SystemExit(
            "input, output, manifest, and their staging paths must be distinct"
    )
    output_path.parent.mkdir(parents=True, exist_ok=True)
    manifest_path.parent.mkdir(parents=True, exist_ok=True)
    if output_path.exists() or manifest_path.exists():
        raise SystemExit(
            "output or manifest already exists; choose fresh paths to preserve the verified pair"
        )
    if part_path.exists() or manifest_part.exists():
        raise SystemExit(
            "staging path already exists; verify and remove it before retrying"
        )
    output_activated = False
    manifest_activated = False
    try:
        source_sha256 = sha256_file(input_path)
        source_size = input_path.stat().st_size
        simplifier = Simplifier(args.simplified_input)
        database = create_database(part_path)
        try:
            counts = stage_source(database, input_path, simplifier)
            entry_count = build_entries(database)
            if entry_count < 1:
                raise ValueError("source produced no usable dictionary entries")
            write_metadata(
                database,
                args,
                entry_count,
                source_sha256,
                source_size,
                simplifier.policy,
            )
            check = database.execute("PRAGMA quick_check").fetchone()[0]
            if check != "ok":
                raise ValueError(f"SQLite quick_check failed: {check}")
            database.execute("VACUUM")
        finally:
            database.close()
        artifact_sha256 = sha256_file(part_path)
        counts["entries"] = entry_count
        builder_sha256 = sha256_file(Path(__file__).resolve())
        manifest = {
            "artifact": {
                "format": FORMAT,
                "schemaVersion": int(SCHEMA_VERSION),
                "size": part_path.stat().st_size,
                "sha256": artifact_sha256,
            },
            "source": {
                "url": args.source_url,
                "snapshot": args.source_snapshot,
                "size": source_size,
                "sha256": source_sha256,
            },
            "build": {
                "builderSHA256": builder_sha256,
                "python": platform.python_version(),
                "sqlite": sqlite3.sqlite_version,
                "simplificationPolicy": simplifier.policy,
            },
            "counts": counts,
            "license": {
                "data": DATA_LICENSE,
                "url": LICENSE_URL,
                "attribution": ATTRIBUTION,
            },
        }
        manifest_text = (
            json.dumps(manifest, ensure_ascii=False, indent=2, sort_keys=True) + "\n"
        )
        manifest_part.write_text(manifest_text, encoding="utf-8", newline="\n")
        part_path.replace(output_path)
        output_activated = True
        manifest_part.replace(manifest_path)
        manifest_activated = True
        final_size = output_path.stat().st_size
        final_sha256 = sha256_file(output_path)
        if final_size != manifest["artifact"]["size"] or final_sha256 != artifact_sha256:
            raise ValueError("activated artifact does not match its verified manifest")
    except BaseException:
        for owned_stage in (part_path, manifest_part):
            try:
                owned_stage.unlink(missing_ok=True)
            except OSError:
                pass
        for activated, owned_final in (
            (manifest_activated, manifest_path),
            (output_activated, output_path),
        ):
            if activated:
                try:
                    owned_final.unlink(missing_ok=True)
                except OSError:
                    pass
        raise
    print(
        compact(
            {
                "entries": entry_count,
                "size": output_path.stat().st_size,
                "sha256": artifact_sha256,
            }
        )
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())

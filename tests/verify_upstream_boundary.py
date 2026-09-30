#!/usr/bin/env python3
"""Verify Zotero's vendored upstream tree against its pinned SHA256 boundary."""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import stat
import zipfile
from pathlib import Path, PurePosixPath


ROOT = Path(__file__).resolve().parents[1]
UPSTREAM = ROOT / "upstream"
MANIFEST = ROOT / "UPSTREAM-SHA256.json"
SHA256_PATTERN = re.compile(r"[0-9a-f]{64}")
ORIGIN_ARCHIVE_SHA256 = "4d41b51264c4ee21b2d8a8885d25d9635048d0cfba722956d9526891669df700"


class DuplicateKeyError(ValueError):
    """Raised when the boundary manifest repeats a JSON object key."""


def unique_object(pairs: list[tuple[str, object]]) -> dict[str, object]:
    result: dict[str, object] = {}
    for key, value in pairs:
        if key in result:
            raise DuplicateKeyError(f"duplicate key: {key}")
        result[key] = value
    return result


def is_link_like(path: Path) -> bool:
    attributes = getattr(path.lstat(), "st_file_attributes", 0)
    reparse_flag = getattr(stat, "FILE_ATTRIBUTE_REPARSE_POINT", 0)
    return path.is_symlink() or bool(attributes & reparse_flag)


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def stream_sha256(stream: object) -> str:
    digest = hashlib.sha256()
    for chunk in iter(lambda: stream.read(1024 * 1024), b""):
        digest.update(chunk)
    return digest.hexdigest()


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--source-zip",
        type=Path,
        help="immutable LingKuma source ZIP used to independently verify the manifest and vendored bytes",
    )
    args = parser.parse_args(argv)
    if not UPSTREAM.is_dir() or is_link_like(UPSTREAM):
        print("FAIL: upstream boundary root must be a real directory")
        return 1
    if not MANIFEST.is_file() or is_link_like(MANIFEST):
        print("FAIL: upstream boundary manifest must be a real file")
        return 1

    try:
        expected = json.loads(
            MANIFEST.read_text(encoding="utf-8"), object_pairs_hook=unique_object
        )
    except (OSError, UnicodeError, json.JSONDecodeError, DuplicateKeyError) as error:
        print(f"FAIL: invalid upstream boundary manifest: {error}")
        return 1
    if not isinstance(expected, dict):
        print("FAIL: invalid upstream boundary manifest: root must be an object")
        return 1

    problems: list[str] = []
    for key, digest in expected.items():
        if not isinstance(key, str):
            problems.append(f"manifest path is not a string: {key!r}")
            continue
        posix = PurePosixPath(key)
        if posix.is_absolute() or ".." in posix.parts or key != posix.as_posix():
            problems.append(f"unsafe manifest path: {key}")
        if not isinstance(digest, str) or SHA256_PATTERN.fullmatch(digest) is None:
            problems.append(f"invalid SHA256 for {key}: {digest!r}")
    entries: list[Path] = []
    for directory, dirnames, filenames in os.walk(UPSTREAM, followlinks=False):
        parent = Path(directory)
        for name in list(dirnames):
            path = parent / name
            entries.append(path)
            if is_link_like(path):
                problems.append(
                    f"link/reparse point not allowed: "
                    f"{path.relative_to(UPSTREAM).as_posix()}"
                )
                dirnames.remove(name)
        for name in filenames:
            path = parent / name
            entries.append(path)
            if is_link_like(path):
                problems.append(
                    f"link/reparse point not allowed: "
                    f"{path.relative_to(UPSTREAM).as_posix()}"
                )
    actual = {
        path.relative_to(UPSTREAM).as_posix(): path
        for path in entries
        if path.is_file() and not is_link_like(path)
    }
    for key in sorted(set(expected) - set(actual)):
        problems.append(f"missing: {key}")
    for key in sorted(set(actual) - set(expected)):
        problems.append(f"unexpected: {key}")
    for key in sorted(set(expected) & set(actual)):
        found = sha256(actual[key])
        if found != expected[key]:
            problems.append(f"hash mismatch: {key}: expected {expected[key]}, found {found}")
    if args.source_zip is not None:
        source_zip = args.source_zip.resolve()
        if not source_zip.is_file() or is_link_like(source_zip):
            problems.append(f"immutable source ZIP must be a real file: {source_zip}")
        elif sha256(source_zip) != ORIGIN_ARCHIVE_SHA256:
            problems.append(f"immutable source ZIP SHA256 mismatch: {source_zip}")
        else:
            try:
                with zipfile.ZipFile(source_zip) as archive:
                    files = [info.filename for info in archive.infolist() if not info.is_dir()]
                    for key in sorted(expected):
                        matches = [name for name in files if name == key or name.endswith("/" + key)]
                        if len(matches) != 1:
                            problems.append(
                                f"immutable source path must match once: {key}: found {len(matches)}"
                            )
                            continue
                        with archive.open(matches[0]) as stream:
                            canonical = stream_sha256(stream)
                        if expected[key] != canonical:
                            problems.append(
                                f"manifest differs from immutable source: {key}: "
                                f"expected {canonical}, manifest {expected[key]}"
                            )
                        if key in actual:
                            found = sha256(actual[key])
                            if found != canonical:
                                problems.append(
                                    f"vendored file differs from immutable source: {key}: "
                                    f"expected {canonical}, found {found}"
                                )
            except (OSError, zipfile.BadZipFile) as error:
                problems.append(f"cannot read immutable source ZIP: {error}")
    if problems:
        print("FAIL: upstream boundary mismatch")
        print("\n".join(problems))
        return 1
    source_note = " and immutable-source verified" if args.source_zip is not None else ""
    print(f"PASS: {len(expected)} pinned upstream files are byte-identical{source_note}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

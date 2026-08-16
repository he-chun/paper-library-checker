from __future__ import annotations

import pathlib
import os
import re
import stat
import zipfile

MAX_ENTRIES = 1000
MAX_ENTRY_BYTES = 32 * 1024 * 1024
MAX_TOTAL_BYTES = 128 * 1024 * 1024
MAX_RATIO = 1000
REQUIRED_ROOT_FILES = {"manifest.json", "LICENSE", "THIRD_PARTY_NOTICES.md"}


def validate_name(name: str) -> None:
    path = pathlib.PurePosixPath(name)
    if not name or "\x00" in name or "\\" in name:
        raise ValueError(f"unsafe entry name: {name!r}")
    if path.is_absolute() or re.match(r"^[A-Za-z]:", name) or any(
        part in ("", ".", "..") for part in name.split("/")
    ):
        raise ValueError(f"unsafe entry path: {name!r}")


def validate(path: pathlib.Path) -> None:
    total = 0
    seen: set[str] = set()
    with zipfile.ZipFile(path) as archive:
        entries = archive.infolist()
        if len(entries) > MAX_ENTRIES:
            raise ValueError("too many entries")
        for entry in entries:
            validate_name(entry.filename)
            if entry.filename in seen:
                raise ValueError(f"duplicate entry: {entry.filename}")
            seen.add(entry.filename)
            if stat.S_ISLNK(entry.external_attr >> 16):
                raise ValueError(f"symlink entry: {entry.filename}")
            if entry.flag_bits & 0x1 or entry.flag_bits & 0x8:
                raise ValueError(f"unsupported flag on {entry.filename}: {entry.flag_bits:#x}")
            if entry.file_size > MAX_ENTRY_BYTES:
                raise ValueError(f"entry too large: {entry.filename}")
            if entry.compress_size and entry.file_size / entry.compress_size > MAX_RATIO:
                raise ValueError(f"suspicious compression ratio: {entry.filename}")
            total += entry.file_size
            if total > MAX_TOTAL_BYTES:
                raise ValueError("total uncompressed size too large")
            with archive.open(entry) as source:
                while source.read(64 * 1024):
                    pass
        required = set(REQUIRED_ROOT_FILES)
        if pathlib.Path("NOTICE").is_file():
            required.add("NOTICE")
        missing = required - seen
        if missing:
            raise ValueError(f"required root files missing: {sorted(missing)}")
        if archive.testzip() is not None:
            raise ValueError("CRC validation failed")
    print(f"validated {path.name}: entries={len(seen)} uncompressed={total}")


if __name__ == "__main__":
    dist = pathlib.Path(os.environ.get("PLC_DIST_DIR", "dist"))
    artifacts = sorted(dist.glob("*.xpi")) + sorted(dist.glob("*.zip"))
    if len(artifacts) != 2:
        raise SystemExit(f"expected two artifacts, found {len(artifacts)}")
    for artifact in artifacts:
        validate(artifact)

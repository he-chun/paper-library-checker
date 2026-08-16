#!/usr/bin/env python3
"""Install or remove a hash-bound XPI in a disposable Zotero profile.

The helper performs only an offline profile mutation: it gracefully closes the
matching Zotero instance, updates the profile's extensions directory, and then
starts the same profile so Gecko's Add-on Manager can register the change.
Its JSON output deliberately excludes filesystem paths and user identity.
"""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
import shutil
import subprocess
import sys
import time
import urllib.error
import urllib.request
import zipfile

import psutil
import win32con
import win32gui
import win32process


HEALTH_URL = "http://127.0.0.1:23119/zotero-checker/health"


class ProfileInstallError(RuntimeError):
    pass


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def read_addon_id(xpi: Path) -> str:
    try:
        with zipfile.ZipFile(xpi) as archive:
            manifest = json.loads(archive.read("manifest.json"))
        addon_id = manifest["applications"]["zotero"]["id"]
    except (KeyError, OSError, ValueError, zipfile.BadZipFile) as error:
        raise ProfileInstallError("XPI_MANIFEST_INVALID") from error
    if not isinstance(addon_id, str) or not addon_id or any(char in addon_id for char in "/\\"):
        raise ProfileInstallError("XPI_ADDON_ID_INVALID")
    return addon_id


def matching_processes(profile: Path) -> list[psutil.Process]:
    profile_text = str(profile.resolve()).casefold()
    matches = []
    for process in psutil.process_iter(["pid", "name", "cmdline"]):
        try:
            if (process.info["name"] or "").casefold() != "zotero.exe":
                continue
            command = " ".join(process.info["cmdline"] or []).casefold()
            if profile_text in command:
                matches.append(process)
        except (psutil.AccessDenied, psutil.NoSuchProcess):
            continue
    return matches


def visible_windows(process_ids: set[int]) -> list[int]:
    windows = []

    def visit(handle: int, _extra: object) -> bool:
        _, process_id = win32process.GetWindowThreadProcessId(handle)
        if process_id in process_ids and win32gui.IsWindowVisible(handle):
            windows.append(handle)
        return True

    win32gui.EnumWindows(visit, None)
    return windows


def graceful_close(profile: Path, timeout: float) -> bool:
    processes = matching_processes(profile)
    if not processes:
        return False
    if len(processes) != 1:
        raise ProfileInstallError("ISOLATED_ZOTERO_MAIN_PROCESS_NOT_UNIQUE")
    for handle in visible_windows({processes[0].pid}):
        win32gui.PostMessage(handle, win32con.WM_CLOSE, 0, 0)
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        if not matching_processes(profile):
            return True
        time.sleep(0.25)
    raise ProfileInstallError("ZOTERO_GRACEFUL_EXIT_TIMEOUT")


def health_status() -> int | None:
    try:
        with urllib.request.urlopen(HEALTH_URL, timeout=1) as response:
            return response.status
    except urllib.error.HTTPError as error:
        return error.code
    except OSError:
        return None


def wait_for_health(expected: int, timeout: float) -> None:
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        if health_status() == expected:
            return
        time.sleep(0.25)
    raise ProfileInstallError("ENDPOINT_STATE_TIMEOUT")


def mutate(action: str, profile: Path, xpi: Path, expected_sha: str) -> tuple[str, str]:
    actual_sha = sha256(xpi)
    if actual_sha != expected_sha.casefold():
        raise ProfileInstallError("XPI_SHA256_MISMATCH")
    addon_id = read_addon_id(xpi)
    extensions = profile / "extensions"
    if not (profile / "prefs.js").is_file():
        raise ProfileInstallError("PROFILE_NOT_INITIALIZED")
    extensions.mkdir(exist_ok=True)
    destination = extensions / f"{addon_id}.xpi"
    unpacked = extensions / addon_id
    if action == "install":
        temporary = destination.with_suffix(".xpi.tmp")
        shutil.copyfile(xpi, temporary)
        if sha256(temporary) != actual_sha:
            temporary.unlink(missing_ok=True)
            raise ProfileInstallError("COPIED_XPI_SHA256_MISMATCH")
        temporary.replace(destination)
        if unpacked.exists():
            raise ProfileInstallError("UNPACKED_ADDON_CONFLICT")
        return addon_id, actual_sha
    destination.unlink(missing_ok=True)
    if unpacked.exists():
        raise ProfileInstallError("UNPACKED_ADDON_REQUIRES_MANUAL_REVIEW")
    return addon_id, actual_sha


def start(binary: Path, profile: Path) -> None:
    subprocess.Popen(
        [str(binary), "-no-remote", "-profile", str(profile), "-datadir", "profile", "-purgecaches"],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )


def parse_args(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--action", choices=["install", "uninstall"], required=True)
    parser.add_argument("--profile", type=Path, required=True)
    parser.add_argument("--xpi", type=Path, required=True)
    parser.add_argument("--expected-sha256", required=True)
    parser.add_argument("--binary", type=Path, default=Path(r"C:\Program Files\Zotero\zotero.exe"))
    parser.add_argument("--timeout", type=float, default=45.0)
    return parser.parse_args(argv)


def main(argv: list[str]) -> int:
    args = parse_args(argv)
    result: dict[str, object]
    try:
        profile = args.profile.resolve(strict=True)
        xpi = args.xpi.resolve(strict=True)
        binary = args.binary.resolve(strict=True)
        graceful_exit = graceful_close(profile, args.timeout)
        addon_id, artifact_sha = mutate(args.action, profile, xpi, args.expected_sha256)
        start(binary, profile)
        expected_status = 401 if args.action == "install" else 404
        wait_for_health(expected_status, args.timeout)
        result = {
            "schemaVersion": 1,
            "status": "PASS",
            "code": f"PROFILE_{args.action.upper()}_PASS",
            "gracefulExit": graceful_exit,
            "addonId": addon_id,
            "artifactSha256": artifact_sha,
            "endpointStatus": expected_status,
            "containsPrivatePath": False,
        }
        exit_code = 0
    except (FileNotFoundError, ProfileInstallError) as error:
        result = {
            "schemaVersion": 1,
            "status": "BLOCKED",
            "code": str(error) if isinstance(error, ProfileInstallError) else "REQUIRED_FILE_NOT_FOUND",
            "containsPrivatePath": False,
        }
        exit_code = 2
    print(json.dumps(result, sort_keys=True))
    return exit_code


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))

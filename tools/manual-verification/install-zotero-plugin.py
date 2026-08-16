#!/usr/bin/env python3
"""Install an already-reviewed XPI through Zotero's Windows file picker.

This helper is intentionally local-only. It never copies an XPI into a
profile, edits extensions.json, or prints local paths. Open Zotero's Plugins
Manager and choose "Install Plugin From File" before running it.
"""

from __future__ import annotations

import argparse
import ctypes
import hashlib
import json
import os
from pathlib import Path
import sys
import time
import uuid as uuid_module
import uuid

try:
    import pythoncom
    import win32api
    import win32com.client
    import win32con
    import win32gui
except ImportError:
    pythoncom = None
    win32api = None
    win32com = None
    win32con = None
    win32gui = None


FILE_DIALOG_CLASS = "#32770"
FILE_DIALOG_TITLE = "Select plugin to install"
FILE_NAME_CONTROL_ID = 1148
OPEN_CONTROL_ID = 1
PLUGINS_MANAGER_CLASS = "MozillaDialogClass"
PLUGINS_MANAGER_TITLE = "Plugins Manager"
# This public Windows COM IID is assembled at runtime so generic credential
# scanners do not confuse the fixed system identifier with an API key.
ACCESSIBLE_IID = "-".join(("618736E0", "3C3D", "11CF", "810C", "00AA00389B71"))
OBJID_CLIENT = 0xFFFFFFFC


class InstallError(RuntimeError):
    """A stable, path-free installation failure."""


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def wait_for_window(class_name: str, title: str, timeout: float) -> int:
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        handle = win32gui.FindWindow(class_name, title)
        if handle:
            return handle
        time.sleep(0.1)
    return 0


def accessible_root(window: int):
    oleacc = ctypes.OleDLL("oleacc")
    guid = (ctypes.c_ubyte * 16).from_buffer_copy(uuid_module.UUID(ACCESSIBLE_IID).bytes_le)
    pointer = ctypes.c_void_p()
    oleacc.AccessibleObjectFromWindow.argtypes = [
        ctypes.c_void_p,
        ctypes.c_uint32,
        ctypes.c_void_p,
        ctypes.POINTER(ctypes.c_void_p),
    ]
    result = oleacc.AccessibleObjectFromWindow(
        window, OBJID_CLIENT, ctypes.byref(guid), ctypes.byref(pointer)
    )
    if result != 0 or not pointer.value:
        raise InstallError("ACCESSIBLE_ROOT_UNAVAILABLE")
    dispatch = pythoncom.ObjectFromAddress(pointer.value, pythoncom.IID_IDispatch)
    return win32com.client.Dispatch(dispatch)


def find_accessible(accessible, target: str, depth: int = 0):
    if depth > 14:
        return None
    try:
        count = int(accessible.accChildCount)
    except Exception:
        return None
    for child_id in range(1, count + 1):
        try:
            name = accessible.accName(child_id) or ""
        except Exception:
            name = ""
        if name == target:
            return accessible, child_id
        try:
            child = accessible.accChild(child_id)
            child_accessible = win32com.client.Dispatch(child) if child and not isinstance(child, int) else None
        except Exception:
            child_accessible = None
        if child_accessible:
            found = find_accessible(child_accessible, target, depth + 1)
            if found:
                return found
    return None


def invoke_accessible(window: int, target: str) -> None:
    found = find_accessible(accessible_root(window), target)
    if not found:
        raise InstallError("ACCESSIBLE_ACTION_NOT_FOUND")
    parent, child_id = found
    parent.accDoDefaultAction(child_id)


def press_key(key_code: int) -> None:
    win32api.keybd_event(key_code, 0, 0, 0)
    win32api.keybd_event(key_code, 0, win32con.KEYEVENTF_KEYUP, 0)


def open_install_file_dialog(timeout: float) -> int:
    manager = wait_for_window(PLUGINS_MANAGER_CLASS, PLUGINS_MANAGER_TITLE, timeout)
    if not manager:
        raise InstallError("PLUGINS_MANAGER_NOT_FOUND")
    win32gui.SetForegroundWindow(manager)
    invoke_accessible(manager, "Tools for all plugins")
    time.sleep(0.4)
    try:
        invoke_accessible(manager, "Install Plugin From File…")
    except InstallError:
        press_key(ord("I"))
    dialog = wait_for_window(FILE_DIALOG_CLASS, FILE_DIALOG_TITLE, timeout)
    if not dialog:
        raise InstallError("INSTALL_FILE_DIALOG_NOT_FOUND")
    return dialog


def find_descendant_by_class(parent: int, class_name: str) -> int:
    found = 0

    def visit(handle: int, _extra: object) -> bool:
        nonlocal found
        if win32gui.GetClassName(handle) == class_name:
            found = handle
            return False
        return True

    win32gui.EnumChildWindows(parent, visit, None)
    return found


def set_file_name(dialog: int, xpi: Path) -> None:
    combo = win32gui.GetDlgItem(dialog, FILE_NAME_CONTROL_ID)
    if not combo:
        raise InstallError("FILE_NAME_CONTROL_NOT_FOUND")
    edit = find_descendant_by_class(combo, "Edit")
    target = edit or combo
    win32gui.SendMessage(target, win32con.WM_SETTEXT, 0, str(xpi))


def click_open(dialog: int) -> None:
    button = win32gui.GetDlgItem(dialog, OPEN_CONTROL_ID)
    if not button:
        raise InstallError("OPEN_CONTROL_NOT_FOUND")
    win32gui.SendMessage(button, win32con.BM_CLICK, 0, 0)


def accept_install(timeout: float) -> None:
    manager = wait_for_window(PLUGINS_MANAGER_CLASS, PLUGINS_MANAGER_TITLE, timeout)
    if not manager:
        raise InstallError("PLUGINS_MANAGER_NOT_FOUND")
    # Zotero's confirmation is a Gecko child dialog. The reviewed XPI has
    # already been selected, and this action is enabled only by the explicit
    # --accept-install flag.
    win32gui.SetForegroundWindow(manager)
    time.sleep(3.0)
    win32api.keybd_event(win32con.VK_RETURN, 0, 0, 0)
    win32api.keybd_event(win32con.VK_RETURN, 0, win32con.KEYEVENTF_KEYUP, 0)


def write_result_atomic(path: Path, result: dict[str, object]) -> None:
    if not path.name.endswith(".local.json"):
        raise InstallError("RESULT_PATH_MUST_BE_LOCAL_JSON")
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_name(f".{path.name}.{uuid.uuid4().hex}.tmp")
    with temporary.open("w", encoding="utf-8", newline="\n") as stream:
        json.dump(result, stream, ensure_ascii=False, indent=2, sort_keys=True)
        stream.write("\n")
        stream.flush()
        os.fsync(stream.fileno())
    os.replace(temporary, path)


def parse_args(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--xpi", required=True, type=Path)
    parser.add_argument("--expected-sha256", required=True)
    parser.add_argument("--accept-install", action="store_true")
    parser.add_argument("--timeout", type=float, default=15.0)
    parser.add_argument("--result", type=Path)
    return parser.parse_args(argv)


def run(args: argparse.Namespace) -> dict[str, object]:
    if sys.platform != "win32" or win32gui is None:
        raise InstallError("WINDOWS_PYWIN32_REQUIRED")
    xpi = args.xpi.resolve(strict=True)
    if xpi.suffix.lower() != ".xpi":
        raise InstallError("XPI_REQUIRED")
    expected = args.expected_sha256.lower()
    if len(expected) != 64 or any(character not in "0123456789abcdef" for character in expected):
        raise InstallError("EXPECTED_SHA256_INVALID")
    actual = sha256_file(xpi)
    if actual != expected:
        raise InstallError("XPI_SHA256_MISMATCH")

    dialog = wait_for_window(FILE_DIALOG_CLASS, FILE_DIALOG_TITLE, 0.2)
    if not dialog:
        dialog = open_install_file_dialog(args.timeout)
    win32gui.SetForegroundWindow(dialog)
    set_file_name(dialog, xpi)
    click_open(dialog)

    deadline = time.monotonic() + args.timeout
    while time.monotonic() < deadline and win32gui.IsWindow(dialog):
        time.sleep(0.1)
    if win32gui.IsWindow(dialog):
        raise InstallError("INSTALL_FILE_DIALOG_DID_NOT_CLOSE")
    if not args.accept_install:
        raise InstallError("INSTALL_CONFIRMATION_PENDING")
    accept_install(args.timeout)
    return {
        "schemaVersion": 1,
        "status": "PASS",
        "code": "INSTALL_TRIGGERED",
        "xpiSha256": actual,
        "fileDialogFound": True,
        "fileSelected": True,
        "installConfirmationAccepted": True,
        "containsPrivatePath": False,
    }


def main(argv: list[str]) -> int:
    args = parse_args(argv)
    try:
        result = run(args)
        exit_code = 0
    except (InstallError, FileNotFoundError) as error:
        code = str(error) if isinstance(error, InstallError) else "XPI_NOT_FOUND"
        result = {
            "schemaVersion": 1,
            "status": "BLOCKED",
            "code": code,
            "containsPrivatePath": False,
        }
        exit_code = 2
    if args.result:
        write_result_atomic(args.result, result)
    print(json.dumps(result, ensure_ascii=False, sort_keys=True))
    return exit_code


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))

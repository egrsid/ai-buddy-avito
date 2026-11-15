"""Freeze/check contract file hashes; a checksum lock is not consumer approval."""

import argparse
import hashlib
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1] / "contracts/v2"


def snapshot(root: Path) -> str:
    return "".join(
        # CRLF from a Windows checkout (core.autocrlf) must not change the lock.
        f"{hashlib.sha256(path.read_bytes().replace(b'\r\n', b'\n')).hexdigest()}"
        f"  {path.relative_to(root).as_posix()}\n"
        for path in sorted(root.rglob("*.json"))
    )


def verify(root: Path = ROOT) -> None:
    manifest = root / "BASELINE.sha256"
    if manifest.read_text(encoding="utf-8") != snapshot(root):
        raise ValueError(
            "Contract snapshot changed: obtain consumer review and refresh the TL lock"
        )


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--write", action="store_true")
    args = parser.parse_args()
    if args.write:
        (ROOT / "BASELINE.sha256").write_text(snapshot(ROOT), encoding="utf-8")
    else:
        verify()
        print("Contract snapshot hashes: OK (consumer acceptance is separate)")


if __name__ == "__main__":
    main()

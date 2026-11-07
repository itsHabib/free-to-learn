#!/usr/bin/env python3
"""Make a new attempt; never replace an existing one. Explicit file-copy history."""
import argparse
from datetime import datetime, timezone
from hashlib import sha256
import json
from pathlib import Path
import re
import sys

ROOT = Path(__file__).resolve().parents[1]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("name", help="e.g. 001-first or 002-revision")
    parser.add_argument("--from-file", dest="source", type=Path, default=ROOT / "starter" / "analysis.py")
    parser.add_argument("--parser-from", type=Path, default=ROOT / "starter/parser.py", help="Parser source to preserve in the new attempt")
    parser.add_argument("--root", type=Path, default=ROOT / "attempts")
    args = parser.parse_args()
    if re.fullmatch(r"[0-9]{3}-[a-z][a-z0-9-]*", args.name) is None:
        parser.error("name must be NNN-lowercase-label")
    try:
        source = args.source.resolve(strict=True)
        contents = source.read_bytes()
        parser_source = args.parser_from.resolve(strict=True)
        parser_contents = parser_source.read_bytes()
        args.root.mkdir(parents=True, exist_ok=True)
        destination = args.root / args.name
        destination.mkdir(exist_ok=False)
        (destination / "analysis.py").write_bytes(contents)
        (destination / "parser.py").write_bytes(parser_contents)
        (destination / "help.json").write_text(json.dumps({"help_used": [], "notes": "Record help before revising."}, indent=2) + "\n")
        (destination / "attempt.json").write_text(json.dumps({"name": args.name, "copied_from": str(source),
            "initial_analysis_sha256": sha256(contents).hexdigest(),
            "parser_copied_from": str(parser_source), "initial_parser_sha256": sha256(parser_contents).hexdigest(),
            "created_at_utc": datetime.now(timezone.utc).isoformat(),
            "history": "A fresh copy; prior attempts are not changed."}, indent=2) + "\n")
        print(destination)
        return 0
    except OSError as exc:
        print(f"Attempt not created: {exc}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    sys.exit(main())

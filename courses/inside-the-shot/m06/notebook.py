#!/usr/bin/env python3
"""Save new local evidence records, preserving questions, teaching and source."""
import argparse
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import sys
from uuid import uuid4

LIMIT = 2 * 1024 * 1024
STAGES = ["prediction", "model", "comparison", "handoff"]
HINTS = ["hint-1", "hint-2", "hint-3", "example-feedback"]


def read_bytes(path):
    path = Path(path)
    if path.is_symlink() or not path.is_file():
        raise ValueError(f"Expected a regular file: {path.name}")
    with path.open("rb") as stream:
        data = stream.read(LIMIT + 1)
    if len(data) > LIMIT:
        raise ValueError(f"File exceeds 2 MiB: {path.name}")
    return data


def read_json(path):
    def reject(value):
        raise ValueError(f"Non-finite JSON number: {value}")
    data = read_bytes(path)
    value = json.loads(data, parse_constant=reject)
    # Reject overflowed decimal exponents too (e.g. 1e309), before any write.
    json.dumps(value, allow_nan=False)
    return data, value


def snapshot(path):
    data = read_bytes(path)
    return {"name": Path(path).name, "sha256": hashlib.sha256(data).hexdigest(),
            "text": data.decode("utf-8")}


def teaching_documents():
    root = Path(__file__).parent
    if not (root / "START-HERE.md").is_file():
        root = root.parent
    return [snapshot(root / name) for name in ["START-HERE.md", "worked-example.md"]]


def record(args):
    question_bytes, questions = read_json(Path(__file__).with_name("questions.json"))
    documents = teaching_documents()
    _, response = read_json(args.response)
    if not isinstance(response, dict) or not response:
        raise ValueError("Response must be a nonempty JSON object.")
    if "question_version" in response and response["question_version"] != questions["version"]:
        raise ValueError("Response question_version differs from this lesson; retain the old record and use the current template.")
    if args.assistance != "none":
        details = response.get("assistance_details")
        if not isinstance(details, str) or not details.strip():
            raise ValueError("Assisted saves require nonempty assistance_details describing the actual help, "
                             "including hint file(s)/level(s), checker feedback or solution material used.")
    manifest_bytes, manifest = read_json(args.manifest)
    if not isinstance(manifest, dict) or not manifest:
        raise ValueError("Manifest must be a nonempty JSON object.")
    entry = {"schema": "re-lab-m06-attempt-v1", "id": str(uuid4()),
             "recordedAt": datetime.now(timezone.utc).isoformat(),
             "question": {"version": questions["version"], "stage": args.stage,
                          "prompt": questions["questions"][args.stage],
                          "sourceSha256": hashlib.sha256(question_bytes).hexdigest(),
                          "lessonSha256": documents[0]["sha256"], "lessonText": documents[0]["text"],
                          "documents": documents},
             "response": response, "assistance": args.assistance,
             "manifestSha256": hashlib.sha256(manifest_bytes).hexdigest(),
             "targetManifest": manifest,
             "artifact": snapshot(args.artifact) if args.artifact else None,
             "notice": "Self-reported local evidence; no correctness or independent-learning certification."}
    serialized = json.dumps(entry, indent=2, allow_nan=False) + "\n"
    if len(serialized.encode("utf-8")) > LIMIT:
        raise ValueError("Complete record exceeds 2 MiB; reduce new response or source size. Earlier records are unchanged.")
    workspace = Path(args.workspace)
    if workspace.is_symlink():
        raise ValueError("Workspace must not be a symlink.")
    workspace.mkdir(parents=True, exist_ok=True)
    target = workspace / f"{entry['id']}.json"
    created = False
    try:
        with target.open("x", encoding="utf-8") as stream:
            created = True
            stream.write(serialized)
    except OSError:
        if created:
            target.unlink(missing_ok=True)
        raise
    print(f"Saved new attempt: {target}")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest="command", required=True)
    save = commands.add_parser("record")
    save.add_argument("--workspace", required=True)
    save.add_argument("--stage", required=True, choices=STAGES)
    save.add_argument("--response", required=True)
    save.add_argument("--manifest", required=True)
    save.add_argument("--assistance", required=True, choices=["none", *HINTS, "checker", "solution"])
    save.add_argument("--artifact", help="Optional model or report source, copied into this new record.")
    listing = commands.add_parser("list")
    listing.add_argument("--workspace", required=True)
    args = parser.parse_args()
    if args.command == "record":
        record(args)
        return
    workspace = Path(args.workspace)
    if not workspace.is_dir():
        raise ValueError("Workspace directory does not exist; use the path containing your saved records.")
    for path in sorted(workspace.glob("*.json")):
        print(path)


if __name__ == "__main__":
    try:
        main()
    except (OSError, ValueError, KeyError, TypeError, RecursionError) as error:
        print(f"Not saved/read: {error}", file=sys.stderr)
        sys.exit(2)

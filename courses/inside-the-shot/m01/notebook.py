#!/usr/bin/env python3
"""Preserve local learner evidence; this tool never scores an explanation."""
import argparse
import hashlib
import json
from pathlib import Path
import sys
from datetime import datetime, timezone
from uuid import uuid4

LIMIT = 2 * 1024 * 1024


def read_bytes(path):
    path = Path(path)
    if path.is_symlink() or not path.is_file():
        raise ValueError(f"Expected a regular file: {path.name}")
    with path.open('rb') as stream:
        data = stream.read(LIMIT + 1)
    if len(data) > LIMIT:
        raise ValueError(f"File exceeds 2 MiB: {path.name}")
    return data


def read_json(path):
    data = read_bytes(path)
    def reject(value):
        raise ValueError(f"Non-finite JSON number: {value}")
    return data, json.loads(data, parse_constant=reject)


def teaching_documents(stage):
    """Snapshot the exact prompt and prerequisite teaching the learner used."""
    flat = Path(__file__).with_name('START-HERE.md').is_file()
    root = Path(__file__).parent if flat else Path(__file__).parents[1]
    main = 'START-HERE.md' if flat else 'milestones/01-cart.md'
    challenge = 'crossing.md' if flat else 'milestones/01-crossing.md'
    primary = challenge if stage == 'challenge' else main
    supporting = ['methods.md']
    if stage == 'challenge':
        supporting.append(main)
    documents = []
    for name in [primary, *supporting]:
        data = read_bytes(root / name)
        documents.append({'name': name, 'sha256': hashlib.sha256(data).hexdigest(),
                          'text': data.decode('utf-8')})
    return documents


def record(args):
    question_bytes, questions = read_json(Path(__file__).with_name('questions.json'))
    prompt = questions['questions'][args.stage]
    documents = teaching_documents(args.stage)
    lesson = documents[0]
    _, response = read_json(args.response)
    if not isinstance(response, dict) or not response:
        raise ValueError('Response must be a nonempty JSON object.')
    if 'question_version' in response and response['question_version'] != questions['version']:
        raise ValueError('Response question_version differs from this lesson; retain the old record and use the current template.')
    manifest_bytes, manifest = read_json(args.manifest)
    artifact = None
    if args.artifact:
        data = read_bytes(args.artifact)
        artifact = {'name': Path(args.artifact).name, 'sha256': hashlib.sha256(data).hexdigest(), 'text': data.decode('utf-8')}
    entry = {'schema': 're-lab-attempt-v1', 'id': str(uuid4()),
             'recordedAt': datetime.now(timezone.utc).isoformat(),
             'question': {'version': questions['version'], 'stage': args.stage, 'prompt': prompt,
                          'sourceSha256': hashlib.sha256(question_bytes).hexdigest(),
                          'lessonSha256': lesson['sha256'], 'lessonText': lesson['text'],
                          'documents': documents},
             'response': response, 'assistance': args.assistance,
             'manifestSha256': hashlib.sha256(manifest_bytes).hexdigest(),
             'targetManifest': manifest, 'artifact': artifact,
             'notice': 'Self-reported local evidence; no correctness or independent-learning certification.'}
    serialized = json.dumps(entry, indent=2, allow_nan=False) + '\n'
    workspace = Path(args.workspace)
    if workspace.is_symlink():
        raise ValueError('Workspace must not be a symlink.')
    workspace.mkdir(parents=True, exist_ok=True)
    target = workspace / f"{entry['id']}.json"
    created = False
    try:
        with target.open('x', encoding='utf-8') as stream:
            created = True
            stream.write(serialized)
    except OSError:
        if created:
            target.unlink(missing_ok=True)
        raise
    print(f"Saved new attempt: {target}")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest='command', required=True)
    save = commands.add_parser('record')
    save.add_argument('--workspace', required=True)
    save.add_argument('--stage', required=True, choices=['prediction', 'model', 'transfer', 'challenge'])
    save.add_argument('--response', required=True)
    save.add_argument('--manifest', required=True)
    save.add_argument('--assistance', required=True, choices=['none', 'hint-1', 'hint-2', 'hint-3', 'solution'])
    save.add_argument('--artifact')
    listing = commands.add_parser('list')
    listing.add_argument('--workspace', required=True)
    args = parser.parse_args()
    if args.command == 'record':
        record(args)
        return
    for path in sorted(Path(args.workspace).glob('*.json')):
        print(path)


if __name__ == '__main__':
    try:
        main()
    except (OSError, ValueError, KeyError, TypeError) as error:
        print(f"Not saved: {error}", file=sys.stderr)
        sys.exit(2)

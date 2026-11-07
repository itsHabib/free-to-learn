#!/usr/bin/env python3
"""Run pinned Ghidra headlessly against one original teaching target.

This records actual tool output. It does not prove that a learner understands it,
or verify Ghidra's graphical interface. Never overwrite an earlier run.
"""

import argparse
import hashlib
import json
import os
from pathlib import Path
import platform
import re
import subprocess
import sys
import time


def digest(path):
    with path.open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()


def validate_evidence(evidence, target_name, symbols):
    """Validate a complete export, not merely a process exit or function name."""
    if not isinstance(evidence, dict) or evidence.get('schema') != 're-lab-ghidra-evidence-v1':
        raise ValueError('Incomplete or unknown Ghidra evidence schema')
    expected = {'program': target_name, 'format': 'Mac OS X Mach-O',
                'language': 'AARCH64:LE:64:AppleSilicon', 'compiler_spec': 'default'}
    for key, value in expected.items():
        if evidence.get(key) != value:
            raise ValueError(f'Ghidra evidence has unexpected {key}')
    if not isinstance(evidence.get('image_base'), str) or not re.fullmatch(r'[0-9a-fA-F]+', evidence['image_base']):
        raise ValueError('Ghidra evidence has no valid image base')
    functions = evidence.get('functions')
    if not isinstance(functions, list) or len(functions) != len(set(symbols)):
        raise ValueError('Ghidra evidence has an incomplete function list')
    found = set()
    for function in functions:
        if not isinstance(function, dict) or not isinstance(function.get('name'), str):
            raise ValueError('Ghidra evidence has an invalid function')
        name = function['name'].removeprefix('_')
        if name in found:
            raise ValueError('Ghidra evidence repeats a function')
        found.add(name)
        if not isinstance(function.get('entry'), str) or not re.fullmatch(r'[0-9a-fA-F]+', function['entry']):
            raise ValueError('Ghidra evidence has no function entry address')
        if not isinstance(function.get('signature'), str) or not function['signature'].strip():
            raise ValueError('Ghidra evidence has no function signature')
        code = function.get('decompiled_c')
        if not isinstance(code, str) or name not in code or '{' not in code or '}' not in code:
            raise ValueError('Ghidra evidence has no complete decompilation')
        instructions = function.get('instructions')
        if not isinstance(instructions, list) or not 1 <= len(instructions) <= 10000:
            raise ValueError('Ghidra evidence has no bounded instruction listing')
        for instruction in instructions:
            if (not isinstance(instruction, dict) or not isinstance(instruction.get('address'), str)
                    or not re.fullmatch(r'[0-9a-fA-F]+', instruction['address'])
                    or not isinstance(instruction.get('text'), str) or not instruction['text'].strip()):
                raise ValueError('Ghidra evidence contains an incomplete instruction')
    if found != {s.removeprefix('_') for s in symbols}:
        raise ValueError('Ghidra did not export every requested function')


def inspect(ghidra, java_home, target, output, symbols, project_root=None):
    ghidra, java_home, target, output = [Path(p).resolve() for p in (ghidra, java_home, target, output)]
    launcher = ghidra / 'support/analyzeHeadless'
    java = java_home / 'bin/java'
    for path in (launcher, java, target):
        if not path.is_file():
            raise ValueError(f'Required file is absent: {path}')
    properties_text = (ghidra / 'Ghidra/application.properties').read_text()
    if not re.search(r'^application.version=12\.1\.4\s*$', properties_text, re.MULTILINE):
        raise ValueError('This validated route requires Ghidra 12.1.4')
    if not symbols or any(not s.replace('_', '').isalnum() for s in symbols):
        raise ValueError('Name at least one simple function symbol from the supplied listing')
    script = Path(__file__).with_name('CourseEvidence.java')
    if not script.is_file():
        raise ValueError('CourseEvidence.java must be beside inspect_ghidra.py')
    project_root = Path(project_root).resolve() if project_root else output / 'project'
    if any(part.startswith('.') for part in project_root.parts):
        raise ValueError('Ghidra refuses project paths with hidden components. Use --project-root with a new ordinary path, for example /tmp/re-lab-project-01.')
    if project_root.exists():
        raise ValueError(f'Refusing existing project directory: {project_root}')
    output.mkdir(parents=True, exist_ok=False)
    project_root.mkdir(parents=True, exist_ok=False)
    for directory in ('state/home', 'state/settings', 'state/cache', 'state/tmp', 'state/prefs', 'state/system-prefs'):
        (output / directory).mkdir(parents=True, exist_ok=True)
    env = os.environ.copy()
    env['JAVA_HOME'] = str(java_home)
    env['PATH'] = str(java_home / 'bin') + os.pathsep + env.get('PATH', '')
    properties = {'user.home': 'home', 'application.settingsdir': 'settings',
                  'application.cachedir': 'cache', 'application.tempdir': 'tmp',
                  'java.util.prefs.userRoot': 'prefs', 'java.util.prefs.systemRoot': 'system-prefs'}
    # All launch-helper and analyzer JVMs use this run's own state directories.
    # JAVA_TOOL_OPTIONS is process-local; no shell profile or OS setting is edited.
    env['JAVA_TOOL_OPTIONS'] = ' '.join(f'-D{k}="{output / "state" / v}"' for k, v in properties.items())
    env['GHIDRA_HEADLESS_MAXMEM'] = '1G'
    command = [str(launcher), str(project_root), 're-lab', '-import', str(target),
               '-scriptPath', str(script.parent), '-postScript', script.name,
               str(output / 'evidence.json'), *symbols,
               '-max-cpu', '2', '-analysisTimeoutPerFile', '90',
               '-log', str(output / 'analysis.log'), '-scriptlog', str(output / 'script.log')]
    report = {'schema': 're-lab-ghidra-run-v1', 'status': 'running', 'command': command,
              'target': str(target), 'target_sha256': digest(target), 'symbols': symbols,
              'project_root': str(project_root),
              'platform': platform.platform(), 'python': sys.version,
              'script_sha256': digest(script), 'runner_sha256': digest(Path(__file__)),
              'application_properties_sha256': digest(ghidra / 'Ghidra/application.properties'),
              'limit': 'Headless tool execution only; native GUI, human interpretation and accessibility remain separate.'}
    started = time.monotonic()
    report_path = output / 'run.json'
    try:
        version = subprocess.run([str(java), '-version'], env=env, text=True, capture_output=True, timeout=20, check=True)
        report['java_version'] = version.stdout + version.stderr
        if not re.search(r'version "21(?:\.|\")', report['java_version']):
            raise ValueError('This validated route requires JDK21')
        with (output / 'console.log').open('x') as log:
            result = subprocess.run(command, env=env, stdout=log, stderr=subprocess.STDOUT, timeout=240)
        report['exit'] = result.returncode
        if result.returncode:
            raise ValueError(f'Ghidra exited {result.returncode}; preserve and inspect console.log')
        if not (output / 'evidence.json').is_file():
            raise ValueError('Ghidra produced no complete evidence.json; inspect script.log and console.log for a missing function or script failure')
        evidence = json.loads((output / 'evidence.json').read_text())
        validate_evidence(evidence, target.name, symbols)
        report['evidence_sha256'] = digest(output / 'evidence.json')
        report['status'] = 'passed'
    except (OSError, ValueError, subprocess.SubprocessError) as error:
        report['status'] = 'failed'
        report['error'] = str(error)
        raise
    finally:
        report['seconds'] = round(time.monotonic() - started, 3)
        report_path.write_text(json.dumps(report, indent=2) + '\n')
    return report_path


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--ghidra', required=True, help='Extracted Ghidra 12.1.4 directory')
    parser.add_argument('--java-home', required=True, help='JDK21 directory containing bin/java')
    parser.add_argument('--target', required=True, help='Original executable from an RE Lab student bundle')
    parser.add_argument('--out', required=True, help='New evidence directory; existing paths are refused')
    parser.add_argument('--symbol', action='append', required=True, help='Function to inspect; repeat for multiple functions')
    parser.add_argument('--project-root', help='New project directory without hidden path components; defaults to OUT/project')
    args = parser.parse_args()
    try:
        print(inspect(args.ghidra, args.java_home, args.target, args.out, args.symbol, args.project_root))
    except (OSError, ValueError, subprocess.SubprocessError) as error:
        parser.exit(1, f'Ghidra evidence run failed: {error}\n')


if __name__ == '__main__':
    main()

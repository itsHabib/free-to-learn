#!/usr/bin/env python3
"""Finite behavior check using the native reader as oracle. See assistance notice."""
import argparse
import hashlib
import json
from pathlib import Path
import random
import shlex
import subprocess
import sys
import tempfile
ROOT=Path(__file__).resolve().parent
if not (ROOT/'trail').is_file(): ROOT=ROOT.parent

def run(args,**kwargs):
    return subprocess.run(list(map(str,args)),capture_output=True,text=True,timeout=12,**kwargs)
def verify(root):
    manifest=json.loads((root/'manifest.json').read_text())
    for name,wanted in manifest['files'].items():
        if Path(name).name!=name: raise ValueError('Invalid manifest member')
        path=root/name
        if path.is_symlink() or hashlib.sha256(path.read_bytes()).hexdigest()!=wanted:
            raise ValueError('Target/fixture changed: restore the original bundle')

EVIDENCE_INPUT_LIMIT=16*1024
EVIDENCE_CASE_LIMIT=256
RULES={
    'valid': {'id':'VALID-DECODE', 'lesson':'feedback.md#valid-decode-contract',
              'explanation':'The native reader accepts this file. Preserve every declared entry and field, including signed values and opaque bytes.'},
    'malformed': {'id':'MALFORMED-REJECTION', 'lesson':'feedback.md#malformed-input-contract',
                  'explanation':'The native reader rejects this file. Raise ValueError for inconsistent or over-limit declarations, truncation, or trailing bytes; do not return partial data.'},
}

def save_feedback(failures,implementation,source_bytes,root,seed,evidence_dir):
    """Persist exact failing inputs before the temporary generated files disappear."""
    if len(failures)>EVIDENCE_CASE_LIMIT: raise ValueError('Feedback case limit exceeded')
    folder=Path(evidence_dir).absolute() if evidence_dir else Path(tempfile.mkdtemp(prefix='check-feedback-',dir=Path.cwd()))
    if evidence_dir: folder.mkdir(parents=True,exist_ok=False)
    (folder/'submitted.py').write_bytes(source_bytes)
    manifest=(root/'manifest.json').read_bytes()
    (folder/'target-manifest.json').write_bytes(manifest)
    entries=[]; replay=[]
    for index,(name,request,expected,observed) in enumerate(failures,1):
        data=bytes.fromhex(request['hex']) if 'hex' in request else Path(request['path']).read_bytes()
        if len(data)>EVIDENCE_INPUT_LIMIT: raise ValueError('Feedback input exceeds bounded evidence limit')
        filename=f'{index:03d}-{name}.trail'
        (folder/filename).write_bytes(data)
        replay.append({'hex':data.hex()} if 'hex' in request else {'path':filename})
        rule=RULES['valid' if 'ok' in expected else 'malformed']
        observed_text=json.dumps(observed,sort_keys=True,allow_nan=False)
        entries.append({'case':name,'input':filename,'inputBytes':len(data),
            'inputSha256':hashlib.sha256(data).hexdigest(),'api':'inspect' if 'hex' in request else 'inspect_file','rule':rule,
            'expected':expected,'observedSummary':observed_text[:2048],
            'observedSummaryTruncated':len(observed_text)>2048})
    report={'schema':'trail-check-feedback-v1','seed':seed,'submissionOriginalPath':str(Path(implementation).resolve()),
        'submissionSha256':hashlib.sha256(source_bytes).hexdigest(),
        'manifestSha256':hashlib.sha256(manifest).hexdigest(),'cases':entries,
        'notice':'Checker assistance. Exact inputs and original submitted source are retained; save a new notebook record before repair.'}
    (folder/'feedback.json').write_text(json.dumps(report,indent=2)+'\n')
    (folder/'replay.json').write_text(json.dumps(replay,indent=2)+'\n')
    return folder,entries

def check(implementation,root,seed=37,evidence_dir=None):
    verify(root)
    source_bytes=Path(implementation).read_bytes()
    if len(source_bytes)>2*1024*1024: raise ValueError('Submission source exceeds 2 MiB')
    if evidence_dir and Path(evidence_dir).exists(): raise ValueError('Feedback directory must be new; earlier attempts are unchanged')
    rng=random.Random(seed)
    with tempfile.TemporaryDirectory(prefix='trail-public-check-') as folder:
        folder=Path(folder); cases=[]
        def add(name,data):
            target=folder/(name+'.trail'); target.write_bytes(data)
            oracle=run([root/'trail','read',target])
            if oracle.returncode not in (0,2): raise ValueError('Native oracle failed')
            expected={'ok':json.loads(oracle.stdout)} if oracle.returncode==0 else {'rejected':True}
            cases.append((name,{'hex':data.hex()},expected))
            return target
        valid=[]
        for name in ['empty.trail','one.trail','markers.trail','opaque.trail','transfer.trail']:
            data=(root/name).read_bytes(); valid.append(data); add(name,data)
        groups=[[],[65535,-32768,255,16777215],[0,32767,0,1]]
        for count in [1,2,5,17,256,1024]:
            args=[]
            for _ in range(count): args.extend([rng.randrange(65536),rng.randrange(-32768,32768),rng.randrange(256),rng.randrange(16777216)])
            groups.append(args)
        for index,args in enumerate(groups):
            target=folder/f'generated-{index}.trail'
            written=run([root/'trail','write',target,*args])
            if written.returncode: raise ValueError('Native writer failed')
            data=target.read_bytes(); valid.append(data); add(f'valid-{index}',data)
        base=valid[2]
        for size in range(len(base)): add(f'truncated-{size}',base[:size])
        add('trailing-zero',base+b'\0'); add('over-limit',base*300)
        # Systematic byte mutations exercise the envelope without an offset table.
        # If native read still accepts a mutation (e.g. opaque bytes), compare its full result.
        for pos in range(len(base)):
            changed=bytearray(base); changed[pos]^=0xff
            add(f'byte-mutation-{pos}',bytes(changed))
        file_target=folder/'oversized-file.trail'; file_target.write_bytes(b'X'*9000)
        cases.append(('bounded-file-read',{'path':str(file_target)},{'rejected':True}))
        requests=[request for _,request,_ in cases]
        worker=Path(__file__).with_name('worker.py')
        result=run([sys.executable,'-I',worker,Path(implementation).resolve()],input=json.dumps(requests))
        if result.returncode:
            reason=result.stderr.strip().splitlines()[-1] if result.stderr.strip() else 'no result'
            print('Check could not complete: '+reason,file=sys.stderr)
            print('Finish inspect and inspect_file; see START-HERE.md. Save this attempt before repair.',file=sys.stderr)
            return 2
        try: answers=json.loads(result.stdout)
        except ValueError: raise ValueError('Submission printed extra output or invalid JSON')
        if len(answers)!=len(cases): raise ValueError('Submission result count differs')
        failures=[]
        for (name,request,expected),observed in zip(cases,answers):
            passed=('rejected' in observed) if 'rejected' in expected else observed==expected
            if not passed: failures.append((name,request,expected,observed))
        if failures:
            folder,entries=save_feedback(failures,implementation,source_bytes,root,seed,evidence_dir)
            for entry in entries[:4]:
                rule=entry['rule']
                print(f"Mismatch {entry['case']}: {rule['id']} — {rule['explanation']}")
                print(f"Input: {folder/entry['input']} ({entry['inputBytes']} bytes, sha256 {entry['inputSha256']})")
                print(f"Review {rule['lesson']}; observed {entry['observedSummary'][:320]}")
            print(f'{len(failures)}/{len(cases)} cases disagree. Every failing input is retained in feedback.json; keep the first record before repair.')
            print('Feedback saved: '+str(folder))
            print('Replay saved submission: cd '+shlex.quote(str(folder))+' && '+shlex.join([sys.executable,'-I',str(Path(__file__).resolve().with_name('worker.py')),'submitted.py'])+' < replay.json')
            return 1
        print(f'{len(cases)} finite checks agree. Reasoning and unaided work are not certified.')
        return 0
if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('implementation'); parser.add_argument('--root',type=Path,default=ROOT)
    parser.add_argument('--seed',type=int,default=37)
    parser.add_argument('--evidence-dir',type=Path,help='New feedback directory; on a mismatch the default creates check-feedback-* in the current directory')
    args=parser.parse_args()
    try: sys.exit(check(args.implementation,args.root.resolve(),args.seed,args.evidence_dir))
    except (OSError,ValueError,KeyError,subprocess.SubprocessError) as error:
        parser.exit(2,f'Check unavailable: {error}. Restore the target/manifest or inspect the submission; START-HERE.md has recovery steps.\n')

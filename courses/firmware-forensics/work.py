#!/usr/bin/env python3
"""Preserve three sources in a fresh, numbered attempt. Never overwrite."""
from pathlib import Path
from hashlib import sha256
from datetime import datetime,timezone
import argparse,json,re,sys
ROOT=Path(__file__).resolve().parent
def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('name');p.add_argument('--from-attempt',type=Path);p.add_argument('--root',type=Path,default=ROOT/'attempts')
    a=p.parse_args()
    if not re.fullmatch(r'[0-9]{3}-[a-z][a-z0-9-]*',a.name):p.error('Use NNN-lowercase-name')
    original=a.from_attempt
    files={name:(original/name if original else ROOT/path).read_bytes() for name,path in [('parser.py','lab/starter/parser.py'),('analysis.py','lab/starter/analysis.py'),('trust.mjs','trust/starter/trust.mjs')]}
    if original: files['help.json']=(original/'help.json').read_bytes()
    else: files['help.json']=b'{"help_used":[],"notes":"Record help before revising."}\n'
    a.root.mkdir(parents=True,exist_ok=True);dest=a.root/a.name;dest.mkdir(exist_ok=False)
    for name,data in files.items():(dest/name).write_bytes(data)
    (dest/'attempt.json').write_text(json.dumps({'schema':1,'name':a.name,'created':datetime.now(timezone.utc).isoformat(),'from':str(original) if original else 'starters','initial_sha256':{n:sha256(b).hexdigest() for n,b in files.items()},'instruction':'Keep the first submitted sources and outputs; create another numbered attempt before repair.'},indent=2)+'\n')
    print(dest.resolve())
if __name__=='__main__':
    try:main()
    except OSError as e: print('Attempt refused: '+str(e),file=sys.stderr);sys.exit(2)

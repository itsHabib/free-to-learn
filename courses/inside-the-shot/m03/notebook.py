#!/usr/bin/env python3
"""Append-only local evidence snapshots. Self reports are not learning certification."""
import argparse
import base64
from datetime import datetime,timezone
import hashlib
import json
from pathlib import Path
import shutil
import sys
from uuid import uuid4
LIMIT=2*1024*1024
ROOT=Path(__file__).resolve().parent
if not (ROOT/'START-HERE.md').is_file(): ROOT=ROOT.parent

def regular(path):
    path=Path(path).absolute()
    if any(p.is_symlink() for p in [path,*path.parents]): raise ValueError('Symlink paths are not supported')
    if not path.is_file(): raise ValueError(f'Expected regular file: {path.name}')
    with path.open('rb') as stream: data=stream.read(LIMIT+1)
    if len(data)>LIMIT: raise ValueError('Input exceeds 2 MiB')
    return data

def parsed(path):
    data=regular(path)
    def reject(value): raise ValueError('Nonfinite JSON is not supported')
    value=json.loads(data,parse_constant=reject)
    json.dumps(value,allow_nan=False)
    return data,value

def snap(path):
    data=regular(path)
    try: content={'encoding':'utf-8','text':data.decode('utf-8')}
    except UnicodeDecodeError: content={'encoding':'base64','data':base64.b64encode(data).decode('ascii')}
    return {'name':Path(path).name,'sha256':hashlib.sha256(data).hexdigest(),**content}

def directory(path,new=False):
    path=Path(path).absolute()
    if any(p.is_symlink() for p in [path,*path.parents]): raise ValueError('Symlink workspace is not supported')
    if new: path.mkdir(parents=True,exist_ok=False)
    elif not path.is_dir(): raise ValueError('Workspace not found')
    return path

def record(args):
    qbytes,questions=parsed(Path(__file__).with_name('questions.json'))
    if args.stage not in questions['questions']: raise ValueError('Unknown question stage')
    _,response=parsed(args.response)
    if not isinstance(response,dict) or response.get('question_version')!=questions['version']:
        raise ValueError('Use the current response question_version; earlier records remain unchanged')
    if not isinstance(response.get('claim'),str) or not response['claim'].strip():
        raise ValueError('Write a nonempty claim before saving')
    details=response.get('assistance_details')
    if args.assistance!='none' and (not isinstance(details,str) or not details.strip()):
        raise ValueError('Non-none assistance needs nonempty assistance_details naming actual help')
    mbytes,manifest=parsed(args.manifest)
    if not isinstance(manifest,dict) or not manifest.get('files'): raise ValueError('Missing target manifest files')
    entry={'schema':'trail-attempt-v1','id':str(uuid4()),'recordedAt':datetime.now(timezone.utc).isoformat(),
      'question':{'version':questions['version'],'stage':args.stage,'prompt':questions['questions'][args.stage],
        'sourceText':qbytes.decode(),'sourceSha256':hashlib.sha256(qbytes).hexdigest()},
      'teaching':[snap(p) for p in sorted(ROOT.glob('*.md'))],
      'response':response,'assistance':args.assistance,'manifest':manifest,
      'manifestText':mbytes.decode(),'manifestSha256':hashlib.sha256(mbytes).hexdigest(),
      'artifacts':[snap(p) for p in args.artifact],
      'notice':'Self-reported evidence. Sources and assistance preserved; no independent-learning claim.'}
    text=json.dumps(entry,indent=2,allow_nan=False)+'\n'
    if len(text.encode())>LIMIT: raise ValueError('Record exceeds 2 MiB; attach smaller evidence')
    workspace=Path(args.workspace).absolute()
    if any(p.is_symlink() for p in [workspace,*workspace.parents]): raise ValueError('Symlink workspace is not supported')
    workspace.mkdir(parents=True,exist_ok=True)
    target=workspace/(entry['id']+'.json')
    with target.open('x') as stream: stream.write(text)
    print('Saved new attempt: '+str(target))

def records(path):
    workspace=directory(path)
    result=[]
    for p in sorted(workspace.glob('*.json')):
        _,entry=parsed(p)
        if entry.get('schema')!='trail-attempt-v1': raise ValueError('Unknown record schema')
        result.append((p,entry))
    return result

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    sub=parser.add_subparsers(dest='command',required=True)
    save=sub.add_parser('record'); save.add_argument('--workspace',required=True)
    save.add_argument('--stage',required=True); save.add_argument('--response',required=True)
    save.add_argument('--manifest',required=True); save.add_argument('--artifact',action='append',default=[])
    save.add_argument('--assistance',required=True,choices=['none','hint-1','hint-2','hint-3','checker','solution'])
    listing=sub.add_parser('list'); listing.add_argument('--workspace',required=True)
    export=sub.add_parser('export'); export.add_argument('--workspace',required=True); export.add_argument('--out',required=True)
    args=parser.parse_args()
    if args.command=='record': record(args); return
    items=records(args.workspace)
    if args.command=='list':
        for path,entry in items: print(entry['id'],entry['question']['stage'],entry['assistance'],entry['response']['claim'])
        return
    out=directory(args.out,new=True)
    hashes={}
    for path,_ in items:
        data=regular(path); (out/path.name).write_bytes(data); hashes[path.name]=hashlib.sha256(data).hexdigest()
    # The export index is outside the record directory so list/resume stays byte-for-byte compatible.
    (out.parent/(out.name+'-hashes.txt')).write_text('\n'.join(f'{v}  {k}' for k,v in hashes.items())+'\n')
    print(f'Exported {len(items)} unchanged records to {out}')
if __name__=='__main__':
    try: main()
    except (OSError,ValueError,KeyError,TypeError,RecursionError) as error:
        print(f'Not saved/read: {error}',file=sys.stderr); sys.exit(2)

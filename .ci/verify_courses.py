#!/usr/bin/env python3
"""Existing clean-course runner, with mode preservation and pinned evidence reuse."""
import argparse, concurrent.futures, hashlib, json, os, pathlib, re, stat, subprocess, sys, time, zipfile

def run(argv, cwd, timeout=60):
    try:
        p=subprocess.run(argv,cwd=cwd,capture_output=True,text=True,timeout=timeout)
        return {'argv':argv,'exit':p.returncode,'stdout':p.stdout,'stderr':p.stderr}
    except (OSError,subprocess.TimeoutExpired) as e:
        return {'argv':argv,'exit':None,'error':str(e)}

def within(root,name):
    p=(root/name).resolve()
    if not p.is_relative_to(root.resolve()):raise ValueError('path escapes package: '+name)
    return p

def pinned_json(spec):
    data=pathlib.Path(spec['path']).read_bytes()
    if hashlib.sha256(data).hexdigest()!=spec['sha256']:raise ValueError('retained evidence hash mismatch')
    return json.loads(data)

def value_at(obj,key):
    for part in key.split('.'):obj=obj[part]
    return obj

def retained_result(course,digest):
    spec=course['retained_evidence']
    if not re.fullmatch('[0-9a-f]{40}',spec['source_commit']):raise ValueError('full retained source commit required')
    blob=spec['source_archive_blob']
    if pathlib.PurePosixPath(blob).is_absolute() or '..' in pathlib.PurePosixPath(blob).parts:raise ValueError('invalid retained archive blob')
    data=subprocess.check_output(['git','-C',spec['source_repository'],'show',spec['source_commit']+':'+blob],stderr=subprocess.PIPE,timeout=30)
    if hashlib.sha256(data).hexdigest()!=digest:raise ValueError('current archive differs from qualified Git object')
    document=pinned_json(spec['contract'])
    contract=next(x for x in document['contracts'] if x['course']==course['id'])
    if contract['finiteTerminalFlowDisposition']!=spec['disposition']:raise ValueError('retained disposition mismatch')
    if contract['unexpectedLearnerFacingFailures']:raise ValueError('retained learner failures remain')
    commands=contract['actualCommandReceipts']
    if not commands or any(x['exit']!=x['expectedExit'] for x in commands):raise ValueError('retained command failure or empty evidence')
    for key,expected in spec['result_assertions'].items():
        if value_at(contract['result'],key)!=expected:raise ValueError('retained result differs: '+key)
    return {'stage':'retained_exact_byte_terminal_qualification','pass':True,'source_commit':spec['source_commit'],'contract':spec['contract'],'disposition':spec['disposition'],'command_receipts':len(commands),'classification':contract['classification'],'execution_this_invocation':'not_run; prior pinned outcomes reused','qualification':spec.get('qualification','')}

def extract_package(package,root):
    modes=[]
    with zipfile.ZipFile(package) as z:
        if sum(i.file_size for i in z.infolist())>256*1024*1024:raise ValueError('package too large for bounded verification')
        seen=set()
        for i in z.infolist():
            dest=within(root,i.filename)
            if dest in seen:raise ValueError('duplicate archive path')
            seen.add(dest)
            mode=i.external_attr>>16
            if stat.S_ISLNK(mode):raise ValueError('archive symlink not accepted')
            if mode&0o7000:raise ValueError('special archive permissions not accepted')
        for i in z.infolist():
            dest=within(root,i.filename)
            if i.is_dir():dest.mkdir(parents=True,exist_ok=True);continue
            dest.parent.mkdir(parents=True,exist_ok=True)
            with dest.open('xb') as f:f.write(z.read(i))
            # Git/ZIP native project entrypoints must remain executable. Mode zero
            # is the existing Node packager's portable default, not a chmod request.
            mode=(i.external_attr>>16)&0o777 or 0o644
            dest.chmod(mode)
            if mode&0o111:modes.append(i.filename)
    return modes

def verify(course,source,output,reuse_evidence=False):
    result={'id':course['id'],'checks':[],'status':'incomplete','learner_completion':'not_run'}
    try:
        package=within(source,course['archive']);digest=hashlib.sha256(package.read_bytes()).hexdigest();result['sha256']=digest
        if digest!=course['sha256']:raise ValueError('archive hash mismatch; review and repin explicitly')
        if reuse_evidence and course.get('retained_evidence'):
            result['checks'].append(retained_result(course,digest));result['status']='pass'
            result['evidence_mode']='inherited_exact_bytes';result['course_programs_executed_this_invocation']=False
        else:
            root=output/course['id'];root.mkdir();result['extraction_root']=str(root)
            result['executable_members_preserved']=extract_package(package,root)
            cwd=within(root,course.get('root','.'))
            for p in sorted(root.rglob('*')):
                if p.suffix in ('.mjs','.js'):
                    q=run(['node','--check',str(p)],cwd)
                    result['checks'].append({'stage':'syntax','file':str(p.relative_to(root)),'pass':q['exit']==0,**q})
                elif p.suffix=='.py':
                    try:compile(p.read_bytes(),str(p),'exec');ok=True;error=None
                    except Exception as e:ok=False;error=str(e)
                    result['checks'].append({'stage':'syntax','file':str(p.relative_to(root)),'pass':ok,'error':error})
            for check in course.get('commands',[]):
                q=run(check['argv'],cwd,check.get('timeout',60));text=q.get('stdout','')+'\n'+q.get('stderr','');expected=check.get('exit',0)
                if expected!=0 and not check.get('match'):raise ValueError('expected failure requires diagnostic pattern')
                ok=q['exit']==expected and (not check.get('match') or re.search(check['match'],text) is not None)
                result['checks'].append({'stage':check['stage'],'pass':ok,'expectation':check,**q})
            if any(not x['pass'] for x in result['checks']):result['status']='fail'
            elif course.get('coverage_complete') is True and course.get('commands'):result['status']='pass'
            else:result['status']='partial'
            result['evidence_mode']='current_commands';result['course_programs_executed_this_invocation']=bool(course.get('commands'))
        result['unverified']=course.get('unverified',[])
    except Exception as e:result.update(status='blocked',error=str(e))
    (output/(course['id']+'.json')).write_text(json.dumps(result,indent=2)+'\n')
    return result

def main():
    p=argparse.ArgumentParser();p.add_argument('--manifest',required=True);p.add_argument('--source',required=True);p.add_argument('--output',required=True);p.add_argument('--jobs',type=int,default=2);p.add_argument('--course',action='append');p.add_argument('--clone',action='store_true');p.add_argument('--reuse-evidence',action='store_true');args=p.parse_args()
    manifest=json.loads(pathlib.Path(args.manifest).read_text());out=pathlib.Path(args.output).resolve();out.mkdir(parents=True,exist_ok=False)
    source=pathlib.Path(args.source).resolve();clone={'status':'not_run','reason':'artifact verification is not public clone evidence'}
    if args.clone:
        spec=manifest.get('git')
        if not spec:raise SystemExit('No approved git remote/commit configured; cannot claim clean clone')
        source=out/'clone';q=run(['git','clone','--no-local','--no-checkout',spec['remote'],str(source)],out,180)
        if q['exit']!=0:raise SystemExit(json.dumps(q))
        q=run(['git','checkout','--detach',spec['commit']],source)
        if q['exit']!=0:raise SystemExit(json.dumps(q))
        head=run(['git','rev-parse','HEAD'],source)
        if head['stdout'].strip()!=spec['commit']:raise SystemExit('Git revision does not match pinned full commit')
        clone={'status':'pass','remote':spec['remote'],'commit':spec['commit'],'access':spec.get('access','unverified')}
    courses=[c for c in manifest['courses'] if not args.course or c['id'] in args.course]
    if not courses:raise SystemExit('No matching courses')
    with concurrent.futures.ThreadPoolExecutor(max_workers=max(1,min(args.jobs,4))) as pool:
        results=list(pool.map(lambda c:verify(c,source,out,args.reuse_evidence),courses))
    summary={'created_utc':time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime()),'clone':clone,'courses':[{k:q.get(k) for k in ('id','status','evidence_mode','course_programs_executed_this_invocation','learner_completion','error')} for q in results],'full_acceptance':False,'public_base_revision':manifest.get('public_base_revision')}
    (out/'summary.json').write_text(json.dumps(summary,indent=2)+'\n');print(json.dumps(summary,indent=2))
    return 1 if any(q['status'] in ('fail','blocked') for q in results) else 2 if any(q['status']=='partial' for q in results) else 0
if __name__=='__main__':sys.exit(main())

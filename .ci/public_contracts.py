#!/usr/bin/env python3
"""Public setup/interface regressions; deliberately not a learner completion grade."""
import argparse,hashlib,json,os,pathlib,stat,sys,zipfile
from verify_courses import verify

def archive_matches_source(course,source):
    archive=source/course['archive'];direct=source/course['direct_root'];prefix=course.get('archive_prefix','')
    expected={p.relative_to(direct).as_posix():p for p in direct.rglob('*') if p.is_file()}
    with zipfile.ZipFile(archive) as z:
        names={}
        for i in z.infolist():
            if not i.filename.startswith(prefix) or i.is_dir() or stat.S_ISLNK(i.external_attr>>16):raise ValueError('Unexpected archive entry')
            name=i.filename[len(prefix):]
            if name in names:raise ValueError('Duplicate archive member')
            names[name]=i
        if set(names)!=set(expected):raise ValueError('Archive/direct course inventory differs')
        for name,i in names.items():
            if z.read(i)!=expected[name].read_bytes():raise ValueError('Archive is stale for changed course file: '+name)
            mode=(i.external_attr>>16)&0o777 or 0o644
            if bool(expected[name].stat().st_mode&0o111)!=bool(mode&0o111):raise ValueError('Archive/source executable bit differs: '+name)

def main():
    p=argparse.ArgumentParser();p.add_argument('--course',required=True);p.add_argument('--output',required=True);a=p.parse_args()
    source=pathlib.Path.cwd();course=next(c for c in json.loads((source/'.ci/courses.json').read_text())['courses'] if c['id']==a.course)
    out=pathlib.Path(a.output).resolve();out.mkdir(parents=True,exist_ok=False)
    try:
        archive_matches_source(course,source)
        result=verify(course,source,out)
        passed=result['status'] not in ['blocked','fail'] and bool(result['checks']) and all(c['pass'] for c in result['checks'])
    except Exception as e:result={'status':'blocked','error':str(e),'checks':[]};passed=False
    summary={'course':a.course,'profile':'public-setup-interface-regression','configured_checks_passed':passed,'qualification_status':result['status'],'full_exercise_capstone_completion':False,'blind_trial':False,'retained_private_evidence_used':False,'source_archive_binding':'pass' if result['status']!='blocked' else 'blocked','archive':course['archive'],'sha256':course['sha256'],'checks':[{'stage':c['stage'],'passed':c['pass'],'observed_exit':c.get('exit')} for c in result['checks']],'coverage_limits':course['unverified'],'error':result.get('error')}
    path=out/(a.course+'.summary.json');path.write_text(json.dumps(summary,indent=2)+'\n')
    step=os.environ.get('GITHUB_STEP_SUMMARY')
    if step:
        with open(step,'a') as f:f.write('## '+a.course+' public contracts\n\nConfigured checks: '+('PASS' if passed else 'FAIL')+'. Full learner project/capstone completion: not established by this public CI job. No private learner/reference fixture is used.\n')
    print(json.dumps(summary,indent=2));return 0 if passed else 1
if __name__=='__main__':sys.exit(main())

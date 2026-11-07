#!/usr/bin/env python3
"""Run the frozen core checks with macOS's canonical temporary directory."""
import argparse,json,os,subprocess,sys,tempfile
from pathlib import Path
ROOT=Path(__file__).resolve().parent
def main():
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('attempt',type=Path);a=p.parse_args()
    attempt=a.attempt.resolve(strict=True)
    env=dict(os.environ,TMPDIR=str(Path(tempfile.gettempdir()).resolve()))
    commands=[['-m','unittest','discover','-s','checks','-v'],
      ['checks/check_parser.py','--parser',str(attempt/'parser.py')],
      ['checks/check_submission.py','--parser',str(attempt/'parser.py'),'--analysis',str(attempt/'analysis.py')],
      ['checks/check_investigation.py','--parser',str(attempt/'parser.py'),'--analysis',str(attempt/'analysis.py')]]
    results=[]
    for command in commands:
        r=subprocess.run([sys.executable,*command],cwd=ROOT/'lab',env=env,capture_output=True,text=True)
        results.append({'command':[sys.executable,*command],'exit':r.returncode,'stdout':r.stdout,'stderr':r.stderr})
    print(json.dumps({'schema':1,'status':'pass' if all(r['exit']==0 for r in results) else 'fail','TMPDIR':env['TMPDIR'],'results':results},indent=2))
    return 0 if all(r['exit']==0 for r in results) else 1
if __name__=='__main__':sys.exit(main())

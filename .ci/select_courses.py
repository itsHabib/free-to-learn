#!/usr/bin/env python3
"""Select changed course contracts using Git metadata, without extra actions."""
import argparse,json,os,pathlib,re,subprocess

def select_paths(paths,courses):
    shared=any(p.startswith(('.ci/','.github/workflows/','LICENSES/')) or p in {'README.md','START-HERE.md','CI.md','LICENSE.md'} for p in paths)
    chosen=[]
    for c in courses:
        if shared or any(p.startswith(c['direct_root']+'/') or p in {c['archive'],c['archive']+'.sha256'} for p in paths):chosen.append(c)
    unknown=[p for p in paths if p.startswith('courses/') and not any(p.startswith(c['direct_root']+'/') for c in courses)]
    if unknown:raise ValueError('Changed course has no public contract: '+unknown[0])
    return {'include':[{'id':c['id'],'runner':c['runner']} for c in chosen]},shared

def main():
    p=argparse.ArgumentParser();p.add_argument('--event');p.add_argument('--output');a=p.parse_args()
    courses=json.loads(pathlib.Path('.ci/courses.json').read_text())['courses']
    event=json.loads(pathlib.Path(a.event or os.environ['GITHUB_EVENT_PATH']).read_text())
    kind=os.environ.get('GITHUB_EVENT_NAME');base=event.get('before');head=event.get('after') or os.environ.get('GITHUB_SHA')
    if kind=='pull_request':base=event['pull_request']['base']['sha'];head=event['pull_request']['head']['sha']
    force=kind=='workflow_dispatch' or not base or base=='0'*40
    if not force:
        if not all(re.fullmatch('[0-9a-f]{40}',s or '') for s in [base,head]):raise ValueError('Invalid Git comparison identity')
        q=subprocess.run(['git','cat-file','-e',base+'^{commit}'],capture_output=True)
        force=q.returncode!=0
    if force:paths=['.ci/courses.json']
    else:paths=subprocess.check_output(['git','diff','--name-only',base,head,'--'],text=True).splitlines()
    matrix,shared=select_paths(paths,courses)
    result={'matrix':matrix,'count':len(matrix['include']),'shared':shared,'base':base,'head':head,'full_matrix':force or shared}
    output=a.output or os.environ.get('GITHUB_OUTPUT')
    if output:
        with open(output,'a') as f:
            f.write('matrix='+json.dumps(matrix,separators=(',',':'))+'\ncount='+str(result['count'])+'\nshared='+str(shared).lower()+'\n')
    print(json.dumps(result,indent=2))
if __name__=='__main__':main()

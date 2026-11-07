#!/usr/bin/env python3
"""Bounded unfamiliar-input integration check, not full-course certification."""
import argparse
from copy import deepcopy
from datetime import datetime, timezone
from hashlib import sha256
import json
from pathlib import Path
import sys
import uuid
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT))
from fwcourse.container import FormatError
from fwcourse.evidence import inspect_file,inspect_bytes,load_json
from fwcourse.runner import load_analysis,load_parser


def main():
    ap=argparse.ArgumentParser(description=__doc__);ap.add_argument('--parser',required=True);ap.add_argument('--analysis',required=True);args=ap.parse_args()
    report={'run_id':str(uuid.uuid4()),'created_at_utc':datetime.now(timezone.utc).isoformat(),'checks':[],'status':'fail'}
    def check(name,body):
        try:body();report['checks'].append({'check':name,'result':'pass'})
        except Exception as exc:report['checks'].append({'check':name,'result':'fail','detail':f'{type(exc).__name__}: {exc}'})
    def equal(a,b):
        if a!=b:raise AssertionError(f'expected {b!r}; got {a!r}')
    try:
        parser,report['parser_sha256']=load_parser(args.parser);analysis,report['analysis_sha256']=load_analysis(args.analysis)
        f=ROOT/'fixtures/case-study'
        a=inspect_file(f/'capture-a.efw',f/'capture-a.json',f/'policy.json',parser_module=parser)
        b=inspect_file(f/'capture-b.efw',f/'capture-b.json',f/'policy.json',parser_module=parser)
        check('baseline evidence axes',lambda:equal(analysis.summarize_trust(a),{'integrity':'match','manifest':'match','origin':'unverified','policy':'pass'}))
        check('new evidence axes distinguish self-consistency from policy',lambda:equal(analysis.summarize_trust(b),{'integrity':'match','manifest':'match','origin':'unverified','policy':'fail'}))
        check('named local-policy finding',lambda:equal(b['policy_findings'],['config_policy_mismatch:boot_mode']))
        expected=[{'name':n,'status':s,'fields_changed':fields} for n,s,fields in [('boot','unchanged',[]),('calibration','content_changed',['sha256']),('config','content_changed',['sha256']),('legacy-notes','removed',[]),('readme','added',[]),('runtime','metadata_changed',['version'])]]
        check('unfamiliar identity-based release changes',lambda:equal(analysis.compare_components(a['components'],b['components']),expected))
        def partial():
            try:parser.parse_container((f/'capture-partial.efw').read_bytes())
            except FormatError:return
            raise AssertionError('partial capture must not be silently repaired')
        check('partial capture rejected before comparison',partial)
        def policy_change():
            policy=load_json(f/'policy.json');policy['minimum_release']=12
            changed=inspect_bytes((f/'capture-a.efw').read_bytes(),load_json(f/'capture-a.json'),policy,parser_module=parser)
            equal(changed['policy_findings'],['release_below_minimum'])
            equal(analysis.summarize_trust(changed),{'integrity':'match','manifest':'match','origin':'unverified','policy':'fail'})
        check('changed release-floor requirement',policy_change)
        report['input_sha256']={name:sha256((f/name).read_bytes()).hexdigest() for name in ['capture-a.efw','capture-a.json','capture-b.efw','capture-b.json','policy.json']}
        if all(c['result']=='pass' for c in report['checks']):report['status']='pass'
    except Exception as exc:report['load_or_intake_error']=f'{type(exc).__name__}: {exc}'
    report['passed']=sum(c['result']=='pass' for c in report['checks']);report['total']=len(report['checks'])
    print(json.dumps(report,indent=2,sort_keys=True));return 0 if report['status']=='pass' else 1


if __name__=='__main__':sys.exit(main())

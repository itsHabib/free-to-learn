#!/usr/bin/env python3
"""Trace actual inspect-loop locals; no inferred or substituted values."""
import importlib.util
from pathlib import Path
import sys

def trace_file(module_path,path):
    module_path=Path(module_path).resolve()
    spec=importlib.util.spec_from_file_location('candidate',module_path)
    module=importlib.util.module_from_spec(spec); spec.loader.exec_module(module)
    lines=module_path.read_text().splitlines()
    guards={i for i,line in enumerate(lines,1) if line.strip().startswith('if cursor+WIDTH>end:')}
    if not guards: raise ValueError('Expected the supplied loop guard; use this before changing the algorithm')
    def observe(frame,event,arg):
        if frame.f_code.co_filename==str(module_path) and event=='line' and frame.f_lineno in guards:
            state={k:frame.f_locals[k] for k in ['count','width','payload','index','cursor','end']}
            state['next']=state['cursor']+module.WIDTH
            print(state)
        return observe
    sys.settrace(observe)
    try: module.inspect_file(path)
    finally: sys.settrace(None)
if __name__=='__main__':
    try:
        if len(sys.argv)!=3: raise ValueError('usage: trace.py parser.py INPUT')
        trace_file(sys.argv[1],sys.argv[2])
    except (OSError,ValueError) as error:
        print(f'Trace result: {error}',file=sys.stderr); sys.exit(2)

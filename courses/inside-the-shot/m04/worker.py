#!/usr/bin/env python3
"""One subprocess per submitted implementation. This is not a security sandbox."""
import importlib.util
import json
from pathlib import Path
import sys
if __name__=='__main__':
    path=Path(sys.argv[1]).resolve()
    spec=importlib.util.spec_from_file_location('submission',path)
    module=importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    requests=json.load(sys.stdin)
    results=[]
    for item in requests:
        try:
            value=module.inspect_file(item['path']) if 'path' in item else module.inspect(bytes.fromhex(item['hex']))
            results.append({'ok':value})
        except ValueError as error: results.append({'rejected':str(error)})
    print(json.dumps(results,allow_nan=False))

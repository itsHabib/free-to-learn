#!/usr/bin/env python3
"""Execute selected learner parser/inventory/graph source; tests are not a sandbox."""
import argparse
from copy import deepcopy
from dataclasses import asdict
from datetime import datetime, timezone
from hashlib import sha256
import json
from pathlib import Path
import random
import sys
import uuid

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(Path(__file__).resolve().parent))
from fwcourse.container import Component, Container, FormatError, MAX_BYTES
from fwcourse.runner import load_parser
from parser_cases import encode, inventory, item, mutation


def run_checks(module):
    results = []
    def check(name, body):
        try:
            body()
            results.append({"check": name, "result": "pass"})
        except Exception as exc:
            results.append({"check": name, "result": "fail", "detail": f"{type(exc).__name__}: {exc}"})
    def equal(actual, expected):
        if actual != expected:
            raise AssertionError(f"expected {expected!r}; got {actual!r}")
    def parsed(data, expected):
        result = module.parse_container(data)
        if not isinstance(result, Container) or type(result.components) is not tuple:
            raise AssertionError("return supplied Container(data, tuple_of_Components)")
        equal(result.data, data)
        for c in result.components:
            if not isinstance(c, Component) or any(type(getattr(c, k)) is not t for k,t in (("name",str),("kind",str),("version",int),("offset",int),("payload",bytes),("declared_sha256",str))):
                raise AssertionError("Component fields have incorrect types")
        equal([asdict(c) for c in result.components], expected)
        observed = module.component_inventory(result)
        for row in observed:
            if any(type(row[k]) is not t for k,t in (("name",str),("kind",str),("version",int),("offset",int),("size",int),("sha256",str),("declared_sha256",str),("hash_matches",bool))):
                raise AssertionError("Inventory fields have incorrect types")
        equal(observed, inventory(expected))
        equal([asdict(c) for c in result.components], expected)
        return result
    def rejects(data, expected_exception=FormatError):
        try:
            module.parse_container(data)
        except expected_exception:
            return
        raise AssertionError(f"expected {expected_exception.__name__}; malformed input accepted")

    baseline = [item("boot", b"boot description\n"), item("config", b'{"mode":"normal"}\n', "config"), item("kernel", b"kernel description\n", version=2)]
    data, expected = encode(baseline)
    check("parse and inventory all component fields", lambda: parsed(data, expected))
    check("minimal nonempty container", lambda: parsed(*encode([item("a", b"x", "z")])) )
    check("maximum-length name and kind", lambda: parsed(*encode([item("n"*24,b"x","k"*12)])))
    check("maximum uint32 component version", lambda: parsed(*encode([item("core",version=0xffffffff)])))
    check("32 components accepted", lambda: parsed(*encode([item(f"part{i}", bytes([i])) for i in range(32)])))
    check("exact 1 MiB accepted", lambda: parsed(*encode([item("large",b"x"*(MAX_BYTES-100))])))
    for seed in range(6):
        rng = random.Random(7300+seed)
        items = [item(f"node{i}", rng.randbytes(3+i), kind="data", version=i+1) for i in range(5)]
        table, physical = list(range(5)), list(range(5));rng.shuffle(table);rng.shuffle(physical)
        blob, model = encode(items,table,physical)
        check(f"unfamiliar names with independent table/payload permutation {seed}", lambda blob=blob,model=model: parsed(blob,model))
    corrupt = bytearray(data);corrupt[-1] ^= 1
    corrupt_expected=deepcopy(expected);corrupt_expected[-1]["payload"]=bytes(corrupt)[expected[-1]["offset"]:]
    check("hash mismatch retained as inventory evidence", lambda: parsed(bytes(corrupt),corrupt_expected))
    # Direct inventory input discriminates a parser shortcut from the inventory task.
    direct = Container(b"not reparsed", (Component("z", "data", 3, 200, b"z", "0"*64), Component("a","config",1,100,b"a",sha256(b"a").hexdigest())))
    check("inventory computes observed hash; does not reparse container",lambda: equal(module.component_inventory(direct),inventory([asdict(c) for c in direct.components])))
    check("non-bytes input rejected by TypeError", lambda: rejects(bytearray(data),TypeError))
    check("every truncation rejected as FormatError",lambda: [rejects(data[:n]) for n in range(len(data))])
    check("correct-length truncations isolate table and payload bounds",
          lambda: [rejects(mutation(data[:n],16,"<I",n)) for n in range(20,len(data))])
    for name,blob in [
        ("wrong magic", mutation(data,0,"<8s",b"NOTEDUFW")),
        ("unsupported header version",mutation(data,8,"<H",2)),
        ("zero components",mutation(data,10,"<H",0)),
        ("33 components",mutation(data,10,"<H",33)),
        ("table offset is not 20",mutation(data,12,"<I",21)),
        ("total length mismatch",mutation(data,16,"<I",len(data)+1)),
        ("file over 1 MiB",b"x"*(MAX_BYTES+1)),
        ("payload points inside header",mutation(data,56,"<I",0)),
        ("payload points inside table",mutation(data,56,"<I",259)),
        ("payload points beyond EOF",mutation(data,56,"<I",0xffffffff)),
        ("payload range crosses EOF",mutation(data,60,"<I",0xffffffff)),
        ("zero payload size",mutation(data,60,"<I",0)),
        ("zero component version",mutation(data,64,"<I",0)),
        ("duplicate names",mutation(data,100,"<24s",b"boot")),
        ("unsafe component name",mutation(data,20,"<24s",b"../outside")),
        ("absolute component name",mutation(data,20,"<24s",b"/outside")),
        ("invalid kind",mutation(data,44,"<12s",b"bad/kind")),
        ("empty name",mutation(data,20,"<24s",b"")),
        ("non-ASCII name",mutation(data,20,"<24s",b"\xffname")),
        ("nonzero bytes after NUL",mutation(data,20,"<24s",b"ok\0hidden")),
        ("overlapping payloads",mutation(data,136,"<I",expected[0]["offset"])),
        ("unclaimed byte in payload area",mutation(data,60,"<I",len(baseline[0]["payload"])-1)),
        ("unclaimed trailing byte",mutation(data+b"!",16,"<I",len(data)+1)),
    ]:
        check(name,lambda blob=blob:rejects(blob))
    # Exact expected edge/error sets, but accept every correct topological order.
    def graph_case(spec,errors):
        components=[{"name":name,"requires":deps} for name,deps in spec]
        before=deepcopy(components)
        result=module.map_dependencies(components)
        equal(set(result),{"edges","errors","dependency_first_order"})
        edges={name:sorted(deps) for name,deps in spec}
        equal(result["edges"],edges);equal(result["errors"],errors);equal(components,before)
        order=result["dependency_first_order"]
        if errors:
            equal(order,None)
        else:
            if not isinstance(order,list) or len(order)!=len(edges) or set(order)!=set(edges):
                raise AssertionError("topological order must contain each node exactly once")
            positions={name:i for i,name in enumerate(order)}
            for name,deps in edges.items():
                for dep in deps:
                    if positions[dep]>=positions[name]:raise AssertionError(f"dependency {dep} must precede {name}")
    cases=[
      ("isolated node",[("single",[])],[]),
      ("chain in reverse declaration order",[("a",["b"]),("b",["c"]),("c",[])],[]),
      ("diamond and isolated node",[("boot",["left","right"]),("left",["base"]),("right",["base"]),("base",[]),("isolated",[])],[]),
      ("missing dependency",[("boot",["absent"]),("alone",[])],["missing_dependency:boot:absent"]),
      ("self cycle",[("self",["self"])],["dependency_cycle"]),
      ("two-node cycle",[("a",["b"]),("b",["a"])],["dependency_cycle"]),
      ("disconnected cycle",[("good",[]),("a",["b"]),("b",["a"])],["dependency_cycle"]),
      ("missing nodes and two cycles",[("z",["missing","z"]),("a",["unknown","b"]),("b",["a"])],["missing_dependency:a:unknown","missing_dependency:z:missing","dependency_cycle"]),
      ("32-node chain",[(f"n{i}",[f"n{i-1}"] if i else []) for i in reversed(range(32))],[]),
    ]
    for name,spec,errors in cases:
        check("graph: "+name,lambda spec=spec,errors=errors:graph_case(spec,errors))
    return results


def main(argv=None):
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument("--parser",required=True,type=Path);args=parser.parse_args(argv)
    report={"run_id":str(uuid.uuid4()),"created_at_utc":datetime.now(timezone.utc).isoformat(),"parser_path":str(args.parser.resolve()),"parser_sha256":None,"checks":[],"status":"fail"}
    try:
        module,report["parser_sha256"]=load_parser(args.parser)
        report["checks"]=run_checks(module)
        if all(row["result"]=="pass" for row in report["checks"]):report["status"]="pass"
    except Exception as exc:report["load_error"]=f"{type(exc).__name__}: {exc}"
    report["passed"]=sum(c["result"]=="pass" for c in report["checks"]);report["total"]=len(report["checks"])
    print(json.dumps(report,indent=2,sort_keys=True));return 0 if report["status"]=="pass" else 1


if __name__=="__main__":sys.exit(main())

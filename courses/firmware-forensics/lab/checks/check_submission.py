#!/usr/bin/env python3
"""Checks actually load the selected learner source on every invocation.

Not a security sandbox or certification: a learner can read these tests. Their
purpose is observable feedback, accompanied by the reasoning rubric.
"""
import argparse
from copy import deepcopy
from datetime import datetime, timezone
import json
from pathlib import Path
import sys
import uuid

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from fwcourse.evidence import inspect_file
from fwcourse.runner import load_analysis, load_parser

F = ROOT / "fixtures"


def run_checks(module, parser_module):
    checks = []
    def check(name, actual, expected):
        try:
            value = actual()
            if value != expected:
                raise AssertionError(f"expected {expected!r}; got {value!r}")
            checks.append({"check": name, "result": "pass"})
        except Exception as exc:
            checks.append({"check": name, "result": "fail", "detail": f"{type(exc).__name__}: {exc}"})

    def item(name, digest="a" * 64, version=1, deps=None, kind="description", **kwargs):
        return dict(name=name, kind=kind, version=version, sha256=digest, requires=deps or [], **kwargs)
    def record(name, status, fields=()):
        return dict(name=name, status=status, fields_changed=list(fields))

    check("empty inventories", lambda: module.compare_components([], []), [])
    check("added and removed components", lambda: module.compare_components([item("old")], [item("new")]),
          [record("new", "added"), record("old", "removed")])
    before = [item("beta", deps=["gamma", "alpha"], offset=100, size=6), item("alpha", offset=200)]
    after = [item("alpha", offset=900), item("beta", deps=["alpha", "gamma"], offset=700, size=8)]
    snapshot = deepcopy([before, after])
    check("match by name; ignore layout and dependency order", lambda: module.compare_components(before, after),
          [record("alpha", "unchanged"), record("beta", "unchanged")])
    check("content outranks metadata; all changed fields retained",
          lambda: module.compare_components([item("core")], [item("core", "b" * 64, 3, ["support"], "metadata")]),
          [record("core", "content_changed", ["kind", "requires", "sha256", "version"])])
    check("kind-only change is metadata",
          lambda: module.compare_components([item("core")], [item("core", kind="metadata")]),
          [record("core", "metadata_changed", ["kind"])])
    check("dependency-only change is metadata",
          lambda: module.compare_components([item("core")], [item("core", deps=["support"])]),
          [record("core", "metadata_changed", ["requires"])])
    check("version-only change is metadata",
          lambda: module.compare_components([item("core")], [item("core", version=2)]),
          [record("core", "metadata_changed", ["version"])])
    no_deps = item("core")
    del no_deps["requires"]
    check("missing requires means no dependencies",
          lambda: module.compare_components([no_deps], [item("core")]), [record("core", "unchanged")])
    check("input inventory was not mutated", lambda: [before, after], snapshot)

    # Independent expectations for all combinations: missing manifest must remain
    # absent, policy is independent of hashes, and origin is never authenticated.
    for hashes in (False, True):
        for manifest_status in (None, False, True):
            for policy_status in (None, False, True):
                report = {"component_hashes_match": hashes, "manifest_present": manifest_status is not None,
                          "manifest_matches": manifest_status, "policy_checked": policy_status is not None,
                          "policy_findings": ["example_policy_failure"] if policy_status is False else [],
                          "origin_authenticated": False}
                expected = {"integrity": "match" if hashes else "mismatch",
                            "manifest": {None: "absent", False: "mismatch", True: "match"}[manifest_status],
                            "origin": "unverified",
                            "policy": {None: "not_checked", False: "fail", True: "pass"}[policy_status]}
                check(f"separate trust axes h={hashes}, m={manifest_status}, p={policy_status}",
                      lambda report=report: module.summarize_trust(deepcopy(report)), expected)

    baseline = inspect_file(F / "release-1.efw", F / "release-1.json", F / "policy.json", parser_module=parser_module)
    current = inspect_file(F / "release-2.efw", F / "release-2.json", F / "policy.json", parser_module=parser_module)
    observed = inspect_file(F / "release-2-observed.efw", F / "release-2-observed.json", F / "policy.json", parser_module=parser_module)
    reordered = inspect_file(F / "release-2-reordered.efw", F / "release-2-reordered.json", F / "policy.json", parser_module=parser_module)
    check("real release pair", lambda: module.compare_components(baseline["components"], current["components"]),
          [record("boot", "unchanged"), record("config", "metadata_changed", ["version"]),
           record("kernel", "content_changed", ["requires", "sha256", "version"]),
           record("notices", "added"), record("telemetry", "removed")])
    check("same release, valid alternative container layout",
          lambda: module.compare_components(current["components"], reordered["components"]),
          [record(name, "unchanged") for name in ("boot", "config", "kernel", "notices")])
    check("self-consistent config substitution stays origin-unverified and policy-failed",
          lambda: module.summarize_trust(observed),
          {"integrity": "match", "manifest": "match", "origin": "unverified", "policy": "fail"})
    check("observed configuration diff isolates byte change",
          lambda: module.compare_components(current["components"], observed["components"]),
          [record("boot", "unchanged"), record("config", "content_changed", ["sha256"]),
           record("kernel", "unchanged"), record("notices", "unchanged")])
    return checks


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--analysis", required=True, type=Path)
    parser.add_argument("--parser", required=True, type=Path)
    args = parser.parse_args(argv)
    report = {"run_id": str(uuid.uuid4()), "created_at_utc": datetime.now(timezone.utc).isoformat(),
              "analysis_path": str(args.analysis.resolve()), "analysis_sha256": None,
              "fixture_index_sha256": __import__("hashlib").sha256((F / "fixture-index.json").read_bytes()).hexdigest(),
              "checks": [], "status": "fail"}
    try:
        parser_module, report["parser_sha256"] = load_parser(args.parser)
        module, report["analysis_sha256"] = load_analysis(args.analysis)
        report["checks"] = run_checks(module, parser_module)
        if all(c["result"] == "pass" for c in report["checks"]):
            report["status"] = "pass"
    except Exception as exc:
        report["load_error"] = f"{type(exc).__name__}: {exc}"
    report["passed"] = sum(c["result"] == "pass" for c in report["checks"])
    report["total"] = len(report["checks"])
    print(json.dumps(report, indent=2, sort_keys=True))
    return 0 if report["status"] == "pass" else 1


if __name__ == "__main__":
    sys.exit(main())

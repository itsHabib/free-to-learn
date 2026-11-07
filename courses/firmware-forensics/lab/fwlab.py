#!/usr/bin/env python3
"""Offline teaching CLI. No firmware execution, networking or writes except extraction."""
import argparse
import json
from pathlib import Path
import sys
from fwcourse.container import FormatError, read_bounded, extract
from fwcourse.evidence import inspect_file
from fwcourse.runner import load_analysis, load_parser


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest="command", required=True)
    inspect = commands.add_parser("inspect", help="parse, inventory, compare hashes/manifest/policy")
    inspect.add_argument("container")
    inspect.add_argument("--manifest")
    inspect.add_argument("--policy")
    extraction = commands.add_parser("extract", help="write data into a new directory; never execute")
    extraction.add_argument("container")
    extraction.add_argument("destination")
    investigate = commands.add_parser("investigate", help="execute your selected analysis on a release pair")
    investigate.add_argument("old")
    investigate.add_argument("new")
    investigate.add_argument("--old-manifest", required=True)
    investigate.add_argument("--new-manifest", required=True)
    investigate.add_argument("--policy", required=True)
    investigate.add_argument("--analysis", required=True)
    for command in (inspect, extraction, investigate):
        command.add_argument("--parser", required=True, help="Your parser/inventory/graph Python source")
    args = parser.parse_args(argv)
    try:
        parser_module, parser_digest = load_parser(args.parser)
        if args.command == "inspect":
            report = inspect_file(args.container, args.manifest, args.policy, parser_module=parser_module)
            report["parser_sha256"] = parser_digest
            print(json.dumps(report, indent=2, sort_keys=True))
            return 3 if (not report["component_hashes_match"] or report["manifest_matches"] is False
                         or report["policy_findings"]) else 0
        if args.command == "extract":
            files = extract(parser_module.parse_container(read_bounded(args.container)), args.destination)
            print(json.dumps({"written": files, "warning": "Data only; origin unverified."}, indent=2))
            return 0
        old = inspect_file(args.old, args.old_manifest, args.policy, parser_module=parser_module)
        new = inspect_file(args.new, args.new_manifest, args.policy, parser_module=parser_module)
        module, digest = load_analysis(args.analysis)
        result = {"analysis_sha256": digest, "parser_sha256": parser_digest, "old_container_sha256": old["container_sha256"],
                  "new_container_sha256": new["container_sha256"],
                  "changes": module.compare_components(old["components"], new["components"]),
                  "old_trust": module.summarize_trust(old), "new_trust": module.summarize_trust(new),
                  "observations": {"old_release": old["release"], "new_release": new["release"],
                                   "new_manifest_findings": new["manifest_findings"],
                                   "new_policy_findings": new["policy_findings"]},
                  "limits": "Learner output, not a certificate. Hashes do not authenticate origin."}
        print(json.dumps(result, indent=2, sort_keys=True))
        return 0
    except (FormatError, OSError, ValueError, NotImplementedError) as exc:
        print(json.dumps({"error": type(exc).__name__, "message": str(exc)}), file=sys.stderr)
        return 2


if __name__ == "__main__":
    sys.exit(main())

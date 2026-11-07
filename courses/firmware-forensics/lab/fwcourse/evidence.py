"""Separate structural, integrity, policy and origin evidence; no signature claims."""
from hashlib import sha256
import json
import math
import re
from .container import FormatError, read_bounded

MAX_JSON = 128 * 1024


def _pairs(pairs):
    result = {}
    for key, value in pairs:
        if key in result:
            raise FormatError(f"duplicate JSON key: {key}")
        result[key] = value
    return result


def _finite_float(text):
    value = float(text)
    if not math.isfinite(value):
        raise FormatError("non-finite JSON number")
    return value


def json_bytes(data):
    if len(data) > MAX_JSON:
        raise FormatError("JSON exceeds 128 KiB limit")
    try:
        return json.loads(data.decode("utf-8"), object_pairs_hook=_pairs, parse_float=_finite_float,
                          parse_constant=lambda value: (_ for _ in ()).throw(
                              FormatError("non-finite JSON number")))
    except (UnicodeError, json.JSONDecodeError, RecursionError) as exc:
        raise FormatError(f"invalid bounded UTF-8 JSON: {type(exc).__name__}") from exc


def load_json(path):
    return json_bytes(read_bounded(path, MAX_JSON))


def _keys(value, keys, context):
    if not isinstance(value, dict) or set(value) != set(keys):
        raise FormatError(f"{context}: expected fields {', '.join(sorted(keys))}")


def _int(value, context):
    if type(value) is not int or not 1 <= value <= 0xffffffff:
        raise FormatError(f"{context}: expected positive uint32")


def _name(value, maximum, context):
    if not isinstance(value, str) or re.fullmatch(r"[a-z][a-z0-9_-]{0," + str(maximum - 1) + "}", value) is None:
        raise FormatError(f"{context}: invalid identifier")


def _hash(value, context):
    if not isinstance(value, str) or re.fullmatch("[a-f0-9]{64}", value) is None:
        raise FormatError(f"{context}: expected lowercase SHA-256 hex")


def validate_manifest(manifest):
    _keys(manifest, ("schema", "format", "release", "container_sha256", "components"), "manifest")
    if type(manifest["schema"]) is not int or manifest["schema"] != 1 or manifest["format"] != "EDUFW1":
        raise FormatError("unsupported manifest schema/format")
    _int(manifest["release"], "manifest release")
    _hash(manifest["container_sha256"], "container_sha256")
    components = manifest["components"]
    if not isinstance(components, list) or not 1 <= len(components) <= 32:
        raise FormatError("manifest requires 1..32 components")
    names = set()
    for component in components:
        _keys(component, ("name", "kind", "version", "sha256", "requires"), "manifest component")
        _name(component["name"], 24, "name")
        _name(component["kind"], 12, "kind")
        _int(component["version"], "component version")
        _hash(component["sha256"], "component sha256")
        if component["name"] in names:
            raise FormatError("duplicate manifest component")
        names.add(component["name"])
        deps = component["requires"]
        if not isinstance(deps, list) or len(deps) > 32:
            raise FormatError("requires must be a bounded list")
        for dep in deps:
            _name(dep, 24, "dependency")
        if len(set(deps)) != len(deps):
            raise FormatError("duplicate dependency")
    return manifest


def validate_policy(policy):
    _keys(policy, ("schema", "minimum_release", "required_components", "required_config"), "policy")
    if type(policy["schema"]) is not int or policy["schema"] != 1:
        raise FormatError("unsupported policy schema")
    _int(policy["minimum_release"], "minimum_release")
    names = policy["required_components"]
    if not isinstance(names, list) or len(names) > 32:
        raise FormatError("invalid required_components")
    for name in names:
        _name(name, 24, "required component")
    if len(set(names)) != len(names):
        raise FormatError("duplicate required component")
    config = policy["required_config"]
    if not isinstance(config, dict) or len(config) > 32:
        raise FormatError("required_config must be an object of at most 32 fields")
    for key, value in config.items():
        _name(key, 24, "policy config key")
        if type(value) not in (str, int, bool) or (type(value) is str and len(value) > 128):
            raise FormatError("policy config values must be bounded scalars")
    return policy


def inspect_bytes(data, manifest=None, policy=None, *, parser_module):
    container = parser_module.parse_container(data)
    inventory = parser_module.component_inventory(container)
    report = {"format": "EDUFW1", "container_sha256": container.sha256,
              "structure": "valid", "components": inventory,
              "component_hashes_match": all(c["hash_matches"] for c in inventory),
              "manifest_present": manifest is not None, "manifest_matches": None,
              "manifest_findings": [], "release": None, "graph": None,
              "policy_checked": policy is not None, "policy_findings": [],
              "origin_authenticated": False,
              "origin_note": "No signatures or trusted external digest: origin remains unverified."}
    if manifest is not None:
        validate_manifest(manifest)
        report["release"] = manifest["release"]
        findings = report["manifest_findings"]
        if manifest["container_sha256"] != container.sha256:
            findings.append("container_digest_mismatch")
        expected = {c["name"]: c for c in manifest["components"]}
        actual = {c["name"]: c for c in inventory}
        for name in sorted(expected.keys() | actual.keys()):
            if name not in expected:
                findings.append(f"unlisted_component:{name}")
            elif name not in actual:
                findings.append(f"missing_component:{name}")
            else:
                for field in ("kind", "version", "sha256"):
                    if expected[name][field] != actual[name][field]:
                        findings.append(f"component_{field}_mismatch:{name}")
                actual[name]["requires"] = sorted(expected[name]["requires"])
        report["graph"] = parser_module.map_dependencies(manifest["components"])
        findings.extend(report["graph"]["errors"])
        report["manifest_matches"] = not findings
    if policy is not None:
        validate_policy(policy)
        findings = report["policy_findings"]
        if manifest is None:
            findings.append("release_unknown_without_manifest")
        elif manifest["release"] < policy["minimum_release"]:
            findings.append("release_below_minimum")
        actual = {c.name: c for c in container.components}
        for name in policy["required_components"]:
            if name not in actual:
                findings.append(f"required_component_missing:{name}")
        config = actual.get("config")
        if config is None:
            if policy["required_config"]:
                findings.append("required_config_missing")
        elif config.kind != "config":
            findings.append("config_kind_mismatch")
        else:
            try:
                parsed_config = json_bytes(config.payload)
                if not isinstance(parsed_config, dict):
                    raise FormatError("config must be an object")
                for key, value in sorted(policy["required_config"].items()):
                    observed = parsed_config.get(key)
                    if type(observed) is not type(value) or observed != value:
                        findings.append(f"config_policy_mismatch:{key}")
            except FormatError:
                findings.append("invalid_config_json")
    return report


def inspect_file(path, manifest_path=None, policy_path=None, *, parser_module):
    return inspect_bytes(read_bounded(path), load_json(manifest_path) if manifest_path else None,
                         load_json(policy_path) if policy_path else None, parser_module=parser_module)

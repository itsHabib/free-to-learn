"""Run explicitly selected learner code. This is not a sandbox for hostile Python."""
import importlib.util
from pathlib import Path
import hashlib


def _load(path, names):
    path = Path(path).resolve(strict=True)
    spec = importlib.util.spec_from_file_location("learner_analysis", path)
    if spec is None or spec.loader is None:
        raise ValueError("analysis must be a Python source file")
    module = importlib.util.module_from_spec(spec)
    # Compile source directly rather than using a potentially stale .pyc file.
    source = path.read_bytes()
    exec(compile(source, str(path), "exec"), module.__dict__)
    for name in names:
        if not callable(getattr(module, name, None)):
            raise ValueError(f"selected source missing callable: {name}")
    return module, hashlib.sha256(source).hexdigest()


def load_analysis(path):
    return _load(path, ("compare_components", "summarize_trust"))


def load_parser(path):
    return _load(path, ("parse_container", "component_inventory", "map_dependencies"))

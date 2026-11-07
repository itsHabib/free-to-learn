"""A deliberately small binary format, not UEFI, a flash image, or an executable."""
from dataclasses import dataclass
from hashlib import sha256
from pathlib import Path
import struct
import re

MAGIC = b"EDUFW1\0\0"
HEADER = struct.Struct("<8sHHII")
ENTRY = struct.Struct("<24s12sIII32s")
MAX_BYTES = 1024 * 1024
MAX_COMPONENTS = 32


class FormatError(ValueError):
    """Untrusted input violates the teaching format."""


@dataclass(frozen=True)
class Component:
    name: str
    kind: str
    version: int
    offset: int
    payload: bytes
    declared_sha256: str

    @property
    def actual_sha256(self):
        return sha256(self.payload).hexdigest()



@dataclass(frozen=True)
class Container:
    data: bytes
    components: tuple[Component, ...]

    @property
    def sha256(self):
        return sha256(self.data).hexdigest()


def read_bounded(path, maximum=MAX_BYTES):
    with Path(path).open("rb") as stream:
        data = stream.read(maximum + 1)
    if len(data) > maximum:
        raise FormatError(f"file exceeds {maximum}-byte limit")
    return data


def extract(container, destination):
    """Write data only, into a new directory; refuse corrupt input and overwrites."""
    names = [c.name for c in container.components]
    if len(set(names)) != len(names) or any(not isinstance(name, str) or re.fullmatch(r"[a-z][a-z0-9_-]{0,23}", name) is None for name in names):
        raise FormatError("refusing extraction: unsafe or duplicate component name")
    if any(c.actual_sha256 != c.declared_sha256 for c in container.components):
        raise FormatError("refusing extraction: embedded component hash mismatch")
    destination = Path(destination).absolute()
    # Symlinked ancestors are rejected; concurrent hostile filesystem mutation
    # is not in this offline, single-user exercise's threat model.
    if any(p.is_symlink() for p in (destination, *destination.parents)):
        raise FormatError("extraction destination must not contain symlinks")
    destination.mkdir(parents=False, exist_ok=False)
    for component in container.components:
        with (destination / (component.name + ".bin")).open("xb") as stream:
            stream.write(component.payload)
    return [c.name + ".bin" for c in container.components]

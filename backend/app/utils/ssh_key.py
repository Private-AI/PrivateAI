"""SSH private key temporary file helper.

Writes in-memory SSH key content to a temporary file with strict
permissions so Paramiko can use it.
"""

from __future__ import annotations

import os
import tempfile
from pathlib import Path


def write_temp_ssh_key(key_content: str) -> str:
    """Write SSH private key content to a temporary file.

    Returns the path to the temporary file. The caller is responsible
    for cleaning up the file when done.
    """
    if not key_content or not key_content.strip():
        raise ValueError("SSH private key content is empty")

    fd, path = tempfile.mkstemp(prefix="privateai_ssh_", suffix=".key")
    try:
        os.write(fd, key_content.encode("utf-8"))
    finally:
        os.close(fd)

    # Restrict permissions to owner-read-only (required by SSH)
    os.chmod(path, 0o600)
    return path


def cleanup_temp_ssh_key(path: str | None) -> None:
    """Safely remove a temporary SSH key file."""
    if not path:
        return
    try:
        Path(path).unlink(missing_ok=True)
    except Exception:
        pass

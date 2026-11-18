#!/usr/bin/env python3
"""Build PEP-427 compliant wheel and sdist for django-sastry without external build dependencies."""

import os
import sys
import hashlib
import base64
import zipfile
import tarfile
import io
import time
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent
VERSION = "2.0.4"
PKG_NAME = "django_sastry"
DIST_DIR = BASE_DIR / "dist"
DIST_DIR.mkdir(exist_ok=True)


def sha256_base64(data: bytes) -> str:
    digest = hashlib.sha256(data).digest()
    return "sha256=" + base64.urlsafe_b64encode(digest).rstrip(b"=").decode("ascii")


def collect_sastry_files():
    sastry_dir = BASE_DIR / "sastry"
    files = []
    for root, _, filenames in os.walk(sastry_dir):
        if "__pycache__" in root:
            continue
        for fn in filenames:
            if fn.endswith((".pyc", ".pyo")):
                continue
            full_path = Path(root) / fn
            rel_path = full_path.relative_to(BASE_DIR)
            files.append((full_path, str(rel_path)))
    return sorted(files, key=lambda x: x[1])


def get_metadata():
    readme_content = (BASE_DIR / "README.md").read_text(encoding="utf-8")
    return f"""Metadata-Version: 2.1
Name: django-sastry
Version: {VERSION}
Summary: A lightweight dynamic CRUD admin interface, native multi-tenant architecture, and interactive visual Entity Relations (ER) diagram for Django.
Home-page: https://github.com/globalkrishna/django-sastry
Author: Krishnamurthy
Author-email: krishna@globalmultimedia.in
License: MIT
Project-URL: Homepage, https://github.com/globalkrishna/django-sastry
Project-URL: Repository, https://github.com/globalkrishna/django-sastry.git
Classifier: Framework :: Django
Classifier: Framework :: Django :: 4.2
Classifier: Framework :: Django :: 5.0
Classifier: Framework :: Django :: 5.1
Classifier: Intended Audience :: Developers
Classifier: Operating System :: OS Independent
Classifier: Programming Language :: Python
Classifier: Programming Language :: Python :: 3
Classifier: Programming Language :: Python :: 3.10
Classifier: Programming Language :: Python :: 3.11
Classifier: Programming Language :: Python :: 3.12
Classifier: Programming Language :: Python :: 3.13
Classifier: Topic :: Database
Classifier: Topic :: Software Development :: Libraries :: Python Modules
Requires-Python: >=3.10
Description-Content-Type: text/markdown
License-File: LICENSE
Requires-Dist: Django>=4.2

{readme_content}
"""


def build_wheel():
    whl_name = f"{PKG_NAME}-{VERSION}-py3-none-any.whl"
    whl_path = DIST_DIR / whl_name
    dist_info = f"{PKG_NAME}-{VERSION}.dist-info"

    license_content = (BASE_DIR / "LICENSE").read_text(encoding="utf-8")
    metadata = get_metadata()

    wheel_info = """Wheel-Version: 1.0
Generator: sastry-packager (2.0.0)
Root-Is-Purelib: true
Tag: py3-none-any
"""

    top_level = "sastry\n"

    records = []

    with zipfile.ZipFile(whl_path, "w", compression=zipfile.ZIP_DEFLATED) as zf:
        # 1. Add sastry package files
        for full_path, arc_path in collect_sastry_files():
            data = full_path.read_bytes()
            zf.writestr(arc_path, data)
            records.append((arc_path, sha256_base64(data), str(len(data))))

        # 2. Add dist-info files
        dist_files = [
            (f"{dist_info}/licenses/LICENSE", license_content.encode("utf-8")),
            (f"{dist_info}/METADATA", metadata.encode("utf-8")),
            (f"{dist_info}/WHEEL", wheel_info.encode("utf-8")),
            (f"{dist_info}/top_level.txt", top_level.encode("utf-8")),
        ]

        for arc_path, data in dist_files:
            zf.writestr(arc_path, data)
            records.append((arc_path, sha256_base64(data), str(len(data))))

        # 3. Add RECORD
        record_path = f"{dist_info}/RECORD"
        record_content = "\n".join(f"{p},{h},{s}" for p, h, s in records) + f"\n{record_path},,\n"
        zf.writestr(record_path, record_content.encode("utf-8"))

    print(f"✅ Built Wheel: {whl_path} ({whl_path.stat().st_size:,} bytes)")
    return whl_path


def build_sdist():
    sdist_name = f"{PKG_NAME}-{VERSION}.tar.gz"
    sdist_path = DIST_DIR / sdist_name
    prefix = f"{PKG_NAME}-{VERSION}"

    files_to_pack = [
        "pyproject.toml",
        "README.md",
        "LICENSE",
        "MANIFEST.in",
        "package.json",
        "tsconfig.json",
        "runtests.py",
        "CHANGELOG.md",
    ]

    with tarfile.open(sdist_path, "w:gz") as tar:
        # Add PKG-INFO for PyPI compliance
        pkg_info_data = get_metadata().encode("utf-8")
        ti = tarfile.TarInfo(name=f"{prefix}/PKG-INFO")
        ti.size = len(pkg_info_data)
        ti.mtime = int(time.time())
        ti.mode = 0o644
        tar.addfile(ti, io.BytesIO(pkg_info_data))

        for fn in files_to_pack:
            fp = BASE_DIR / fn
            if fp.exists():
                tar.add(fp, arcname=f"{prefix}/{fn}")

        for full_path, rel_path in collect_sastry_files():
            tar.add(full_path, arcname=f"{prefix}/{rel_path}")

        # Add docs
        docs_dir = BASE_DIR / "docs"
        if docs_dir.exists():
            for root, _, filenames in os.walk(docs_dir):
                for fn in filenames:
                    fp = Path(root) / fn
                    rel_p = fp.relative_to(BASE_DIR)
                    tar.add(fp, arcname=f"{prefix}/{rel_p}")

    print(f"✅ Built Sdist: {sdist_path} ({sdist_path.stat().st_size:,} bytes)")
    return sdist_path


if __name__ == "__main__":
    build_wheel()
    build_sdist()


"""Recompute published line metrics and verify that the measured application sources match."""

import hashlib
import json
from pathlib import Path
from xml.etree import ElementTree

from scripts.coverage_policy import meets_line_threshold
from scripts.go_coverage import line_coverage

ROOT = Path(__file__).resolve().parents[1]


def verify(root: Path = ROOT) -> dict:
    directory = root / "docs/coverage"
    manifest = json.loads((directory / "source-manifest.json").read_text(encoding="utf-8"))
    for name, expected in manifest["files"].items():
        path = (root / name).resolve()
        if not path.is_relative_to(root.resolve()) or not path.is_file():
            raise ValueError(f"Missing measured source: {name}")
        # Git for Windows checks out text files with CRLF (core.autocrlf=true);
        # the manifest holds hashes of the repository content, which uses LF.
        content = path.read_bytes().replace(b"\r\n", b"\n")
        if hashlib.sha256(content).hexdigest() != expected:
            raise ValueError(f"Measured source changed: {name}")
    covered, total = line_coverage((directory / "backend.coverprofile").read_text(encoding="utf-8"))
    metrics = {"backend": {"covered": covered, "total": total}}
    for component in ("ai", "mock"):
        report = ElementTree.parse(directory / f"{component}.xml").getroot()
        metrics[component] = {
            "covered": int(report.attrib["lines-covered"]),
            "total": int(report.attrib["lines-valid"]),
        }
    frontend = json.loads((directory / "frontend-summary.json").read_text(encoding="utf-8"))
    lines = frontend["total"]["lines"]
    metrics["frontend"] = {"covered": lines["covered"], "total": lines["total"]}
    declared = json.loads((directory / "summary.json").read_text(encoding="utf-8"))
    for component, values in metrics.items():
        covered, total = values["covered"], values["total"]
        if not 0 <= covered <= total or not meets_line_threshold(covered, total):
            raise ValueError(f"Coverage below independent threshold: {component}")
        if any(declared[component][key] != values[key] for key in ("covered", "total")):
            raise ValueError(f"Summary does not match raw report: {component}")
        values["percent"] = round(covered / total * 100, 4)
    return metrics


if __name__ == "__main__":
    print(json.dumps(verify(), ensure_ascii=False, indent=2))

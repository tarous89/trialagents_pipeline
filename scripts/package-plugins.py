"""Build both release archives using the exact artwork from the pinned Intel release."""
from pathlib import Path
import argparse
import json
import subprocess
import zipfile

ROOT = Path(__file__).resolve().parents[1]
INTEL = "eaee7070e05a8247f1121209a1345daa7e7d7000"
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("intel_checkout", type=Path)
parser.add_argument("--output", type=Path, default=ROOT / "dist")
args = parser.parse_args()
args.output.mkdir(parents=True, exist_ok=True)
for host in ("chatgpt", "claude"):
    payload = {}
    for directory in ("shared", host):
        base = ROOT / "plugins" / directory
        for path in base.rglob("*"):
            if path.is_file() and not path.is_symlink():
                payload[path.relative_to(base).as_posix()] = path.read_bytes()
    if host == "chatgpt":
        manifest = json.loads(payload["plugin.json"])
        artwork = ["assets/" + name + ".png" for name in ("composer-icon", "composer-icon-dark", "logo", "logo-dark")]
        reference = "plugins/trialagents-intel/"
        review = manifest["extensions"]["com.openai"]["review"]["test_cases"]
        assert len(review["positive"]) == 5 and len(review["negative"]) == 3
        assert json.loads(payload["mcp.json"])["mcpServers"]["trialagents-pipeline"]["url"].endswith("/pipeline/mcp")
    else:
        manifest = json.loads(payload[".claude-plugin/plugin.json"])
        artwork = [manifest["icon"]]
        reference = "plugins/trialagents-intel-claude/"
        assert json.loads(payload[".mcp.json"])["mcpServers"]["trialagents-pipeline"]["url"].endswith("/pipeline-claude/mcp")
    for path in artwork:
        payload[path] = subprocess.check_output(["git","-C",str(args.intel_checkout),"show",INTEL+":"+reference+path])
        assert payload[path].startswith(b"\x89PNG\r\n\x1a\n")
    destination = args.output / f"trialagents-pipeline-{host}-{manifest['version']}.zip"
    with zipfile.ZipFile(destination, "w") as archive:
        for name, content in sorted(payload.items()):
            item = zipfile.ZipInfo(name, (2026, 11, 23, 0, 0, 0))
            item.external_attr = 0o100644 << 16
            archive.writestr(item, content, compress_type=zipfile.ZIP_DEFLATED)
    with zipfile.ZipFile(destination) as archive:
        assert archive.testzip() is None
    print(destination)

"""Build the ChatGPT and Claude release archives from the plugin sources in this repository."""
from pathlib import Path
import argparse
import json
import zipfile

ROOT = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("--output", type=Path, default=ROOT / "dist")
args = parser.parse_args()
args.output.mkdir(parents=True, exist_ok=True)


def read_tree(base):
    return {
        path.relative_to(base).as_posix(): path.read_bytes()
        for path in base.rglob("*")
        if path.is_file() and not path.is_symlink()
    }


def check_png(payload, path):
    assert payload[path].startswith(b"\x89PNG\r\n\x1a\n"), path


versions = {}
for host in ("chatgpt", "claude"):
    payload = read_tree(ROOT / "plugins" / host)
    assert "skills/manage-pipeline/SKILL.md" in payload
    if host == "chatgpt":
        manifest = json.loads(payload["plugin.json"])
        openai = manifest["extensions"]["com.openai"]
        assert openai["apps"] == "./.app.json"
        assert json.loads(payload[".app.json"])["apps"]["trialagents-pipeline"]["required"] is True
        for key in ("composerIcon", "composerIconDark", "logo", "logoDark"):
            check_png(payload, openai["interface"][key].removeprefix("./"))
    else:
        manifest = json.loads(payload[".claude-plugin/plugin.json"])
        server = json.loads(payload[".mcp.json"])["mcpServers"]["trialagents-pipeline"]
        assert server["type"] == "http" and server["url"].endswith("/pipeline/claude")
        check_png(payload, manifest["icon"])
        listing = json.loads((ROOT / ".claude-plugin" / "marketplace.json").read_bytes())
        assert listing["plugins"][0]["version"] == manifest["version"]
    assert manifest["name"] == "trialagents-pipeline"
    versions[host] = manifest["version"]
    destination = args.output / f"trialagents-pipeline-{host}-plugin-{manifest['version']}.zip"
    with zipfile.ZipFile(destination, "w") as archive:
        for name, content in sorted(payload.items()):
            item = zipfile.ZipInfo(name, (2026, 11, 23, 0, 0, 0))
            item.external_attr = 0o100644 << 16
            archive.writestr(item, content, compress_type=zipfile.ZIP_DEFLATED)
    with zipfile.ZipFile(destination) as archive:
        assert archive.testzip() is None
    print(destination)
assert versions["chatgpt"] == versions["claude"], versions

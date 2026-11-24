"""Build directory archives only on an explicit release request."""
from pathlib import Path
import argparse
import json
import re
import zipfile

ROOT = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("--output", type=Path, default=ROOT / "dist")
parser.add_argument("--host", choices=("chatgpt", "claude"), help="Build only this host's archive")
parser.add_argument("--browser-app-id", help="Build a private ChatGPT web test ZIP for this verified Pipeline app registration")
args = parser.parse_args()
if args.browser_app_id is not None:
    if args.host == "claude" or not re.fullmatch(r"(?:asdk_app_|connector_|templated_apps_)[A-Za-z0-9][A-Za-z0-9_-]*", args.browser_app_id):
        parser.error("--browser-app-id requires the registered ChatGPT app ID for the Pipeline endpoint")
    args.host = "chatgpt"
args.output.mkdir(parents=True, exist_ok=True)
for host in ((args.host,) if args.host else ("chatgpt", "claude")):
    target = host
    payload = {}
    for directory in ("shared", host):
        base = ROOT / "plugins" / directory
        if not base.is_dir():
            continue
        for path in base.rglob("*"):
            if path.is_file() and not path.is_symlink():
                payload[path.relative_to(base).as_posix()] = path.read_bytes()
    if host == "chatgpt":
        manifest = json.loads(payload["plugin.json"])
        extension = manifest["extensions"]["com.openai"]
        artwork = ["assets/" + name + ".png" for name in ("composer-icon", "composer-icon-dark", "logo", "logo-dark")]
        review = extension["review"]["test_cases"]
        assert len(review["positive"]) == 5 and len(review["negative"]) == 3
        assert json.loads(payload["mcp.json"])["mcpServers"]["trialagents-pipeline"]["url"] == "https://mcp.trialagents.com/pipeline/chatgpt"
        assert ".app.json" not in payload and "apps" not in extension
        target = "chatgpt-submission"
        if args.browser_app_id is not None:
            target = "chatgpt-browser"
            del payload["mcp.json"]
            extension["apps"] = "./.app.json"
            for key in ("test_cases", "prompts"):
                extension["review"].pop(key, None)
            app = {"apps": {"trialagents-pipeline": {"id": args.browser_app_id, "required": True}}}
            payload[".app.json"] = (json.dumps(app, indent=2) + "\n").encode()
            payload["plugin.json"] = (json.dumps(manifest, indent=2, ensure_ascii=False) + "\n").encode()
    else:
        manifest = json.loads(payload[".claude-plugin/plugin.json"])
        artwork = [manifest["icon"]]
        server = json.loads(payload[".mcp.json"])["mcpServers"]["trialagents-pipeline"]
        assert server == {"type": "http", "url": "https://mcp.trialagents.com/pipeline/claude"}
        assert "skills/manage-pipeline/SKILL.md" in payload
        assert payload[manifest["icon"]] == (ROOT / "assets" / "claude-mark.png").read_bytes()
        listing = json.loads((ROOT / ".claude-plugin" / "marketplace.json").read_bytes())
        assert listing["plugins"][0]["version"] == manifest["version"]
    for path in artwork:
        source = "claude-mark.png" if host == "claude" else "mark-dark.png" if "dark" in path else "mark-light.png"
        payload[path] = (ROOT / "assets" / source).read_bytes()
        assert payload[path].startswith(b"\x89PNG\r\n\x1a\n")
    destination = args.output / f"trialagents-pipeline-{target}-{manifest['version']}.zip"
    with zipfile.ZipFile(destination, "w") as archive:
        for name, content in sorted(payload.items()):
            item = zipfile.ZipInfo(name, (2026, 11, 23, 0, 0, 0))
            item.external_attr = 0o100644 << 16
            archive.writestr(item, content, compress_type=zipfile.ZIP_DEFLATED)
    with zipfile.ZipFile(destination) as archive:
        assert archive.testzip() is None
    print(destination)

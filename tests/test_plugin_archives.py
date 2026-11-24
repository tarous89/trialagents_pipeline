import json
import subprocess
import sys
import tempfile
import unittest
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


class ChatGPTArchives(unittest.TestCase):
    def test_private_browser_and_public_submission(self):
        with tempfile.TemporaryDirectory() as folder:
            cmd = [sys.executable, ROOT / "scripts/package-plugins.py", "--host", "chatgpt", "--output", folder]
            subprocess.run(cmd, check=True, capture_output=True)
            fixture = "asdk_app_pipeline_packager_test"
            subprocess.run([*cmd, "--browser-app-id", fixture], check=True, capture_output=True)
            browser = next(Path(folder).glob("*-browser-*.zip"))
            submission = next(Path(folder).glob("*-submission-*.zip"))
            with zipfile.ZipFile(browser) as private, zipfile.ZipFile(submission) as public:
                self.assertIsNone(private.testzip())
                self.assertIsNone(public.testzip())
                self.assertEqual(set(private.namelist()) - set(public.namelist()), {".app.json"})
                self.assertEqual(set(public.namelist()) - set(private.namelist()), {"mcp.json"})
                for path in set(private.namelist()) & set(public.namelist()) - {"plugin.json"}:
                    self.assertEqual(private.read(path), public.read(path))
                priv = json.loads(private.read("plugin.json"))["extensions"]["com.openai"]
                pub = json.loads(public.read("plugin.json"))["extensions"]["com.openai"]
                app = json.loads(private.read(priv["apps"].removeprefix("./")))
                self.assertEqual(app["apps"], {"trialagents-pipeline": {"id": fixture, "required": True}})
                self.assertNotIn("test_cases", priv["review"])
                self.assertNotIn("prompts", priv["review"])
                self.assertNotIn("apps", pub)
                cases = pub["review"]["test_cases"]
                self.assertEqual((len(cases["positive"]), len(cases["negative"])), (5, 3))
                server = json.loads(public.read("mcp.json"))["mcpServers"]["trialagents-pipeline"]
                self.assertEqual(server["url"], "https://mcp.trialagents.com/pipeline/chatgpt")
            invalid = subprocess.run([*cmd, "--browser-app-id", "Plugin_test"], capture_output=True)
            self.assertNotEqual(invalid.returncode, 0)

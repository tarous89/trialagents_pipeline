"""Install the two Pipeline routes into a disposable shared MCP build checkout."""
from pathlib import Path
from shutil import copyfile
import sys

root = Path(__file__).resolve().parents[1]
package = Path(sys.argv[1]).resolve() / "src" / "intel_mcp"
bootstrap = package / "bootstrap.py"
source = bootstrap.read_text()
baseline = "\napp = server.build_app()\n"
staged = "\nfrom .pipeline_ingress import PipelineIngress\napp = PipelineIngress(server.build_app())\n"
if staged not in source and source.count(baseline) != 1:
    raise SystemExit("Incompatible shared MCP entrypoint")
copyfile(root / "integration/shared-mcp/pipeline_ingress.py", package / "pipeline_ingress.py")
if staged not in source:
    bootstrap.write_text(source.replace(baseline, staged))

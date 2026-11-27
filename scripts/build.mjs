import {readFile,mkdir,writeFile} from 'node:fs/promises'
import {createHash} from 'node:crypto'
import {build} from 'esbuild'
const read=p=>readFile(new URL('../'+p,import.meta.url),'utf8')
await mkdir('dist',{recursive:true})
const controls=await read('app/web/view-bridge.js.txt')
const controlHash=createHash('sha256').update(controls).digest('base64')
const policy="default-src 'none'; style-src 'unsafe-inline'; script-src 'sha256-"+controlHash+"'; base-uri 'none'; form-action 'none'; object-src 'none'"
await writeFile('dist/pipeline-renderer.html','<!doctype html><html><head><meta charset="utf-8"><meta name="referrer" content="no-referrer"><meta http-equiv="Content-Security-Policy" content="'+policy+'"><style>body{margin:0;padding:8px;color:#172638;font:15px/1.5 Inter,system-ui,sans-serif}svg{max-width:100%;height:auto}table{width:100%;border-collapse:collapse}th,td{padding:8px;text-align:left}input,select,textarea{font:inherit}</style><title>Pipeline view</title></head><body><script>'+controls+'</script></body></html>')
let shell=await read('app/web/shell.html')
shell=shell.replace('</style>',await read('app/web/intel/billing.css')+'</style>')
shell=shell.replace('</style>','\n:root{--pipeline-accent:#14644e}.primary{background:var(--pipeline-accent)!important}.settings-tabs{overflow:auto}#notice:not(:empty){position:fixed;bottom:1rem;right:1rem;z-index:100;background:#17362a;color:white;padding:.7rem 1rem;border-radius:8px}#notice.success:not(:empty){background:#fff;color:#43564d;border:1px solid #dbe4df;font-size:.875rem;font-weight:400;padding:.45rem .75rem;pointer-events:none}pre{white-space:pre-wrap;overflow-wrap:anywhere}#rail select{max-width:100%;background:#202824;color:white}#rail button{flex-shrink:0}</style>')
const common=await read('app/web/planner.js')+'\n'+await read('app/web/workspace.js')
async function bundle(source){
 return (await build({stdin:{contents:"import {riskLevels,riskLevel,riskExposure} from './app/server/risk.mjs';import {into} from './app/web/sanitize.js';import {showBound,resultTable} from './app/web/bound-view.js';import {paintChart} from './app/web/chart.jsx';import {fitFrame} from './app/web/fit-frame.js';import {assistantMark} from './app/web/assistant-marks.js';\n"+source,resolveDir:process.cwd()},bundle:true,loader:{'.svg':'text','.txt':'text'},jsx:'automatic',define:{'process.env.NODE_ENV':'"production"'},minify:true,format:'iife',target:'es2022',write:false})).outputFiles[0].text
}
const main=await bundle(common+'\n'+await read('app/web/browser.js'))
await writeFile('dist/pipeline.js',main);await writeFile('dist/pipeline.html',shell)
if(process.argv.includes('--widget')){
 const shared=await read('app/web/assistant-workspace.js')
 const embedded=await bundle(common+'\n'+shared+'\n'+await read('app/web/embedded.js'))
 await writeFile('dist/pipeline-embedded.js',embedded)
 await writeFile('dist/pipeline-embedded.html',shell.replace('/pipeline-assets/pipeline.js','/pipeline-assets/pipeline-embedded.js'))
 const chat=(await build({entryPoints:['app/web/chatgpt.js'],bundle:true,minify:true,write:false,format:'iife',target:'es2022'})).outputFiles[0].text
 await writeFile('dist/pipeline-chatgpt.html',(await read('app/web/chatgpt.html')).replace('</body>',()=>'<script>'+chat.replace(/<\/script/gi,'<\\/script')+'</script></body>'))
 const bridge=(await build({entryPoints:['app/web/host.js'],bundle:true,minify:true,write:false,format:'iife',target:'es2022'})).outputFiles[0].text
 const widget=(await bundle(common))+'\n'+bridge
 const widgetShell=shell.replace('combined-workspace combined-public-shell">','combined-workspace combined-public-shell combined-plugin-shell combined-extension-surface">')
   .replace(/<img class="pipeline-mark"[^>]*><h1 class="workspaceTitle">([^<]*<span class="brand-dot"[^>]*>•<\/span> Pipeline)<\/h1>/, '<h1 class="workspaceTitle"><button type="button" class="workspace-brand" aria-label="Open TrialAgents Pipeline"><img src="https://intel.trialagents.com/trialagents-mark-white.png" width="28" height="28" alt=""><span>$1</span></button></h1>')
   .replace('.intel-app{min-height:0}',(await read('app/web/extension-header.css'))+'\n.intel-app{min-height:0}')
 await writeFile('dist/pipeline-widget.html',widgetShell.replace('<script src="/pipeline-assets/pipeline.js"></script>',()=>'<script>'+widget.replace(/<\/script/gi,'<\\/script')+'</script>'))
 // Claude bundles the same workspace into its MCP App view instead of framing the app
 // origin, which Claude does not allow for this connector. The ChatGPT outputs above are unchanged.
 const swap=(text,pairs)=>pairs.reduce((out,[from,to])=>{if(out.split(from).length!==2)throw Error('Expected one occurrence of '+from);return out.replace(from,()=>to)},text)
 const claudeCommon=swap(common,[['Ask ChatGPT to create a custom view','Ask Claude to create a custom view'],['Ask ChatGPT to create your first custom view.','Ask Claude to create your first custom view.']])
 const claudeShared=swap(shared,[['Copy message to ChatGPT','Copy message to Claude']])
 const renderer=await readFile('dist/pipeline-renderer.html','utf8')
 const claudeHost=swap(await read('app/web/claude.js'),[['__PIPELINE_RENDERER_PAGE__',JSON.stringify(renderer)]])
 const claude=await bundle(claudeCommon+'\n'+claudeShared+'\n'+claudeHost)
 const mark='data:image/png;base64,'+(await readFile(new URL('../assets/mark-dark-56.png',import.meta.url))).toString('base64')
 const claudeShell=swap(shell,[['<link rel="icon" href="/trialagents-mark-black.png" type="image/png">',''],['src="/trialagents-mark-white.png"','src="'+mark+'"']])
 await writeFile('dist/pipeline-claude.html',swap(claudeShell,[['<script src="/pipeline-assets/pipeline.js"></script>','<script>'+claude.replace(/<\/script/gi,'<\\/script')+'</script>']]))
}
await build({entryPoints:['mcp/http.mjs'],platform:'node',format:'cjs',target:'node22',bundle:true,outfile:'dist/pipeline-mcp.cjs',minify:true,legalComments:'eof'})

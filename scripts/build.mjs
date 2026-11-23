import {readFile,mkdir,writeFile} from 'node:fs/promises'
import {build,transform} from 'esbuild'
const read=p=>readFile(new URL('../'+p,import.meta.url),'utf8')
await mkdir('dist',{recursive:true})
let shell=await read('app/web/shell.html')
shell=shell.replace('</style>','\n:root{--pipeline-accent:#14644e}.primary{background:var(--pipeline-accent)!important}.account-frame{width:100%;height:75vh;border:0}.settings-tabs{overflow:auto}#notice:not(:empty){position:fixed;bottom:1rem;right:1rem;z-index:100;background:#17362a;color:white;padding:.7rem 1rem;border-radius:8px}pre{white-space:pre-wrap;overflow-wrap:anywhere}#rail select{max-width:100%;background:#202824;color:white}#rail button{flex-shrink:0}</style>')
const common=await read('app/web/planner.js')+'\n'+await read('app/web/workspace.js')
async function bundle(source){
 return (await build({stdin:{contents:"import {into} from './app/web/sanitize.js';import {paintChart} from './app/web/chart.jsx';\n"+source,resolveDir:process.cwd()},bundle:true,jsx:'automatic',define:{'process.env.NODE_ENV':'"production"'},minify:true,format:'iife',target:'es2022',write:false})).outputFiles[0].text
}
const main=await bundle(common+'\n'+await read('app/web/browser.js'))
await writeFile('dist/pipeline.js',main);await writeFile('dist/pipeline.html',shell)
if(process.argv.includes('--widget')){
 const bridge=(await build({entryPoints:['app/web/host.js'],bundle:true,minify:true,write:false,format:'iife',target:'es2022'})).outputFiles[0].text
 const widget=(await bundle(common))+'\n'+bridge
 await writeFile('dist/pipeline-widget.html',shell.replace('<script src="/pipeline-assets/pipeline.js"></script>',()=>'<script>'+widget.replace(/<\/script/gi,'<\\/script')+'</script>'))
}

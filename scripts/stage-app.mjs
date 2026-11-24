// Assemble a disposable Render build directory from a pinned Pipeline checkout.
import {cp,mkdir,readFile,access} from 'node:fs/promises'
import {execFileSync} from 'node:child_process'
import path from 'node:path'
import {fileURLToPath} from 'node:url'
const root=fileURLToPath(new URL('../',import.meta.url)),host=process.argv[2]&&path.resolve(process.argv[2])
if(!host||host===path.resolve(root))throw Error('Specify the existing shared web service build directory')
const shared=path.join(root,'integration/shared-web')
const required=['dist/pipeline.js','dist/pipeline.html','dist/pipeline-renderer.html','dist/pipeline-chatgpt.html','dist/pipeline-embedded.html','dist/pipeline-embedded.js','dist/pipeline-mcp.cjs']
await Promise.all(required.map(f=>access(path.join(root,f))))
const config=await readFile(path.join(host,'app/lib/oauth-config.ts'),'utf8')
if(!config.includes('function pipelineResource('))throw Error('Expected the shared web baseline with standalone Pipeline enabled')
for(const patch of ['pipeline-oauth.patch','pipeline-account.patch']){
 const apply=(...args)=>execFileSync('git',['-C',host,'apply',...args,path.join(shared,patch)],{stdio:'pipe'})
 try{apply('--reverse','--check')}catch{apply('--check');apply()}
}
await cp(path.join(shared,'app'),path.join(host,'app'),{recursive:true})
const lib=path.join(host,'app/lib/pipeline');await mkdir(lib,{recursive:true})
await cp(path.join(root,'app/server'),lib,{recursive:true})
for(const f of ['adapter.ts','types.d.mts','billing.d.mts','store.d.mts','pipeline-mcp.d.cts'])await cp(path.join(shared,f),path.join(lib,f))
await cp(path.join(root,'dist/pipeline-mcp.cjs'),path.join(lib,'pipeline-mcp.cjs'))
await cp(path.join(shared,'worker.mjs'),path.join(host,'scripts/pipeline-worker.mjs'))
const assets=path.join(host,'public/pipeline-assets');await mkdir(assets,{recursive:true})
for(const f of required.filter(f=>!f.endsWith('.cjs')))await cp(path.join(root,f),path.join(assets,path.basename(f)))

// Install this revision into a clean checkout of the Intel web deploy repository.
import {cp,mkdir} from 'node:fs/promises'
import {execFileSync} from 'node:child_process'
import path from 'node:path'
const target=process.argv[2]
if(!target)throw Error('Usage: node scripts/stage-app.mjs /path/to/intel_agent_app')
const host=path.resolve(target),src=path.resolve('integration/intel-app')
execFileSync('git',['-C',host,'apply','--check',src+'/host.patch'])
execFileSync('git',['-C',host,'apply',src+'/host.patch'])
await cp(src+'/app',host+'/app',{recursive:true})
await cp('app/server',host+'/app/lib/pipeline',{recursive:true})
for(const f of ['adapter.ts','types.d.mts','billing.d.mts','store.d.mts'])await cp(src+'/'+f,host+'/app/lib/pipeline/'+f)
await cp(src+'/worker.mjs',host+'/scripts/pipeline-worker.mjs')
await mkdir(host+'/public/pipeline-assets',{recursive:true})
for(const f of ['pipeline.html','pipeline.js'])await cp('dist/'+f,host+'/public/pipeline-assets/'+f)

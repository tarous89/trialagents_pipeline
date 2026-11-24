import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {introspectAccessToken} from '@/app/lib/oauth-server';
import {pipelineResource} from '@/app/lib/oauth-config';
import {getSql} from '@/db';
import {runPipeline,selection} from '@/app/lib/pipeline/adapter';
import {pipelineHttp} from '@/app/lib/pipeline/pipeline-mcp.cjs';
export const runtime='nodejs';
export const dynamic='force-dynamic';
let widget:Promise<string>|undefined;
const readWidget=()=>widget??=readFile(path.join(process.cwd(),'public/pipeline-assets/pipeline-chatgpt.html'),'utf8').catch(error=>{widget=undefined;throw error});
async function endpoint(request:Request){
 if(process.env.PIPELINE_ENABLED!=='true'||process.env.PIPELINE_MCP_ENABLED!=='true')return new Response(null,{status:404});
 const serve=pipelineHttp({audience:pipelineResource(true),readWidget,selection,run:runPipeline,authorize:async(token:string,audience:string)=>{
   const info=await introspectAccessToken(token);
   if(!info.active||!info.sub||info.resource!==audience||!String(info.scope).split(' ').includes('mcp:tools'))return null;
   const [user]=await getSql()`SELECT id,email,first_name AS "firstName",last_name AS "lastName" FROM users WHERE id=${info.sub}`;
   return user?{...user,accessDigest:createHash('sha256').update(token).digest('hex')}:null;
 }});
 return serve(request);
}
export {endpoint as GET,endpoint as POST,endpoint as DELETE};

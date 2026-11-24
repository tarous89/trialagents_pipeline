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
const readWidget=()=>widget??=readFile(path.join(process.cwd(),'public/pipeline-assets/pipeline-claude.html'),'utf8').catch(error=>{widget=undefined;throw error});
// The shared MCP handler declares the ChatGPT widget domain. Claude expects its own
// sandbox host for this server URL, so Claude responses carry that host instead.
const sharedDomain='"domain":"https://pipeline.trialagents.com"';
const claudeDomain='"domain":"'+createHash('sha256').update(pipelineResource(true)).digest('hex').slice(0,32)+'.claudemcpcontent.com"';
async function endpoint(request:Request){
 if(process.env.PIPELINE_ENABLED==='false'||process.env.PIPELINE_MCP_ENABLED==='false')return new Response(null,{status:404});
 const serve=pipelineHttp({audience:pipelineResource(true),readWidget,selection,run:runPipeline,authorize:async(token:string,audience:string)=>{
   const info=await introspectAccessToken(token);
   if(!info.active||!info.sub||info.resource!==audience||!String(info.scope).split(' ').includes('mcp:tools'))return null;
   const [user]=await getSql()`SELECT id,email,first_name AS "firstName",last_name AS "lastName" FROM users WHERE id=${info.sub}`;
   return user?{...user,accessDigest:createHash('sha256').update(token).digest('hex')}:null;
 }});
 const response=await serve(request);
 if(request.method!=='POST'||!response.body)return response;
 const text=await response.text();
 const headers=new Headers(response.headers);headers.delete('content-length');
 return new Response(text.split(sharedDomain).join(claudeDomain),{status:response.status,headers});
}
export {endpoint as GET,endpoint as POST,endpoint as DELETE};

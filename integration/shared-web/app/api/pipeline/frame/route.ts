import {pipelineResource} from '@/app/lib/oauth-config';
import {db,runPipeline,selection,listenWorkspace} from '@/app/lib/pipeline/adapter';
import {serveFrame} from '@/app/lib/pipeline/frame.mjs';
export const runtime='nodejs';
export async function POST(request:Request){
 if(process.env.PIPELINE_ENABLED==='false'||process.env.PIPELINE_MCP_ENABLED==='false')return new Response(null,{status:404});
 return serveFrame(request,{db,selection,listenWorkspace,run:runPipeline,audience:{[pipelineResource()]:'ChatGPT',[pipelineResource(true)]:'Claude'}});
}

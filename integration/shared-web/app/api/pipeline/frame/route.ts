import {pipelineResource} from '@/app/lib/oauth-config';
import {db,runPipeline,selection} from '@/app/lib/pipeline/adapter';
import {serveFrame} from '@/app/lib/pipeline/frame.mjs';
export const runtime='nodejs';
export async function POST(request:Request){
 if(process.env.PIPELINE_ENABLED!=='true'||process.env.PIPELINE_MCP_ENABLED!=='true')return new Response(null,{status:404});
 return serveFrame(request,{db,selection,run:runPipeline,audience:pipelineResource()});
}

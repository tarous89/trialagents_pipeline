import {pipelineResource,oauthIssuer} from '@/app/lib/oauth-config';
import {protectedResource} from '@/app/lib/pipeline/pipeline-mcp.cjs';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function GET(){
 if(process.env.PIPELINE_ENABLED!=='true'||process.env.PIPELINE_MCP_ENABLED!=='true')return new Response(null,{status:404});
 return protectedResource(oauthIssuer()+'/oauth/intel',pipelineResource(true));
}

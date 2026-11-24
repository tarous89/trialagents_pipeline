import {readFile} from 'node:fs/promises';
import path from 'node:path';
export const runtime='nodejs';
export const dynamic='force-dynamic';
// Claude frames this page from the Pipeline connector's sandbox host, which is
// the first 32 hex characters of sha256('https://mcp.trialagents.com/pipeline/claude')
// under claudemcpcontent.com. Browsers check every ancestor, so claude.ai is listed too.
const claudeSandbox='https://902202f9dd8f7b5c489c362d072e95f2.claudemcpcontent.com';
export async function GET(){
 if(process.env.PIPELINE_ENABLED==='false'||process.env.PIPELINE_MCP_ENABLED==='false')return new Response(null,{status:404});
 const body=await readFile(path.join(process.cwd(),'public/pipeline-assets/pipeline-embedded-claude.html'),'utf8');
 return new Response(body,{headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-cache',
  'Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-src 'self' about:; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'self' "+claudeSandbox+" https://claude.ai",
  'Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff'}});
}

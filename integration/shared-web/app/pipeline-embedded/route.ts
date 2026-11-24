import {readFile} from 'node:fs/promises';
import path from 'node:path';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function GET(){
 if(process.env.PIPELINE_ENABLED!=='true'||process.env.PIPELINE_MCP_ENABLED!=='true')return new Response(null,{status:404});
 const body=await readFile(path.join(process.cwd(),'public/pipeline-assets/pipeline-embedded.html'),'utf8');
 return new Response(body,{headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-cache',
  'Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-src 'self' about:; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'self' https://chatgpt.com https://*.chatgpt.com https://web-sandbox.oaiusercontent.com https://*.oaiusercontent.com",
  'Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff'}});
}

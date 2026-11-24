import {readFile} from 'node:fs/promises';
import path from 'node:path';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function GET(){
 if(process.env.PIPELINE_ENABLED!=='true')return new Response('Unavailable',{status:404});
 const html=await readFile(path.join(process.cwd(),'public/pipeline-assets/pipeline.html'),'utf8');
 return new Response(html,{headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'private, no-store',
 'Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; frame-src 'self'; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'self'",
 'Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff'}});
}

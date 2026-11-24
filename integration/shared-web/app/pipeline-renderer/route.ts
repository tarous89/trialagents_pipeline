import {readFile} from 'node:fs/promises';
import path from 'node:path';
export const runtime='nodejs';
export async function GET(){
 const body=await readFile(path.join(process.cwd(),'public/pipeline-assets/pipeline-renderer.html'),'utf8');
 return new Response(body,{headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'public, max-age=300','Referrer-Policy':'no-referrer','Permissions-Policy':'camera=(), microphone=(), geolocation=(), payment=()','X-Content-Type-Options':'nosniff'}});
}

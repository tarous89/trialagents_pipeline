import {NextRequest,NextResponse} from 'next/server';
import {authenticatedUser} from '@/app/lib/auth';
import {introspectAccessToken} from '@/app/lib/oauth-server';
import {oauthResource} from '@/app/lib/oauth-config';
import {getSql} from '@/db';
import {runPipeline} from '@/app/lib/pipeline/adapter';
export const runtime='nodejs';
const reply=(body:unknown,status=200)=>NextResponse.json(body,{status,headers:{'Cache-Control':'private, no-store','Vary':'Authorization, Cookie'}});
export async function POST(request:NextRequest){
  if(process.env.PIPELINE_ENABLED!=='true')return reply({error:'Pipeline unavailable'},404);
  try{
    const bearer=request.headers.get('authorization');
    let user,source='web';
    if(bearer){
      const token=bearer.match(/^Bearer (\S+)$/i)?.[1];
      if(!token)return reply({error:'Invalid authorization'},401);
      const info=await introspectAccessToken(token);
      const base=oauthResource().replace(/\/mcp$/,'');
      if(!info.active||!info.sub||!String(info.scope).split(' ').includes('mcp:tools')||![base+'/pipeline/mcp',base+'/pipeline-claude/mcp'].includes(String(info.resource)))return reply({error:'Connect Pipeline'},401);
      const [row]=await getSql()`SELECT id,email,first_name AS "firstName",last_name AS "lastName" FROM users WHERE id=${info.sub}`;
      user=row;source=info.resource===base+'/pipeline/mcp'?'ChatGPT':'Claude';
    }else{
      if(request.headers.get('origin')!=='https://pipeline.trialagents.com' && !(process.env.NODE_ENV!=='production'&&request.headers.get('origin')===request.nextUrl.origin))return reply({error:'Unexpected request origin'},403);
      user=await authenticatedUser(request);
    }
    if(!user)return reply({error:'Sign in to Pipeline'},401);
    if(!request.headers.get('content-type')?.startsWith('application/json'))return reply({error:'Use JSON'},415);
    const cap=12*1024*1024,reader=request.body?.getReader();if(!reader)return reply({error:'Missing request body'},400);
    let size=0;const chunks:Uint8Array[]=[];
    for(;;){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>cap){await reader.cancel();return reply({error:'Save fewer attachments at once'},413)}chunks.push(value);}
    let input;try{input=JSON.parse(Buffer.concat(chunks).toString('utf8'))}catch{return reply({error:'Invalid JSON'},400)}
    return reply(await runPipeline(user,input,source));
  }catch(e){const error=e as {status?:number;message?:string};return reply({error:error.status?error.message:'Pipeline could not complete the request'},error.status??500);}
}

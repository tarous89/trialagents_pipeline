import {createHash} from 'node:crypto'
const reply=(body,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'private, no-store','Referrer-Policy':'no-referrer'}})
const origin='https://pipeline.trialagents.com'
export async function serveFrame(request,{db,run,audience}){
 const requestOrigin=request.headers.get('origin')
 if((requestOrigin&&requestOrigin!==origin)||request.headers.get('x-pipeline-surface')!=='workspace')return reply({error:'Unexpected request origin'},403)
 const token=/^Pipeline-Frame ([a-f0-9]{64})$/.exec(request.headers.get('authorization')||'')?.[1]
 if(!token)return reply({error:'Open the workspace from ChatGPT'},401)
 try{
   const digest=createHash('sha256').update(token).digest('hex')
   const [grant]=await db.transaction(q=>q(`SELECT f.workspace_id,u.id,u.email,u.first_name AS "firstName",u.last_name AS "lastName",u.organization
     FROM pipeline.frame_access f JOIN oauth_access_tokens t ON t.token_hash=f.access_digest AND t.user_id=f.user_id
     JOIN users u ON u.id=t.user_id
     WHERE f.challenge=$1 AND f.expires_at>now() AND t.revoked_at IS NULL AND t.expires_at>now()
       AND t.resource=$2 AND 'mcp:tools'=ANY(string_to_array(t.scope,' '))`,[digest,audience]))
   if(!grant)return reply({error:'Reconnect the workspace'},401)
   if(!request.headers.get('content-type')?.startsWith('application/json'))return reply({error:'Use JSON'},415)
   const reader=request.body?.getReader()
   if(!reader)return reply({error:'Missing request'},400)
   const chunks=[]
   let bytes=0
   for(;;){
     const {done,value}=await reader.read()
     if(done)break
     bytes+=value.byteLength
     if(bytes>12*1024*1024){await reader.cancel();return reply({error:'Save fewer attachments at once'},413)}
     chunks.push(value)
   }
   let req
   try{req=JSON.parse(Buffer.concat(chunks).toString('utf8'))}catch{return reply({error:'Invalid request'},400)}
   if(req?.workspace!==grant.workspace_id||req.op==='frame.connect')return reply({error:'Workspace access unavailable'},403)
   return reply(await run(grant,req,'ChatGPT workspace'))
 }catch(e){return reply({error:e.status?e.message:'Pipeline request failed'},e.status??500)}
}

import {workspaceEvents} from './events.mjs'
import {createHash} from 'node:crypto'
const reply=(body,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'private, no-store','Referrer-Policy':'no-referrer'}})
const origin='https://pipeline.trialagents.com'
// audience: one OAuth resource, or a map from each resource to its assistant name.
export async function serveFrame(request,{db,run,audience,selection,listenWorkspace}){
 const assistants=typeof audience==='string'?{[audience]:'ChatGPT'}:audience
 const requestOrigin=request.headers.get('origin')
 if((requestOrigin&&requestOrigin!==origin)||request.headers.get('x-pipeline-surface')!=='workspace')return reply({error:'Unexpected request origin'},403)
 const token=/^Pipeline-Frame ([a-f0-9]{64})$/.exec(request.headers.get('authorization')||'')?.[1]
 if(!token)return reply({error:'Open the workspace from your assistant'},401)
 try{
   const digest=createHash('sha256').update(token).digest('hex')
   const readGrant=()=>db.transaction(q=>q(`SELECT f.workspace_id,t.resource,u.id,u.email,u.first_name AS "firstName",u.last_name AS "lastName",u.organization
     FROM pipeline.frame_access f JOIN oauth_access_tokens t ON t.token_hash=f.access_digest AND t.user_id=f.user_id
     JOIN users u ON u.id=t.user_id
     WHERE f.challenge=$1 AND f.expires_at>now() AND t.revoked_at IS NULL AND t.expires_at>now()
       AND t.resource=ANY($2) AND 'mcp:tools'=ANY(string_to_array(t.scope,' '))`,[digest,Object.keys(assistants)]))
   const [grant]=await readGrant()
   if(!grant)return reply({error:'Reconnect the workspace'},401)
   const surface=assistants[grant.resource]+' workspace'
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
   if(req.op==='workspace.events'){
     if(!listenWorkspace)return reply({error:'Stream unavailable'},503)
     return await workspaceEvents(grant.workspace_id,request.signal,listenWorkspace,async()=>{
       const [current]=await readGrant()
       if(!current)throw Object.assign(Error('Reconnect the workspace'),{status:401})
       return run(current,{workspace:req.workspace,op:'workspace.access'},surface)
     })
   }
   if(req.op==='selection.wait'||req.op==='selection.answer'){
     const {instance,id,context}=req.input??{}
     if(!selection||!/^([a-f0-9-]{36})\.[A-Za-z0-9_-]{22}$/.test(instance))return reply({error:'Invalid panel instance'},400)
     const scope=[grant.id,grant.workspace_id,instance]
     if(req.op==='selection.wait')return reply(await selection.wait(scope,request.signal)??{})
     if(typeof id!=='string'||!/^[a-f0-9-]{36}$/.test(id)||context&&(
       context.workspace!==grant.workspace_id||Buffer.byteLength(JSON.stringify(context))>6000||
       Object.keys(context).some(k=>!['workspace','tab','filters','view','record','section','lastAction'].includes(k))
     ))return reply({error:'Invalid selection response'},400)
     await selection.answer(scope,id,context??null)
     return reply({})
   }
   return reply(await run(grant,req,surface))
 }catch(e){return reply({error:e.status?e.message:'Pipeline request failed'},e.status??500)}
}

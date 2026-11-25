import {createHmac,randomUUID} from 'node:crypto'
import {Server,createMcpHandler} from '@modelcontextprotocol/server'
import {describe,instructions,invoke,toolList,widgetUri} from './tools.mjs'

export const resource='https://mcp.trialagents.com/pipeline/chatgpt'
export const claudeResource='https://mcp.trialagents.com/pipeline/claude'
export const metadataPath='/.well-known/oauth-protected-resource/pipeline/chatgpt'
// Each assistant has its own OAuth audience and route. Both run the same tools and store.
const assistantFor=audience=>new URL(audience).pathname==='/pipeline/claude'?'Claude':'ChatGPT'
const discoveryPath=audience=>'/.well-known/oauth-protected-resource'+new URL(audience).pathname
const origin='https://pipeline.trialagents.com'
const mime='text/html;profile=mcp-app'
const resourceMeta={'openai/ui':{availableDisplayModes:['inline','fullscreen'],preferredDisplayMode:'fullscreen'},ui:{domain:origin,csp:{connectDomains:[],resourceDomains:[],frameDomains:[origin]}},'openai/widgetDomain':origin,'openai/widgetCSP':{connect_domains:[],resource_domains:[],frame_domains:[origin],redirect_domains:[origin]}}
export function protectedResource(issuer='https://intel.trialagents.com/oauth/intel',audience=resource){
 return Response.json({resource:audience,authorization_servers:[issuer],scopes_supported:['mcp:tools'],bearer_methods_supported:['header']},{headers:{'Cache-Control':'no-store'}})
}
export function pipelineHttp({authorize,run,readWidget,selection,audience=resource}){
 return async request=>{
   const assistant=assistantFor(audience)
   if(new URL(request.url).pathname!==new URL(audience).pathname)return new Response(null,{status:404})
   const token=/^Bearer (\S+)$/i.exec(request.headers.get('authorization')??'')?.[1]
   let user
   try{if(token)user=await authorize(token,audience)}catch{return Response.json({error:'Authorization temporarily unavailable'},{status:503})}
   if(!user)return Response.json({error:'Connect Pipeline'},{status:401,headers:{'WWW-Authenticate':'Bearer resource_metadata="'+new URL(discoveryPath(audience),audience).href+'", scope="mcp:tools"','Cache-Control':'no-store'}})
   const handler=createMcpHandler(()=>{
     const server=new Server({name:'TrialAgents Pipeline',version:'0.2.5'},{capabilities:{tools:{},resources:{}},instructions})
     server.setRequestHandler('tools/list',()=>({tools:toolList}))
     server.setRequestHandler('tools/call',({params})=>{
       // Continuation of a displayed result. All data access still goes through the store.
       const session=params._meta?.['openai/session']
       const context=createHmac('sha256',token).update(JSON.stringify(['pipeline-presentation-v1',user.id,typeof session==='string'?session:null])).digest('base64url').slice(0,24)
       const sign=(workspace,id)=>createHmac('sha256',token).update(JSON.stringify(['pipeline-panel-v1',context,workspace,id])).digest('base64url').slice(0,22)
       const operation=async(r,surface)=>{
         if(r.op!=='selection.read')return run(user,r,surface==='workspace'?assistant+' workspace':assistant)
         const [id,signature]=r.input.instance.split('.')
         if(!selection||signature!==sign(r.workspace,id))throw Object.assign(Error('This panel is unavailable in this conversation.'),{status:409})
         await run(user,{op:'assistant.design',workspace:r.workspace},assistant)
         return selection.ask([user.id,r.workspace,r.input.instance])
       }
       return invoke(params.name,params.arguments??{},operation,context).then(reply=>{
         const target=reply._meta?.pipeline
         if(selection&&target?.workspace&&target.url){
           const id=randomUUID(),instance=id+'.'+sign(target.workspace,id)
           target.panel_instance=instance;reply.structuredContent.result.panel_instance=instance;describe(reply)
         }
         return reply
       })
     })
     server.setRequestHandler('resources/list',()=>({resources:[{uri:widgetUri,name:'Pipeline workspace',mimeType:mime,_meta:resourceMeta}]}))
     server.setRequestHandler('resources/read',async({params})=>{
       if(![widgetUri,'ui://trialagents-pipeline/chatgpt-workspace-v4.html','ui://trialagents-pipeline/chatgpt-workspace-v3.html','ui://trialagents-pipeline/chatgpt-workspace-v2.html'].includes(params.uri))throw Error('Unknown Pipeline resource')
       return {contents:[{uri:params.uri,mimeType:mime,text:await readWidget(),_meta:resourceMeta}]}
     })
     return server
   },{legacy:'stateless',maxRequestBodySize:320000})
   const response=await handler.fetch(request)
   response.headers.set('Cache-Control','private, no-store')
   return response
 }
}

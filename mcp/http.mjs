import {Server,createMcpHandler} from '@modelcontextprotocol/server'
import {instructions,invoke,toolList,widgetUri} from './tools.mjs'

export const resource='https://mcp.trialagents.com/pipeline/chatgpt'
export const metadataPath='/.well-known/oauth-protected-resource/pipeline/chatgpt'
const origin='https://pipeline.trialagents.com'
const mime='text/html;profile=mcp-app'
const resourceMeta={ui:{domain:origin,csp:{connectDomains:[],resourceDomains:[],frameDomains:[origin]}},'openai/widgetDomain':origin,'openai/widgetCSP':{connect_domains:[],resource_domains:[],frame_domains:[origin],redirect_domains:[origin]}}
export function protectedResource(issuer='https://intel.trialagents.com/oauth/intel',audience=resource){
 return Response.json({resource:audience,authorization_servers:[issuer],scopes_supported:['mcp:tools'],bearer_methods_supported:['header']},{headers:{'Cache-Control':'no-store'}})
}
export function pipelineHttp({authorize,run,readWidget,audience=resource}){
 return async request=>{
   if(new URL(request.url).pathname!=='/pipeline/chatgpt')return new Response(null,{status:404})
   const token=/^Bearer (\S+)$/i.exec(request.headers.get('authorization')??'')?.[1]
   let user
   try{if(token)user=await authorize(token,audience)}catch{return Response.json({error:'Authorization temporarily unavailable'},{status:503})}
   if(!user)return Response.json({error:'Connect Pipeline'},{status:401,headers:{'WWW-Authenticate':'Bearer resource_metadata="'+new URL(metadataPath,audience).href+'", scope="mcp:tools"','Cache-Control':'no-store'}})
   const handler=createMcpHandler(()=>{
     const server=new Server({name:'TrialAgents Pipeline',version:'0.2.0'},{capabilities:{tools:{},resources:{}},instructions})
     server.setRequestHandler('tools/list',()=>({tools:toolList}))
     server.setRequestHandler('tools/call',({params})=>invoke(params.name,params.arguments??{},(r,surface)=>run(user,r,surface==='workspace'?'ChatGPT workspace':'ChatGPT')))
     server.setRequestHandler('resources/list',()=>({resources:[{uri:widgetUri,name:'Pipeline workspace',mimeType:mime,_meta:resourceMeta}]}))
     server.setRequestHandler('resources/read',async({params})=>{
       if(![widgetUri,'ui://trialagents-pipeline/chatgpt-workspace-v3.html','ui://trialagents-pipeline/chatgpt-workspace-v2.html'].includes(params.uri))throw Error('Unknown Pipeline resource')
       return {contents:[{uri:params.uri,mimeType:mime,text:await readWidget(),_meta:resourceMeta}]}
     })
     return server
   },{legacy:'stateless',maxRequestBodySize:320000})
   const response=await handler.fetch(request)
   response.headers.set('Cache-Control','private, no-store')
   return response
 }
}

// Claude host: the workspace is bundled into the MCP App view. Claude does not let
// this connector frame pipeline.trialagents.com, so data travels through the
// app-only pipeline_workspace_request tool on the same MCP connection.
import {App} from '@modelcontextprotocol/ext-apps'
window.pipelineHost=true
window.pipelineAssistant='Claude'
window.pipelineBundled=true

const app=new App({name:'TrialAgents Pipeline',version:'0.5.0'},{tools:{},availableDisplayModes:['inline','fullscreen']},{autoResize:false})

// Authored views render in an opaque sandbox. Claude allows blob: frames, so the
// renderer page ships inside the bundle instead of loading from the app origin.
const rendererPage=__PIPELINE_RENDERER_PAGE__
let rendererUrl
window.pipelineRendererSource=()=>rendererUrl??=URL.createObjectURL(new Blob([rendererPage],{type:'text/html'}))

async function hostRequest(type,body){
 if(type==='open-link'){
   const result=await app.openLink({url:body.url})
   if(result?.isError)throw Error('The link could not be opened.')
   return
 }
 if(type==='send-message'){
   const result=await app.sendMessage({role:'user',content:[{type:'text',text:body.prompt}]})
   if(result?.isError)throw Error('Message declined')
   return
 }
 throw Error('Request unavailable')
}
window.pipelineTransport=async(request,signal)=>{
 const reply=await app.callServerTool({name:'pipeline_workspace_request',arguments:{request}},signal?{signal}:undefined)
 if(reply.isError)throw Object.assign(Error(reply.content?.find(c=>c.type==='text')?.text||'Pipeline request failed'),{status:reply.structuredContent?.status})
 return reply.structuredContent?.result
}
async function waitForSelection(workspace,instance,signal){
 return window.pipelineTransport({op:'selection.wait',workspace,input:{instance}},signal)
}

function showError(message,label,retry){
 const text=document.createElement('p'),button=document.createElement('button')
 text.textContent=message;button.textContent=label
 button.onclick=async()=>{button.disabled=true;try{await retry()}catch(e){showError(e.message,label,retry)}}
 el('app').replaceChildren(text,button);state=null
}
async function callTool(name,args){
 const reply=await app.callServerTool({name,arguments:args})
 if(reply.isError)throw Error(reply.content?.find(c=>c.type==='text')?.text||'Workspace request failed')
 return reply._meta?.pipeline??reply.structuredContent?.result
}
function route(next){
 if(next.pending){showError('The view save could not be verified.','Retry save',async()=>route(await callTool('retry_pipeline_view',{workspace:next.workspace,request_id:next.request_id})));return}
 if(next.reopen){
   const retry=async()=>route(await callTool('open_pipeline',{workspace:next.workspace,view:next.id}))
   void retry().catch(()=>showError('Your view was saved.','Open saved view',retry));return
 }
 void showTarget({workspace:next.workspace,url:next.url,instance:next.panel_instance})
}
app.ontoolresult=result=>{
 const next=result._meta?.pipeline??result.structuredContent?.result
 if(next?.workspace&&(next.url||next.pending||next.reopen))route(next)
 else if(next?.workspace&&state?.workspace===next.workspace)scheduleWorkspaceRefresh(true)
}

// Claude can ask the open view for its current selection.
app.onlisttools=async()=>({tools:[{name:'read_current_pipeline_view',description:'Read the saved selection in this open workspace when the user’s request needs the current view or selected record.',inputSchema:{type:'object',properties:{},additionalProperties:false}}]})
app.oncalltool=async({name})=>{
 if(name!=='read_current_pipeline_view'||!state)return {isError:true,content:[{type:'text',text:'No active Pipeline workspace.'}]}
 try{return {content:[{type:'text',text:JSON.stringify(await currentSelection())}]}}
 catch{return {isError:true,content:[{type:'text',text:'The active workspace selection is unavailable. Do not infer a selection from earlier messages.'}]}}
}
app.onteardown=async()=>{panelWait?.abort();return {}}
function resize(ctx){
 const d=ctx?.containerDimensions
 if(d?.height||ctx?.displayMode==='fullscreen')return
 void app.sendSizeChanged({height:Math.min(d?.maxHeight||720,720)}).catch(()=>{})
}
app.onhostcontextchanged=resize
app.connect().then(()=>resize(app.getHostContext())).catch(e=>showError(e.message,'Retry',async()=>location.reload()))

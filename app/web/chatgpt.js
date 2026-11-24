import {App} from '@modelcontextprotocol/ext-apps'
const origin='https://pipeline.trialagents.com'
const app=new App({name:'TrialAgents Pipeline',version:'0.3.0'},{availableDisplayModes:['inline','fullscreen']},{autoResize:false})
const status=document.querySelector('main')
let frame,port,target
async function tool(name,args){
 const reply=await app.callServerTool({name,arguments:args})
 if(reply.isError)throw Error(reply.content?.find(c=>c.type==='text')?.text||'Workspace request failed')
 return reply._meta?.pipeline??reply.structuredContent?.result
}
function showError(message,label,retry){
 frame?.remove();frame=null;port?.close();port=null
 status.hidden=false;status.textContent=message+' '
 const button=document.createElement('button');button.textContent=label
 button.onclick=async()=>{button.disabled=true;try{await retry()}catch(e){showError(e.message,label,retry)}}
 status.append(button)
}
function route(next){
 target=next
 if(next.pending){showError('The view save could not be verified.','Retry save',async()=>route(await tool('retry_pipeline_view',{workspace:next.workspace,request_id:next.request_id})));return}
 if(next.reopen){showError('Your view was saved.','Open saved view',async()=>route(await tool('open_pipeline',{workspace:next.workspace,view:next.id})));return}
 if(frame){sendTarget();return}
 frame=document.createElement('iframe')
 frame.title='TrialAgents Pipeline workspace'
 frame.referrerPolicy='no-referrer'
 frame.setAttribute('sandbox','allow-scripts allow-same-origin allow-forms allow-downloads')
 frame.src=origin+'/pipeline-embedded'
 status.hidden=true;document.body.append(frame)
}
function sendTarget(){
 if(port&&target)port.postMessage({type:'target',workspace:target.workspace,url:target.url})
}
window.addEventListener('message',event=>{
 if(event.origin!==origin||!frame||event.source!==frame.contentWindow||event.data?.type!=='pipeline-ready'||!event.ports[0])return
 port?.close()
 const channel=event.ports[0];port=channel
 channel.onmessage=async({data})=>{
   try{
     if(data.type==='authorize'){
       await tool('connect_pipeline_frame',{workspace:data.workspace,challenge:data.challenge})
     }else if(data.type==='open-link'){
       const url=new URL(data.url)
       if(url.origin!==origin)throw Error('Invalid workspace link')
       await app.openLink({url:url.href})
     }else return
     channel.postMessage({id:data.id,ok:true})
   }catch(e){channel.postMessage({id:data.id,error:e.message})}
 }
 sendTarget()
})
app.ontoolresult=result=>{if(result._meta?.pipeline)route(result._meta.pipeline)}
app.onteardown=async()=>{port?.close();frame?.remove();return {}}
function resize(ctx){
 const d=ctx?.containerDimensions
 if(d?.height||ctx?.displayMode==='fullscreen')return
 void app.sendSizeChanged({height:Math.min(d?.maxHeight||720,720)}).catch(()=>{})
}
app.onhostcontextchanged=resize
app.connect().then(()=>resize(app.getHostContext())).catch(e=>{status.hidden=false;status.textContent=e.message})

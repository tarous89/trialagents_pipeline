// ChatGPT host: the workspace runs in a first-party frame on pipeline.trialagents.com.
window.pipelineHost=true
window.pipelineAssistant='ChatGPT'

// Only the digest crosses the MessagePort. Workspace data and the frame secret
// travel directly between this first-party page and its same-origin API.
const bridge=new MessageChannel(),waiting=new Map(),grants=new Map()
const hex=bytes=>Array.from(new Uint8Array(bytes),n=>n.toString(16).padStart(2,'0')).join('')
function hostRequest(type,body){
 const id=crypto.randomUUID()
 return new Promise((resolve,reject)=>{
   const timer=setTimeout(()=>{waiting.delete(id);reject(Error('The ChatGPT connection timed out. Open the workspace again.'))},30000)
   waiting.set(id,result=>{clearTimeout(timer);result.ok?resolve():reject(Error(result.error||'Request unavailable'))})
   bridge.port1.postMessage({type,id,...body})
 })
}
async function authorize(workspace){
 const secret=hex(crypto.getRandomValues(new Uint8Array(32)))
 const challenge=hex(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(secret)))
 await hostRequest('authorize',{workspace,challenge})
 return secret
}
function grant(workspace){
 if(!grants.has(workspace)){
   const pending=authorize(workspace).catch(e=>{if(grants.get(workspace)===pending)grants.delete(workspace);throw e})
   grants.set(workspace,pending)
 }
 return grants.get(workspace)
}
window.pipelineTransport=async (request,signal)=>{
 const send=async secret=>fetch('/api/pipeline/frame',{method:'POST',signal,mode:'same-origin',credentials:'omit',referrerPolicy:'strict-origin',cache:'no-store',headers:{'Content-Type':'application/json','X-Pipeline-Surface':'workspace','Authorization':'Pipeline-Frame '+secret},body:JSON.stringify(request)})
 const current=grant(request.workspace)
 let res=await send(await current)
 if(res.status===401){
   if(grants.get(request.workspace)===current)grants.delete(request.workspace)
   res=await send(await grant(request.workspace))
 }
 if(request.op==='workspace.events')return res
 const result=await res.json()
 if(!res.ok)throw Object.assign(Error(result.error||'Pipeline request failed'),{status:res.status})
 return result
}
async function waitForSelection(workspace,instance,signal){
 const secret=await grant(workspace)
 const response=await fetch('/api/pipeline/frame',{method:'POST',credentials:'omit',signal,cache:'no-store',headers:{'Content-Type':'application/json','X-Pipeline-Surface':'workspace',Authorization:'Pipeline-Frame '+secret},body:JSON.stringify({op:'selection.wait',workspace,input:{instance}})})
 if(response.status===401){grants.delete(workspace);return null}
 if(!response.ok)throw Error('Selection request unavailable')
 return response.json()
}
bridge.port1.onmessage=({data})=>{
 if(data.type==='refresh'){if(state?.workspace===data.workspace)scheduleWorkspaceRefresh(true);return}
 if(data.type==='target'){void showTarget(data);return}
 if(data.type==='read-context'){
   currentSelection().then(context=>bridge.port1.postMessage({type:'selection',id:data.id,context}),()=>bridge.port1.postMessage({type:'selection',id:data.id,error:'Selection unavailable; reopen the workspace.'}));
   return;
 }
 const finish=waiting.get(data.id);if(finish){waiting.delete(data.id);finish(data)}
}
if(window.parent!==window)window.parent.postMessage({type:'pipeline-ready'},'*',[bridge.port2])


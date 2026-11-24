window.pipelineHost=true
window.pipelineChatGPT=true

const appOrigin='https://pipeline.trialagents.com'
const header=el('pipeline-header').shadowRoot
const actions=header.querySelector('.assistant-actions')
actions.setAttribute('aria-label','Open Pipeline')
const openApp=document.createElement('button')
openApp.type='button'
openApp.className='assistant-link'
openApp.textContent='Open TrialAgents app ↗'
actions.replaceChildren(openApp)

const rail=el('rail')
const toggle=document.createElement('button')
toggle.type='button'
toggle.className='sidebar-toggle'
toggle.setAttribute('aria-controls','rail')
toggle.innerHTML='<svg aria-hidden="true" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M9 4v16"/></svg>'
const style=document.createElement('style')
style.textContent='.sidebar-toggle{display:inline-grid;place-items:center;flex:none;width:32px;height:32px;padding:0;border:0;border-radius:6px;color:inherit;background:transparent;cursor:pointer}.sidebar-toggle:hover{background:#ffffff18}.sidebar-toggle:focus-visible,.assistant-link:focus-visible{outline:2px solid #b1e3c4;outline-offset:2px}'
header.append(style)
header.querySelector('.pipeline-mark').after(toggle)
function setRail(open){
 rail.hidden=!open
 const label=open?'Hide sidebar':'Show sidebar'
 toggle.setAttribute('aria-expanded',String(open))
 toggle.setAttribute('aria-label',label)
 toggle.title=label
}
setRail(!matchMedia('(max-width:800px)').matches)
toggle.onclick=()=>setRail(rail.hidden)
window.pipelineLink=async raw=>{
 const url=new URL(raw)
 if(url.origin!==appOrigin)throw Error('Invalid workspace link')
 await hostRequest('open-link',{url:url.href})
}
openApp.onclick=()=>window.pipelineLink(window.pipelineLocation?.()||appOrigin+'/').catch(e=>notify(e.message))

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
window.pipelineTransport=async request=>{
 const send=async secret=>fetch('/api/pipeline/frame',{method:'POST',credentials:'omit',cache:'no-store',headers:{'Content-Type':'application/json','X-Pipeline-Surface':'workspace','Authorization':'Pipeline-Frame '+secret},body:JSON.stringify(request)})
 const current=grant(request.workspace)
 let res=await send(await current)
 if(res.status===401){
   if(grants.get(request.workspace)===current)grants.delete(request.workspace)
   res=await send(await grant(request.workspace))
 }
 const result=await res.json()
 if(!res.ok)throw Error(result.error||'Pipeline request failed')
 return result
}
let generation=0
async function showTarget({workspace,url}){
 const seq=++generation
 try{
   const target=new URL(url)
   if(target.origin!==appOrigin||target.searchParams.get('workspace')!==workspace)throw Error('Invalid workspace link')
   const snapshot=await window.pipelineTransport({op:'bootstrap',workspace})
   if(seq===generation)await window.pipelineMount(snapshot,target.searchParams)
 }catch(e){
   if(seq!==generation)return
   const msg=document.createElement('p'),retry=document.createElement('button')
   msg.textContent=e.message;retry.textContent='Retry workspace';retry.onclick=()=>showTarget({workspace,url})
   el('app').replaceChildren(msg,retry)
 }
}
bridge.port1.onmessage=({data})=>{
 if(data.type==='target'){void showTarget(data);return}
 const finish=waiting.get(data.id);if(finish){waiting.delete(data.id);finish(data)}
}
if(window.parent!==window)window.parent.postMessage({type:'pipeline-ready'},'*',[bridge.port2])

window.pipelineAccountSurface=()=>({
 profile:state?.user,
 openPersonal:()=>window.pipelineLink('https://pipeline.trialagents.com/?'+new URLSearchParams({workspace:state.workspace,section:'Personal'})),
 openPolicy:path=>window.pipelineLink(new URL(path,appOrigin).href)
})

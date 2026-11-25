// Workspace panel shared by the assistant hosts. The host script defines
// hostRequest(type,body), waitForSelection(workspace,instance,signal) and
// window.pipelineTransport, then calls showTarget and currentSelection.
const appOrigin='https://pipeline.trialagents.com'
const header=el('pipeline-header').shadowRoot
const actions=header.querySelector('.assistant-actions')
actions.setAttribute('aria-label','Open Pipeline')
const openApp=document.createElement('button')
openApp.type='button'
openApp.className='assistant-link'
openApp.textContent='Open TrialAgents app ↗'
actions.replaceChildren(openApp)

window.pipelineLink=async raw=>{
 const url=new URL(raw)
 if(url.origin!==appOrigin)throw Error('Invalid workspace link')
 await hostRequest('open-link',{url:url.href})
}
openApp.onclick=()=>window.pipelineLink(window.pipelineLocation?.()||appOrigin+'/').catch(e=>notify(e.message))

// A host request or an explicit click can read this frame's saved selection.
async function currentSelection(){
 if(!state||mounting)throw Error('The workspace is still opening.');
 const workspace=state.workspace,url=window.pipelineLocation(),params=new URL(url).searchParams;
 const currentTab=tab,view=params.get('view'),record=params.get('record');
 const context={workspace,tab:names[tab]||tab};
 const activeFilters=Object.fromEntries(Object.entries(filters).filter(([k,v])=>k!=='search'&&v));
 if(tab==='Custom views'&&viewProgram)activeFilters.program=viewProgram;
 if(Object.keys(activeFilters).length)context.filters=activeFilters;
 if(tab==='Settings')context.section=settingTab;
 if(lastConfirmed)context.lastAction=lastConfirmed;
 const access=await rpc('view.list',{knownRevision:view?-1:state.revision});
 if(view){
   const v=access.views?.find(v=>v.id===view);
   context.view=v?{id:v.id,title:v.title}:'Selection unavailable';
 }
 if(record){
   const table=params.get('table')||get(record)?.type;
   const detail=table?await rpc('assistant.read',{table,id:record,fields:['name']}):null;
   const r=detail?.records?.[0];context.record=r?{id:r.id,table,name:r.values?.name}:'Selection unavailable';
 }
 if(state.workspace!==workspace||mounting||tab!==currentTab||window.pipelineLocation()!==url)throw Error('The selection changed. Ask again.');
 return context;
}
let sending=false,mounting=false;
document.addEventListener('click',async e=>{
 const button=e.target.closest('[data-ask-view]');if(!button||sending||state.role==='reader')return;
 sending=true;button.disabled=true;
 let prompt='';
 try{
   const context=await currentSelection();
   prompt='Please create and save a new custom view in this Pipeline workspace. Ask me what it should show if needed. Workspace context: '+JSON.stringify(context);
   await hostRequest('send-message',{prompt});
 }catch(error){
   if(prompt){
     present('<h2>Copy message to ChatGPT</h2><p>The message could not be sent from this workspace.</p><textarea readonly aria-label="Message to copy">'+E(prompt)+'</textarea><button data-close>Close</button>');
     el('drawer').querySelector('textarea').select();
   }else notify(error.message);
 }finally{sending=false;button.disabled=false}
});
let generation=0
// Keep the current selection inside the frame until a matching assistant request arrives.
let panelWait
async function serveSelection(workspace,instance,signal){
 while(!signal.aborted){
   if(document.hidden){
     await new Promise(resolve=>{
       const wake=()=>{document.removeEventListener('visibilitychange',wake);signal.removeEventListener('abort',wake);resolve()}
       document.addEventListener('visibilitychange',wake);signal.addEventListener('abort',wake)
     })
     continue
   }
   try{
     const waited=await waitForSelection(workspace,instance,signal)
     if(!waited)continue
     const {id}=waited
     if(!id||signal.aborted)continue
     const context=document.hidden?null:await currentSelection().catch(()=>null)
     if(!signal.aborted)await window.pipelineTransport({op:'selection.answer',workspace,input:{instance,id,context}})
   }catch{
     if(!signal.aborted)await new Promise(resolve=>setTimeout(resolve,2000))
   }
 }
}
window.addEventListener('pagehide',()=>panelWait?.abort())
async function showTarget({workspace,url,instance}){
 panelWait?.abort()
 const seq=++generation;mounting=true
 try{
   const target=new URL(url)
   if(target.origin!==appOrigin||target.searchParams.get('workspace')!==workspace)throw Error('Invalid workspace link')
   const snapshot=await window.pipelineTransport({op:'bootstrap',workspace})
   if(seq===generation){
     await window.pipelineMount(snapshot,target.searchParams)
     if(seq===generation&&instance){
       panelWait=new AbortController()
       void serveSelection(workspace,instance,panelWait.signal)
     }
   }
 }catch(e){
   if(seq!==generation)return
   const msg=document.createElement('p'),retry=document.createElement('button')
   msg.textContent=e.message;retry.textContent='Retry workspace';retry.onclick=()=>showTarget({workspace,url})
   el('app').replaceChildren(msg,retry);state=null
 }finally{if(seq===generation)mounting=false}
}
window.pipelineAccountSurface=()=>({
 profile:state?.user,
 openPersonal:()=>window.pipelineLink('https://pipeline.trialagents.com/?'+new URLSearchParams({workspace:state.workspace,section:'Personal'})),
 openPolicy:path=>window.pipelineLink(new URL(path,appOrigin).href)
})

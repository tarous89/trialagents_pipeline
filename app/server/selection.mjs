import {createHash,randomUUID} from 'node:crypto'

// PostgreSQL NOTIFY crosses web-service instances without storing browsing history.
// postgres.js multiplexes listeners on a dedicated connection.
export function selectionRelay({listen,publish}){
 const channel=(scope,suffix)=>'pipeline_ctx_'+createHash('sha256').update(JSON.stringify([...scope,suffix])).digest('hex').slice(0,40)
 async function receive(topic,timeout,signal,ready){
   let finish
   const result=new Promise(resolve=>{finish=resolve})
   const stop=()=>finish(null)
   const subscription=await listen(topic,message=>{
     try{finish(JSON.parse(message))}catch{/* Ignore malformed notifications. */}
   })
   const timer=setTimeout(stop,timeout)
   signal?.addEventListener('abort',stop,{once:true})
   try{
     if(signal?.aborted)return null
     if(ready)await ready()
     return await result
   }finally{
     clearTimeout(timer);signal?.removeEventListener('abort',stop)
     await subscription.unlisten()
   }
 }
 return {
   wait:(scope,signal)=>receive(channel(scope,'ask'),25000,signal),
   answer:(scope,id,selection)=>publish(channel(scope,id),JSON.stringify({selection})),
   async ask(scope){
     const id=randomUUID(),ask=()=>publish(channel(scope,'ask'),JSON.stringify({id}))
     let repeat
     try{
       const response=await receive(channel(scope,id),5500,undefined,async()=>{
         await ask();repeat=setInterval(()=>void ask().catch(()=>{}),750)
       })
       if(!response?.selection)throw Object.assign(Error('The active Pipeline selection is unavailable. Ask which view or record the user means.'),{status:409})
       return response.selection
     }finally{clearInterval(repeat)}
   }
 }
}

// Validates a panel's selection wait or answer. Both the first-party frame and the
// bundled Claude view use it. userId and workspace come from the verified caller.
export const panelInstance=/^([a-f0-9-]{36})\.[A-Za-z0-9_-]{22}$/
export async function relayPanelSelection(selection,userId,workspace,req,signal){
 const {instance,id,context}=req.input??{}
 if(!selection||typeof instance!=='string'||!panelInstance.test(instance))throw Object.assign(Error('Invalid panel instance'),{status:400})
 const scope=[userId,workspace,instance]
 if(req.op==='selection.wait')return await selection.wait(scope,signal)??{}
 if(typeof id!=='string'||!/^[a-f0-9-]{36}$/.test(id)||context&&(
   context.workspace!==workspace||Buffer.byteLength(JSON.stringify(context))>6000||
   Object.keys(context).some(k=>!['workspace','tab','filters','view','record','section','lastAction'].includes(k))
 ))throw Object.assign(Error('Invalid selection response'),{status:400})
 await selection.answer(scope,id,context??null)
 return {}
}

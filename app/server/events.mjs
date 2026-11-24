// Only invalidation hints cross the stream. Each snapshot still requires membership.
export async function workspaceEvents(workspace,signal,listen,authorize){
 await authorize()
 const bytes=new TextEncoder()
 let controller,subscription,heartbeat,lifetime,closed=false
 function close(){
   if(closed)return
   closed=true
   clearInterval(heartbeat);clearTimeout(lifetime)
   signal.removeEventListener('abort',close)
   controller?.close()
   if(subscription)void subscription.unlisten().catch(()=>{})
 }
 function send(value){if(!closed)controller.enqueue(bytes.encode(value))}
 let checking=false,dirty=false
 async function changed(){
   dirty=true
   if(checking||closed)return
   checking=true
   try{
     while(dirty&&!closed){
       dirty=false;await authorize();send('data: changed\n\n')
     }
   }catch{close()}finally{checking=false}
 }
 const body=new ReadableStream({
   start(stream){controller=stream},
   cancel(){controller=undefined;close()}
 })
 signal.addEventListener('abort',close,{once:true})
 try{
   subscription=await listen('pipeline_change_'+workspace.toLowerCase().replaceAll('-',''),changed,()=>send('data: ready\n\n'))
   if(closed){await subscription.unlisten();return new Response(null,{status:204})}
   if(signal.aborted)close()
   else{
     send('data: ready\n\n')
     heartbeat=setInterval(()=>send(': heartbeat\n\n'),15000)
     lifetime=setTimeout(close,60000)
   }
   return new Response(body,{headers:{'Content-Type':'text/event-stream','Cache-Control':'private, no-store, no-transform','X-Accel-Buffering':'no'}})
 }catch(error){close();throw error}
}

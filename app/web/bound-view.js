import DOMPurify from 'dompurify'
const el=(type,text)=>{const node=document.createElement(type);if(text!=null)node.textContent=text;return node}
export const format=value=>value==null?'—':Array.isArray(value)?value.map(format).join(', ')||'Unassigned':typeof value==='object'?value.name??value.id??'—':String(value)
export function resultTable(data){
 const table=el('table'),head=el('thead'),body=el('tbody'),header=el('tr')
 const groups=!!data.groups
 const fields=groups?['label','count',...(data.groups.some(r=>r.sum!=null)?['sum']:[])]:data.fields
 const labels=new Map((data.columns||[]).map(c=>[c.id,c.label]))
 for(const f of fields)header.append(el('th',labels.get(f)??f))
 head.append(header);table.append(head,body)
 for(const r of data.records??data.groups??[]){
   const row=el('tr')
   for(const f of fields)row.append(el('td',format((r.values??r)[f])))
   body.append(row)
 }
 const wrap=el('div');wrap.className='bound-table';wrap.append(table)
 if(!body.children.length)wrap.append(el('p','No matching records.'))
 return wrap
}
export function showBound(container,view,{save,more}={}){
 container.replaceChildren()
 if(!view.available){container.append(el('p',view.message||'View unavailable.'));return}
 if(view.data){
   container.append(resultTable(view.data))
   if(view.data.next!=null&&more){const next=el('button','Next page');next.onclick=()=>more(view.data.next);container.append(next)}
   return
 }
 if(view.asOf)container.append(el('small','As of '+new Date(view.asOf).toLocaleString()))
 const interactive=view.renderer==='interactive',frame=el('iframe')
 frame.title=view.title;frame.style.cssText='width:100%;height:300px;border:0';frame.referrerPolicy='no-referrer'
 frame.setAttribute('sandbox','allow-scripts');frame.setAttribute('credentialless','')
 const channel=crypto.randomUUID()
 const fragment=DOMPurify.sanitize(view.presentation??'',{
   USE_PROFILES:{html:true,svg:true},RETURN_DOM_FRAGMENT:true,
   FORBID_TAGS:['a','script','base','link','meta','iframe','object','embed','image','img','video','audio','source','form','button','foreignObject','use','animate','set','animateTransform','animateMotion','feImage'],
   FORBID_ATTR:['href','xlink:href','src','srcset','srcdoc','action','formaction','target','autofocus','contenteditable','background','poster']
 })
 const safe=el('div');safe.append(fragment)
 for(const input of safe.querySelectorAll('input'))if(!['text','search','date','number','checkbox','range'].includes(input.type))input.type='text'
 frame.addEventListener('load',()=>frame.contentWindow.postMessage({channel,type:'mount',markup:safe.innerHTML,state:view.state??{},interactive},'*'),{once:true})
 // A bundled host supplies its own copy of the renderer page; the others load it from the app origin.
 frame.src=window.pipelineRendererSource?.()??'https://pipeline.trialagents.com/pipeline-renderer'
 let draft
 const button=el('button','Save control values')
 {
   const listener=event=>{
     if(!frame.isConnected){detach();return}
     if(event.source!==frame.contentWindow||event.data?.channel!==channel)return
     const {type,value}=event.data
     if(type==='height'&&Number.isFinite(value))frame.style.height=Math.max(160,Math.min(3000,value+16))+'px'
     if(interactive&&type==='draft'&&value&&typeof value==='object'){draft=value;button.disabled=false}
   }
   const observer=new MutationObserver(()=>{if(!frame.isConnected)detach()})
   function detach(){removeEventListener('message',listener);observer.disconnect()}
   addEventListener('message',listener);observer.observe(document.body,{subtree:true,childList:true})
 }
 container.append(frame)
 if(interactive&&save){button.disabled=true;button.onclick=async()=>{button.disabled=true;try{await save(draft)}catch(e){button.disabled=false;container.append(el('p',e.message))}};container.append(button)}
}

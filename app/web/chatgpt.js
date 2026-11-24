import {App} from '@modelcontextprotocol/ext-apps'
import {resultTable,showBound} from './bound-view.js'
const app=new App({name:'TrialAgents Pipeline',version:'0.2.0'},{availableDisplayModes:['inline','fullscreen']})
const get=s=>document.querySelector(s),make=(tag,text)=>{const n=document.createElement(tag);n.textContent=text||'';return n}
const tabs={'Overview':'Program','Milestones':'Milestone','Timeline':'Activity','Deliverables':'Deliverable','Risks':'Risk','Changes':'Change','Updates':'Decision','Custom views':null}
let state,seq=0,initialQuery
const status=t=>get('#status').textContent=t
async function call(name,args){
 const r=await app.callServerTool({name,arguments:args})
 if(r.isError)throw Error(r.content?.find(c=>c.type==='text')?.text||'Request failed')
 return r._meta?.pipeline??r.structuredContent?.result
}
const button=(title,action)=>{const b=make('button',title);b.onclick=async()=>{status('');b.disabled=true;try{await action()}catch(e){status(e.message)}finally{b.disabled=false}};return b}
function canonical(raw){
 const url=new URL(raw);if(url.origin!=='https://pipeline.trialagents.com'||url.pathname!=='/'||[...url.searchParams.keys()].some(k=>!['workspace','view','record','tab','table'].includes(k)))throw Error('Workspace link unavailable')
 return url.href
}
async function open(args={}){
 const pending=++seq
 const next=await call('open_pipeline',{workspace:state?.workspace,...args})
 if(seq===pending)paint(next,args.query)
}
function paint(next,query){
 state=next;initialQuery=query;status('')
 const main=get('main'),nav=get('nav'),ext=get('#external')
 main.replaceChildren();nav.replaceChildren();main.setAttribute('aria-busy','false')
 ext.hidden=!state.url;ext.onclick=()=>app.openLink({url:canonical(state.url)}).catch(e=>status(e.message))
 if(state.pending){main.append(make('p','The save could not be verified.'),button('Retry save',async()=>paint(await call('retry_pipeline_view',{workspace:state.workspace,request_id:state.request_id}))));return}
 if(state.reopen){main.append(make('p','Saved. The view could not be opened.'),button('Open saved view',()=>open({view:state.id})));return}
 if(/^#[0-9a-f]{6}$/i.test(state.accent))document.documentElement.style.setProperty('--accent',state.accent)
 for(const tab of Object.keys(tabs)){
   const b=button(state.tabs?.find(t=>t.builtin===tab)?.label??tab,()=>open({tab}));if(state.tab===tab)b.setAttribute('aria-current','page');nav.append(b)
 }
 for(const pin of state.tabs??[])if(pin.view)nav.append(button(pin.label,()=>open({view:pin.view,tab:'Custom views'})))
 const panel=make('section');main.append(panel);panel.append(make('h1',state.view?.title??(state.tab==='Overview'?state.title:state.tab)))
 if(state.view){
   const v=state.view
   async function page(offset){const r=await call('read_pipeline_view',{workspace:state.workspace,id:v.id,offset});paint({...state,view:r})}
   const holder=make('div');panel.append(holder)
   if(v.legacy&&!v.presentation&&!v.data){panel.append(make('p','Saved filter view'),button('Open view in TrialAgents',()=>app.openLink({url:canonical(v.url)})));return}
   showBound(holder,v,{more:page,save:state.role==='reader'?undefined:async draft=>{
     const r=await call('save_pipeline_controls',{workspace:state.workspace,revision:state.revision,request_id:crypto.randomUUID(),id:v.id,version:v.version,state:draft})
     v.version=r.version;v.state=draft;state.revision=r.revision;status('Control values saved.')
   }});return
 }
 if(state.views){
   if(state.next!=null)panel.append(button('Next page',async()=>{const r=await call('list_pipeline_views',{workspace:state.workspace,offset:state.next});paint({...state,...r})}))
   for(const v of state.views)panel.append(button(v.title,()=>open({tab:'Custom views',view:v.id})));if(!state.views.length)panel.append(make('p','No saved views yet.'));return}
 const current=state.data
 if(current){
   const table=resultTable(current);panel.append(table)
   if(state.role!=='reader'&&current.records){
     const modify=(row)=>{
       const box=make('form'),name=make('input'),label=make('label','Record name'),save=make('button','Save')
       name.required=true;name.maxLength=240;name.value=row?.values?.name??'';label.append(name);save.type='submit'
       box.append(label,save,button('Cancel',()=>box.remove()));box.lastChild.type='button';panel.querySelector('form')?.remove();panel.append(box);name.focus()
       const key=crypto.randomUUID()
       box.onsubmit=async e=>{e.preventDefault();save.disabled=true
         try{await call(row?'update_pipeline_record':'create_pipeline_record',{workspace:state.workspace,revision:state.revision,request_id:key,table:row?.table??current.table,...row&&{id:row.id},values:{name:name.value}});await open({tab:state.tab,query:initialQuery})}
         catch(err){status(err.message);save.disabled=false}}
     }
     if(current.fields.includes('name'))for(const [i,tr] of [...table.querySelectorAll('tbody tr')].entries()){
       const cell=tr.children[current.fields.indexOf('name')];cell.replaceChildren(button(current.records[i].values.name,()=>modify(current.records[i])))
     }
     if(!current.kinds)panel.append(button('Add record',()=>modify(null)))
   }
   const bar=make('div');bar.className='bar'
   if(current.next!=null)bar.append(button('Next page',()=>open({tab:state.tab,query:{...initialQuery,kinds:current.kinds,table:current.table,fields:current.fields,offset:current.next}})))
   if(initialQuery?.offset)bar.append(button('First page',()=>open({tab:state.tab,query:{...initialQuery,offset:0}})))
   const search=make('input');search.type='search';search.placeholder='Search this table';search.setAttribute('aria-label','Search this table');search.value=initialQuery?.search||''
   const find=()=>open({tab:state.tab,query:{...initialQuery,kinds:current.kinds,table:current.table,fields:current.fields,search:search.value,offset:0}})
   search.onkeydown=e=>{if(e.key==='Enter')find().catch(e=>status(e.message))}
   bar.append(search,button('Search',find));panel.append(bar)
 }
 const controls=make('div');controls.className='bar';main.append(controls)
 controls.append(button('Switch workspace',async()=>{const r=await call('read_pipeline',{selection:'workspaces',workspace:state.workspace});controls.replaceChildren(...r.workspaces.map(w=>button(w.title,()=>open({workspace:w.id}))))}))
 controls.append(button('Browse tables',async()=>{
   const schema=await call('get_pipeline_schema',{workspace:state.workspace})
   controls.replaceChildren(...schema.tables.map(t=>button(t.label,()=>open({tab:t.label,query:{table:t.id}}))))
 }))
 if(state.role==='owner')controls.append(button('Invite teammate',()=>{
   if(!state.canInvite){status('Invitations are unavailable in this workspace.');return}
   const f=make('form'),label=make('label','Email'),email=make('input'),rl=make('label','Role'),role=make('select')
   email.type='email';email.required=true;label.append(email)
   for(const value of ['reader','editor'])role.add(new Option(value,value))
   rl.append(role);const submit=make('button','Send invitation');submit.type='submit';f.append(label,rl,submit);controls.replaceChildren(f)
   const key=crypto.randomUUID();f.onsubmit=async e=>{e.preventDefault();submit.disabled=true
     try{await call('invite_pipeline_member',{workspace:state.workspace,revision:state.revision,request_id:key,email:email.value,role:role.value});f.remove();status('Invitation sent.')}
     catch(err){status(err.message);submit.disabled=false}}
 }))
}
let toolInput
app.ontoolinput=p=>{toolInput=p.arguments?.query}
app.ontoolresult=p=>{const data=p._meta?.pipeline;if(data){seq++;paint(data,toolInput)}}
app.onteardown=async()=>({})
app.connect().catch(e=>status(e.message))

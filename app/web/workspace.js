let state, busy=false, sectionData=null, selectedView='', viewSearch='', viewAuthor='', viewProgram='';
const originalNames={...names};
const model=()=>[...data,...orgDb.map(r=>({...r,type:'Organization'}))];
let baselineItems=new Map();
function notify(message){
  const n=el('notice');n.textContent=message;n.hidden=!message;
}
function hydrate(snapshot){
  state=snapshot;Object.assign(names,originalNames);
  for(const t of state.tabs)names[t.builtin||'custom-'+t.id]=t.label;
  data=structuredClone(state.items.filter(r=>r.type!=='Organization'));
  orgDb=structuredClone(state.items.filter(r=>r.type==='Organization'));
  settings={...state.settings,emails:state.preferences};
  directory.splice(0,directory.length,[state.user.name,'']);
  baselineItems=new Map(model().map(r=>[r.id,JSON.stringify(r)]));
  document.documentElement.style.setProperty('--pipeline-accent',state.accent);
  const header=el('pipeline-header')?.shadowRoot;
  if(header){header.querySelector('h1').textContent=state.title;header.querySelector('.combined-preview-label').textContent=state.role==='reader'?'Read only':state.user.name}
}
async function rpc(op,input={},extra={}){
  const req={op,input,workspace:state?.workspace,revision:state?.revision,requestId:crypto.randomUUID(),...extra};
  return window.pipelineTransport(req);
}
async function refreshState(){hydrate(await rpc('bootstrap'));render()}
async function change(op,input,after){
  if(busy)return;busy=true;document.querySelector('.layout').inert=true;
  try{
    const result=await rpc(op,input);
    await refreshState();
    if(after)await after(result);
    notify('Saved');
  }catch(error){
    notify(error.message);
    try{await refreshState()}catch{document.querySelector('#app').replaceChildren();el('rail').replaceChildren()}
  }finally{busy=false;document.querySelector('.layout').inert=false}
}
function persistPortfolio(){
  const list=model(),ids=new Set(list.map(r=>r.id));
  const upsert=list.filter(r=>baselineItems.get(r.id)!==JSON.stringify(r));
  const remove=[...baselineItems.keys()].filter(id=>!ids.has(id));
  if(upsert.length||remove.length)void change('items.save',{upsert,remove});
}
function decorateWorkspace(){
  if(!state)return;
  const holder=el('account-holder');
  if(holder){const frame=document.createElement('iframe');frame.className='account-frame';frame.title=settingTab;frame.src='/pipeline-account?tab='+(settingTab==='Support'?'support':'account');holder.append(frame)}
  if(state.role==='reader')el('app').querySelectorAll('[data-add],[data-edit],[data-approve]').forEach(b=>b.remove());
  const plot=el('view-plot');
  paintChart(plot,plot?state.views.find(v=>v.id===plot.dataset.viewId):null,viewRows);
  if(tab.startsWith('custom-'))el('app').querySelector('[data-add]')?.remove();
  if(state.workspaces.length>1){
    const select=document.createElement('select');select.setAttribute('aria-label','Switch workspace');
    for(const w of state.workspaces)select.add(new Option(w.title,w.id,false,w.id===state.workspace));
    select.onchange=()=>navigateWorkspace(select.value);el('rail').prepend(select);
  }
}
async function navigateWorkspace(id){
  try{const snap=await rpc('bootstrap',{}, {workspace:id});hydrate(snap);sectionData=null;selectedView='';filters={};go('Overview');
    if(!window.pipelineHost)history.replaceState(null,'','/?workspace='+encodeURIComponent(id));
  }catch(e){notify(e.message)}
}
function viewRows(f){
 const previous=filters;filters=f;
 try{return data.filter(match)}finally{filters=previous}
}
function showView(view){
 if(!view)return '<p class="pad">View unavailable.</p>';
 const rows=viewRows(view.filters);
 return panel(E(view.title),(view.chart?'<div id="view-plot" data-view-id="'+view.id+'"></div>':'')+table(['Item','Type','Owner','Status'],rows.map(r=>[link(r),E(r.type),E(r.owner),tag(r.status)])));
}
function customTab(){return showView(state.views.find(v=>v.id===state.tabs.find(t=>'custom-'+t.id===tab)?.view))}
function viewForm(){
 return '<form class="pad gearform" id="save-view">'+field('title','View name',inp('viewTitle','','text','required maxlength="240"'))+
 field('program','Program',sel('program',[['','All programs'],...data.filter(r=>r.type==='Program').map(r=>[r.id,r.name])],filters.program||''))+
 field('type','Record type',sel('type',[['','All types'],...pairs(allTypes)],filters.type||''))+
 field('status','Status',sel('status',[['','All statuses'],...pairs(statuses)],filters.status||''))+field('chart','Chart',sel('chart',[['','Table only'],['status','By status'],['type','By record type'],['owner','By owner']],''))+'<button class="primary">Save view</button></form>';
}
function viewsPage(){
 const list=state.views.filter(v=>v.title.toLowerCase().includes(viewSearch.toLowerCase())&&(!viewAuthor||v.author===viewAuthor)&&(!viewProgram||v.filters.program===viewProgram));
 return '<div class="filters"><label>Search views<input id="view-query" value="'+E(viewSearch)+'"></label><label>Creator<select id="view-author">'+opts([['','All creators'],...new Map(state.views.map(v=>[v.author,[v.author,v.author_name]])).values()],viewAuthor)+'</select></label><label>Program<select id="view-program">'+opts([['','All programs'],...data.filter(r=>r.type==='Program').map(r=>[r.id,r.name])],viewProgram)+'</select></label></div>'+
 (state.role!=='reader'?'<details class="panel"><summary class="pad">Add custom view</summary>'+viewForm()+'</details>':'')+
 panel('Saved views',list.length?table(['View','Creator',''],list.map(v=>['<button data-view="'+E(v.id)+'">'+E(v.title)+'</button>',E(v.author_name),(state.role==='owner'||state.user.id===v.author)?'<button data-delete-view="'+E(v.id)+'">Remove</button>':''])):'<p class="pad">No matching views.</p>')+
 (selectedView?showView(state.views.find(v=>v.id===selectedView)):'');
}
const settingButton=(text,action)=>'<button type="button" data-action="'+action+'">'+text+'</button>';
function settingsPage(){
 const owner=state.role==='owner';
 const sections=settingsSections.filter(n=>owner||!['Billing','Team'].includes(n));
 if(!sections.includes(settingTab))settingTab='Personal settings';
 const menu='<div class="pipeline-settings"><nav class="settings-tabs" aria-label="Settings sections">'+sections.map(n=>'<button type="button" data-settings-section="'+n+'" aria-pressed="'+(settingTab===n)+'" class="'+(settingTab===n?'active':'')+'">'+sectionIcons[n]+n+'</button>').join('')+'</nav></div>';
 let body='';
 if(settingTab==='App settings')body=owner?planningSettings()+designPanel():panel('Planning defaults',table(['Currency','Date format','Lookahead','Reminder'],[[E(settings.currency),E(settings.dateFormat),settings.window+' days',settings.days+' days']]));
 if(settingTab==='Personal settings'||settingTab==='Support'){
   const part=settingTab==='Support'?'support':'account';
   body=window.pipelineHost?panel(E(settingTab),'<button class="pad" data-external="/pipeline-account?tab='+part+'">Open '+E(settingTab)+'</button>'):'<div id="account-holder"></div>';
 }
 if(settingTab==='Billing')body=panel('Pipeline Team','<div class="pad"><h3>US$49 per month · Unlimited seats</h3><p>'+(state.team?'Team access is active.':'Individual access is free. Upgrade to invite your team.')+'</p>'+(!state.team?settingButton('Upgrade to Team','billing.checkout'):'')+settingButton('Manage billing','billing.portal')+'</div>');
 if(settingTab==='Team')body=teamPanel();
 if(settingTab==='Logs')body=panel('Audit history',sectionData?.entries?table(['Time','Member','Source','Action','Details'],sectionData.entries.map(e=>[E(new Date(e.happened_at).toLocaleString()),E(e.actor_name),E(e.source),E(e.action),'<details><summary>'+E(e.target||'Details')+'</summary><pre>'+E(JSON.stringify(e.details,null,2))+'</pre></details>']))+(sectionData.more?settingButton('Load more','more-logs'):''):'<p class="pad">Loading activity…</p>');
 if(settingTab==='Notifications')body=panel('Email notifications','<form class="pad gearform" id="save-notices">'+mailTypes.map(([k,n,d])=>'<label class="mail-pref"><span><strong>'+n+'</strong><small>'+d+'</small></span><input name="'+k+'" type="checkbox" '+(state.preferences[k]!==false?'checked':'')+'></label>').join('')+'<button class="primary">Save preferences</button></form>');
 return menu+body;
}
function teamPanel(){
 const roster=sectionData?.members||[], invites=sectionData?.invitations||[];
 return panel('Invite team members','<form class="pad gearform" id="invite">'+field('email','Email',inp('email','','email','required'))+field('role','Access',sel('role',[['editor','Editor'],['reader','Read only']],'editor'))+'<button class="primary">'+(state.team?'Send invitation':'Upgrade · $49 / month')+'</button></form>')+
 panel('Members',table(['Member','Access'],roster.map(m=>[E(m.email),m.role==='owner'?'Owner':'<select data-member-role="'+E(m.user_id)+'">'+opts([['editor','Editor'],['reader','Read only'],['remove','Remove member']],m.role)+'</select>'])))+
 panel('Pending invitations',invites.length?table(['Recipient','Role',''],invites.map(i=>[E(i.email),E(i.role),'<button data-revoke="'+i.id+'">Revoke</button>'])):'<p class="pad">No pending invitations.</p>');
}
function designPanel(){
 return panel('App appearance','<form id="design" class="pad gearform">'+field('title','Workspace name',inp('viewTitle',state.title,'text','required maxlength="240"'))+field('accent','Accent color',inp('accent',state.accent,'color'))+
 tabs.filter(t=>t!=='Settings').map(k=>field(k,'Tab label · '+(originalNames[k]||k),inp('label-'+k,names[k]||k,'text','required maxlength="80"'))).join('')+
 state.views.map(v=>'<label><input type="checkbox" name="pin" value="'+v.id+'" '+(state.tabs.some(t=>t.view===v.id)?'checked':'')+'> Show '+E(v.title)+' in navigation</label>').join('')+'<button class="primary">Save appearance</button></form>');
}
let sectionLoad=0;
async function loadSection(more=false){
 const generation=++sectionLoad;
 const op=settingTab==='Logs'?'logs':settingTab==='Team'?'team.list':null;if(!op)return;
 try{const result=await rpc(op,more?{before:sectionData.entries.at(-1).id}:{});
 if(generation!==sectionLoad||tab!=='Settings')return;
 if(op==='logs'){result.more=result.entries.length===50;if(more)result.entries=[...sectionData.entries,...result.entries]}
 sectionData=result;render();
 }catch(e){notify(e.message)}
}
async function openBilling(op){
 try{const result=await rpc(op);await window.pipelineLink(result.url)}catch(e){notify(e.message)}
}
document.addEventListener('click',e=>{
 const b=e.target.closest('button');if(!b)return;
 if(b.hasAttribute('data-file-id'))void (async()=>{
  try{const file=draft?.files?.[+b.dataset.fileIndex]??get(b.dataset.fileItem)?.files?.[+b.dataset.fileIndex];
    const url=file.url||(await rpc('attachment.get',{item:b.dataset.fileItem,id:file.id})).content;
    const a=document.createElement('a');a.href=url;a.download=file.name;a.click()
  }catch(e){notify(e.message)}
 })();
 if(b.dataset.settingsSection){settingTab=b.dataset.settingsSection;sectionData=null;render();void loadSection()}
 if(b.dataset.tab==='Settings')void loadSection();
 if(b.dataset.view){selectedView=b.dataset.view;render()}
 if(b.dataset.deleteView && confirm('Remove this shared view?'))void change('view.remove',{id:b.dataset.deleteView},()=>{selectedView='';render()});
 if(b.dataset.revoke)void change('team.revoke',{id:b.dataset.revoke},loadSection);
 if(b.dataset.external)void window.pipelineLink('https://pipeline.trialagents.com'+b.dataset.external);
 if(b.dataset.action?.startsWith('billing.'))void openBilling(b.dataset.action);
 if(b.dataset.action==='more-logs')void loadSection(true);
});
document.addEventListener('input',e=>{if(e.target.id==='view-query'){viewSearch=e.target.value;const pos=e.target.selectionStart;render();el('view-query').focus();el('view-query').setSelectionRange(pos,pos)}});
document.addEventListener('change',e=>{
 if(e.target.id==='view-author'){viewAuthor=e.target.value;render()}
 if(e.target.id==='view-program'){viewProgram=e.target.value;render()}
 if(e.target.dataset.memberRole){
   if(e.target.value==='remove'&&!confirm('Remove this member from the workspace?')){render();return}
   void change('team.member',{user:e.target.dataset.memberRole,role:e.target.value},loadSection)
 }
});
document.addEventListener('submit',e=>{
 const f=new FormData(e.target),get=k=>String(f.get(k)||'');e.preventDefault();
 switch(e.target.id){
 case 'settingsform':void change('settings.save',{currency:get('currency'),dateFormat:get('dateFormat'),days:+get('days'),window:+get('window')});break;
 case 'save-notices':void change('preferences.save',Object.fromEntries(mailTypes.map(([k])=>[k,f.has(k)])));break;
 case 'save-view':void change('view.save',{title:get('viewTitle'),chart:get('chart'),filters:Object.fromEntries(['program','type','status'].map(k=>[k,get(k)]).filter(x=>x[1]))});break;
 case 'invite':if(state.team)void change('team.invite',{email:get('email'),role:get('role')},loadSection);else {if(!window.pipelineHost)sessionStorage.setItem('pipeline-draft-invite',JSON.stringify({workspace:state.workspace,email:get('email'),role:get('role')}));void openBilling('billing.checkout')}break;
 case 'design':{
   const overrides=tabs.filter(t=>t!=='Settings'&&get('label-'+t)!==(originalNames[t]||t)).map(k=>({builtin:k,label:get('label-'+k)}));
   const pinned=f.getAll('pin').map(id=>({view:id,id:state.tabs.find(t=>t.view===id)?.id||crypto.randomUUID(),label:state.views.find(v=>v.id===id).title}));
   void change('design.save',{title:get('viewTitle'),accent:get('accent'),tabs:[...overrides,...pinned]});break;
 }
 }
});
window.pipelineMount=async snapshot=>{
 hydrate(snapshot);mountPlan();const search=new URLSearchParams(location.search);
 if(settingsSections.includes(search.get('section'))){settingTab=search.get('section');go('Settings');await loadSection()}
 if(settingTab==='Team'&&!window.pipelineHost){
  try{const pending=JSON.parse(sessionStorage.getItem('pipeline-draft-invite'));if(pending?.workspace===state.workspace&&el('invite')){el('invite').elements.email.value=pending.email;el('invite').elements.role.value=pending.role;sessionStorage.removeItem('pipeline-draft-invite')}}catch{}
 }
};

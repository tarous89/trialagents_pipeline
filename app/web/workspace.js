let state, busy=false, sectionData=null, selectedView='', viewSearch='', viewAuthor='', viewProgram='';
const originalNames={...names};
const model=()=>[...data,...orgDb.map(r=>({...r,type:'Organization'}))];
let baselineItems=new Map();
function notify(message){
  const n=el('notice');n.textContent=message;n.hidden=!message;
}
function hydrate(snapshot){
  state=snapshot;for(const id of Object.keys(names))delete names[id];Object.assign(names,originalNames);
  for(const t of state.tabs)names[t.builtin||'custom-'+t.id]=t.label;
  data=structuredClone(state.items.filter(r=>r.type!=='Organization'));
  orgDb=structuredClone(state.items.filter(r=>r.type==='Organization'));
  settings={...state.settings,emails:state.preferences};
  directory.splice(0,directory.length,[state.user.name,'']);
  baselineItems=new Map(model().map(r=>[r.id,JSON.stringify(r)]));
  document.documentElement.style.setProperty('--pipeline-accent',state.accent);
  const header=el('pipeline-header')?.shadowRoot;
  if(header)header.querySelector('.combined-preview-label').hidden=state.role!=='reader';
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
    notify(op==='examples.remove'?(result.kept?'Examples cleared. Records linked to your work were kept.':'Examples removed.'):'Saved');
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
// Set each production plugin URL when that assistant is available.
const assistantUrls = {ChatGPT: '', Claude: ''};
function assistantAction(name,verb) {
  const url=assistantUrls[name], content=assistantMark(name)+'<span>'+verb+' '+name+'</span>';
  return url?'<a class="assistant-link" href="'+E(url)+'">'+content+'</a>':
    '<button type="button" class="assistant-link" disabled title="Coming soon">'+content+'</button>';
}
function assistantActions(verb) {
  return Object.keys(assistantUrls).map(name=>assistantAction(name,verb)).join('');
}
function assistantSettings() {
  return '<div class="assistant-settings-cards">'+Object.keys(assistantUrls).map(name=>panel(name,
    '<div class="pad"><p>Connect to use Pipeline inside '+name+'. With your permission, '+name+' can analyze workspace data and add or edit records within your access level.</p>'+assistantAction(name,'Connect to')+'</div>')).join('')+'</div>';
}
const exampleTabs={
 Overview:['Program','program','Program'],Milestones:['Plan','plan','Program'],Timeline:['Plan','plan','Program'],
 Deliverables:['Deliverable','deliverable','Deliverable'],Risks:['Risk','risk','Risk'],Changes:['Change','change','Change'],Updates:['Digest','updates','Change']
};
function visibleExample(){
 const selection=exampleTabs[tab];
 if(!selection)return null;
 const [scope]=selection;
 const matches=r=>scope==='Program'||scope==='Plan'||(scope==='Digest'?aux(r):r.type===scope);
 return state.items.some(r=>r.example&&matches(r))?selection:null;
}
function exampleCard([scope,label,addType]){
 const whole=scope==='Program'||scope==='Plan';
 const copy=whole?'Remove the fictional EX-101 program and its remaining examples, then add your own program.':
   scope==='Digest'?'Remove the example deliverable, risk, and change, then add your own updates.':
   'Delete the example '+label+' when you’re ready to add your own.';
 const controls=state.role==='reader'?'':'<div class="example-actions"><button class="primary" data-remove-examples="'+scope+'">Delete example '+label+'</button><button data-first-type="'+addType+'">Add my '+addType.toLowerCase()+'</button></div>';
 return '<section class="panel empty-panel"><div><h2>Explore the EX-101 example</h2><p>'+copy+'</p></div>'+controls+'</section>';
}
function firstItemCard(type, title) {
  const action = state.role === 'reader' ? '<p>An editor can add the first item.</p>' :
    '<button type="button" class="primary" data-first-type="' + type + '">Add first ' + type.toLowerCase() + '</button>';
  return '<section class="panel empty-panel"><h2>' + title + '</h2>' + action + '</section>';
}
function decorateWorkspace(){
  if(!state)return;
  const actions=el('pipeline-header')?.shadowRoot?.querySelector('.assistant-actions');
  if(actions)into(actions).html=assistantActions('Open in');
  const holder=el('account-holder');
  if(holder){
    const frame=document.createElement('iframe');
    frame.className='account-frame';frame.title=settingTab;
    frame.src='/pipeline-account?tab='+(settingTab==='Support'?'support':'account');
    frame.addEventListener('load',()=>fitFrame(frame,'.pipeline-account'));
    holder.append(frame);
  }
  if(state.role==='reader')el('app').querySelectorAll('[data-add],[data-edit],[data-approve]').forEach(b=>b.remove());
  const plot=el('view-plot');
  const view=plot?state.views.find(v=>v.id===plot.dataset.viewId):null;
  paintChart(plot,view,viewRows);
  if(view?.bound){
    const load=async offset=>{
      const detail=await rpc('assistant.view',{id:view.id,content:true,offset})
      if(plot.isConnected)showBound(plot,detail,{more:load,save:state.role==='reader'?undefined:async draft=>{
        const receipt=await rpc('assistant.state',{id:view.id,version:detail.version,state:draft});state.revision=receipt.revision;detail.version=receipt.version;notify('Control values saved.')
      }})
    }
    void load(0).catch(e=>{if(plot.isConnected)plot.textContent=e.message})
  }else if(view?.rich)void rpc('view.read',{id:view.id}).then(detail=>{
    if(plot.isConnected)paintChart(plot,detail,viewRows)
  }).catch(e=>{if(plot.isConnected)plot.textContent=e.message});
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
 if(view.bound)return panel(E(view.title),'<div id="view-plot" data-view-id="'+E(view.id)+'"></div>');
 const rows=viewRows(view.filters);
 return panel(E(view.title),((view.chart||view.rich)?'<div id="view-plot" data-view-id="'+view.id+'"></div>':'')+table(['Item','Type','Owner','Status'],rows.map(r=>[link(r),E(r.type),E(r.owner),tag(r.status)]))+(rows.length?'':'<p class="pad">No items match this view.</p>'));
}
function customTab(){return showView(state.views.find(v=>v.id===state.tabs.find(t=>'custom-'+t.id===tab)?.view))}
function viewsPage(){
 const list=state.views.filter(v=>v.title.toLowerCase().includes(viewSearch.toLowerCase())&&(!viewAuthor||v.author===viewAuthor)&&(!viewProgram||v.filters.program===viewProgram));
 return '<div class="filters"><label>Search views<input id="view-query" value="'+E(viewSearch)+'"></label><label>Creator<select id="view-author">'+opts([['','All creators'],...new Map(state.views.map(v=>[v.author,[v.author,v.author_name]])).values()],viewAuthor)+'</select></label><label>Program<select id="view-program">'+opts([['','All programs'],...data.filter(r=>r.type==='Program').map(r=>[r.id,r.name])],viewProgram)+'</select></label></div>'+
 panel('Saved views',table(['View','Creator',''],list.map(v=>['<button data-view="'+E(v.id)+'">'+E(v.title)+'</button>',E(v.author_name),(state.role==='owner'||(state.role==='editor'&&state.user.id===v.author))?'<button data-delete-view="'+E(v.id)+'">Remove</button>':'']))+
   (list.length?'':'<p class="pad">'+(state.views.length?'No views match these filters.':'No saved views yet.')+'</p>'))+
 (state.role==='reader'?'':panel('Create with an assistant','<div class="pad assistant-actions">'+assistantActions('Create with')+'</div>'))+
 (selectedView?showView(state.views.find(v=>v.id===selectedView)):'');
}
const settingButton=(text,action)=>'<button type="button" data-action="'+action+'">'+text+'</button>';
function settingsPage(){
 const owner=state.role==='owner';
 const sections=settingsSections.filter(n=>owner||!['Billing','Team'].includes(n));
 if(!sections.includes(settingTab))settingTab=sections[0];
 const menu='<div class="pipeline-settings"><nav class="settings-tabs" aria-label="Settings sections">'+sections.map(n=>'<button type="button" data-settings-section="'+n+'" aria-pressed="'+(settingTab===n)+'" class="'+(settingTab===n?'active':'')+'">'+sectionIcons[n]+n+'</button>').join('')+'</nav></div>';
 let body='';
 if(settingTab==='App')body=owner?planningSettings():panel('Planning defaults',table(['Currency','Date format','Lookahead','Reminder'],[[E(settings.currency),E(settings.dateFormat),settings.window+' days',settings.days+' days']]));
 if(settingTab==='App')body+=assistantSettings();
 if(settingTab==='Personal'||settingTab==='Support'){
   const part=settingTab==='Support'?'support':'account';
   body=window.pipelineHost?panel(E(settingTab),'<button class="pad" data-external="/pipeline-account?tab='+part+'">Open '+E(settingTab)+'</button>'):'<div id="account-holder"></div>';
 }
 if(settingTab==='Billing'){
  body=state.team?'<section class="combined-billing-card"><div><strong>Pipeline Team · Monthly subscription</strong><p>US$49 per workspace per month · Unlimited seats</p>'+(state.billing?.paidThrough?'<p>Paid through '+E(new Date(state.billing.paidThrough).toLocaleDateString())+'</p>':'')+'</div>'+settingButton('Manage billing','billing.portal')+'</section>':
   '<section class="combined-premium-banner pipeline-team-offer" aria-label="Pipeline Team"><div class="combined-premium-pitch"><span class="combined-premium-eyebrow">Pipeline Team</span><h2>Invite your team.</h2><p>Work together in one shared pipeline.</p><ul><li>Unlimited editors and read-only members</li><li>Shared custom views</li><li>Team activity history</li></ul></div><div class="combined-premium-offers"><p class="combined-offers-heading">Team subscription</p><button type="button" data-action="billing.checkout"><span>Monthly</span><strong>US$49 <small>/ month</small></strong><span class="combined-offer-action">Upgrade to Teams</span></button><p>Individual access is free. The team subscription renews monthly and can be canceled in Billing.</p></div></section>'+(state.billing?.customer?settingButton('Manage billing','billing.portal'):'');
 }
 if(settingTab==='Team')body=teamPanel();
 if(settingTab==='Logs')body='<form class="filters" id="filter-logs"><label>Search activity<input name="query" value="'+E(logQuery)+'" placeholder="Member, action or record"></label><button>Search</button></form>'+panel('Audit history',sectionData?.entries?table(['Time','Member','Source','Action','Details'],sectionData.entries.map(e=>[E(new Date(e.happened_at).toLocaleString()),E(e.actor_name),E(e.source),E(e.action),'<details><summary>'+E(e.target||'Details')+'</summary><pre>'+E(JSON.stringify(e.details,null,2))+'</pre></details>']))+(sectionData.more?settingButton('Load more','more-logs'):''):'<p class="pad">Loading activity…</p>');
 if(settingTab==='Notifications')body=panel('Email notifications','<form class="pad gearform" id="save-notices">'+mailTypes.map(([k,n,d])=>'<label class="mail-pref"><span><strong>'+n+'</strong><small>'+d+'</small></span><input name="'+k+'" type="checkbox" role="switch" '+(state.preferences[k]!==false?'checked':'')+'></label>').join('')+'<button type="submit" class="primary">Save preferences</button></form>');
 return '<div class="settings-page">'+menu+'<div class="settings-sections">'+body+'</div></div>';
}
function teamPanel(){
 const roster=sectionData?.members||[], invites=sectionData?.invitations||[];
 const ordered=[...roster.filter(m=>m.role==='owner'),...roster.filter(m=>m.role!=='owner')];
 const invite=state.team?'<form class="pad gearform" id="invite">'+field('email','Email',inp('email','','email','required'))+field('role','Access',sel('role',[['editor','Editor'],['reader','Read only']],'editor'))+'<button class="primary">Send invitation</button></form>':'<div class="pad"><p>Invite unlimited team members for US$49 per workspace per month.</p><button class="primary team-upgrade" data-action="billing.checkout">Upgrade · $49 / month</button></div>';
 return panel('Members',sectionData?.members?table(['Member','Access'],ordered.map(m=>[E(m.email),m.role==='owner'?'Owner':'<select data-member-role="'+E(m.user_id)+'">'+opts([['editor','Editor'],['reader','Read only'],['remove','Remove member']],m.role)+'</select>'])):'<p class="pad">Loading members…</p>')+
 panel('Invite team members',invite)+
 panel('Pending invitations',invites.length?table(['Recipient','Role',''],invites.map(i=>[E(i.email),E(i.role),'<button data-revoke="'+i.id+'">Revoke</button>'])):'<p class="pad">No pending invitations.</p>');
}
let logQuery='',sectionLoad=0;
async function loadSection(more=false){
 const generation=++sectionLoad;
 const op=settingTab==='Logs'?'logs':settingTab==='Team'?'team.list':null;if(!op)return;
 try{const result=await rpc(op,{search:logQuery,...(more?{before:sectionData.entries.at(-1).id}:{})});
 if(generation!==sectionLoad||tab!=='Settings')return;
 if(op==='logs'){result.more=result.entries.length===50;if(more)result.entries=[...sectionData.entries,...result.entries]}
 sectionData=result;render();
 }catch(e){notify(e.message)}
}
async function openBilling(op){
 try{
 if(window.pipelineHost){await window.pipelineLink('https://pipeline.trialagents.com/?section=Billing&workspace='+encodeURIComponent(state.workspace));return}
 const result=await rpc(op);await window.pipelineLink(result.url)
 }catch(e){notify(e.message)}
}
document.addEventListener('click',e=>{
 const b=e.target.closest('button');if(!b)return;
 if(b.dataset.removeExamples&&state.role!=='reader'){
   const example=visibleExample();
   if(example&&b.dataset.removeExamples===example[0]){
     const entire=['Program','Plan'].includes(example[0]);
     const choice=entire?'Delete the remaining EX-101 example records?':'Delete example '+example[1]+'?';
     if(confirm(choice+' Your own records and examples they depend on will be kept.'))void change('examples.remove',{scope:example[0]},()=>{
       if(filters.program&&!get(filters.program))delete filters.program;
       if(digestProgram&&!get(digestProgram))digestProgram='';
       render();
     });
   }
 }
 if(b.dataset.firstType&&state.role!=='reader')editor('','',b.dataset.firstType);
 if(b.hasAttribute('data-file-id'))void (async()=>{
  try{const file=draft?.files?.[+b.dataset.fileIndex]??get(b.dataset.fileItem)?.files?.[+b.dataset.fileIndex];
    const url=file.url||(await rpc('attachment.get',{item:b.dataset.fileItem,id:file.id})).content;
    const a=document.createElement('a');a.href=url;a.download=file.name;a.click()
  }catch(e){notify(e.message)}
 })();
 if(b.dataset.settingsSection){settingTab=b.dataset.settingsSection;sectionData=null;render();el('app').scrollTop=0;void loadSection()}
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
 case 'filter-logs':logQuery=get('query');void loadSection();break;
 case 'settingsform':void change('settings.save',{currency:get('currency'),dateFormat:get('dateFormat'),days:+get('days'),window:+get('window')});break;
 case 'save-notices':void change('preferences.save',Object.fromEntries(mailTypes.map(([k])=>[k,f.has(k)])));break;
 case 'invite':if(state.team)void change('team.invite',{email:get('email'),role:get('role')},loadSection);else {if(!window.pipelineHost)sessionStorage.setItem('pipeline-draft-invite',JSON.stringify({workspace:state.workspace,email:get('email'),role:get('role')}));void openBilling('billing.checkout')}break;
 }
});
window.pipelineMount=async snapshot=>{
 hydrate(snapshot);mountPlan();const search=new URLSearchParams(location.search);
 const selected=search.get('tab'),record=search.get('record'),view=search.get('view');
 if(selected&&Object.hasOwn(names,selected)&&selected!=='Settings')go(selected);
 if(record&&get(record))openItem(record);
 else if(search.get('table')&&(record||!Object.hasOwn(names,selected))){
   const tableId=search.get('table');
   const showPage=async(offset=0)=>{
     const page=await rpc('assistant.read',{table:tableId,id:record,offset});
     present('<h2>'+E(selected||page.table)+'</h2><div id="linked-table"></div><button data-close>Close</button>');
     const holder=el('linked-table');holder.append(resultTable(page));
     if(record&&!page.records.length)notify('This record is unavailable.');
     if(page.next!=null){const next=document.createElement('button');next.textContent='Next page';next.onclick=()=>showPage(page.next).catch(e=>notify(e.message));holder.append(next)}
   };
   await showPage();
 }else if(record)notify('This record is unavailable.');
 if(view){if(state.views.some(v=>v.id===view))window.pipelineOpenView(view);else notify('This saved view is unavailable.')}
 const section=search.get('section')?.replace(/^(Personal|App) settings$/,'$1');
 if(settingsSections.includes(section)){settingTab=section;go('Settings');await loadSection()}
 if(settingTab==='Team'&&!window.pipelineHost){
  try{const pending=JSON.parse(sessionStorage.getItem('pipeline-draft-invite'));if(pending?.workspace===state.workspace&&el('invite')){el('invite').elements.email.value=pending.email;el('invite').elements.role.value=pending.role;sessionStorage.removeItem('pipeline-draft-invite')}}catch{}
 }
};
window.pipelineOpenView=id=>{if(state.views.some(v=>v.id===id)){selectedView=id;go('Custom views')}};

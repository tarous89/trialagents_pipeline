let state, busy=false, sectionData=null, selectedView='', viewSearch='', viewAuthor='', viewProgram='';
const originalNames={...names};
const model=()=>[...data,...orgDb.map(r=>({...r,type:'Organization'}))];
let baselineItems=new Map(),syncTimer,syncGeneration=0,lastConfirmed='';
let watch=null,retryStream,streamReady=false;
function stopStream(){
 clearTimeout(retryStream);
 watch?.controller.abort();watch=null;streamReady=false;
}
function watchWorkspace(){
 const workspace=state?.workspace;
 if(document.hidden||!workspace){stopStream();return}
 if(watch?.workspace===workspace)return;
 stopStream();
 // Bundled and older assistant hosts only support JSON RPC and keep using revision polling.
 if(window.pipelineHost&&(!window.pipelineAssistant||window.pipelineBundled))return;
 const controller=new AbortController();
 const connection={workspace,controller};watch=connection;
 async function connect(){
   let timeout,reader,connected=false;
   const watchdog=ms=>{clearTimeout(timeout);timeout=setTimeout(()=>controller.abort(),ms)};
   try{
     watchdog(15000);
     const response=await window.pipelineTransport({op:'workspace.events',workspace},controller.signal);
     if(!response?.ok||!response.headers?.get('content-type')?.startsWith('text/event-stream')){
       await response?.body?.cancel();return;
     }
     reader=response.body.getReader();
     const decoder=new TextDecoder();let pending='';
     while(watch===connection){
       const {value,done}=await reader.read();if(done)break;
       watchdog(35000);
       pending+=decoder.decode(value,{stream:true});
       const events=pending.split('\n\n');pending=events.pop();
       if(events.some(event=>event==='data: ready'||event==='data: changed')){
         connected=true;streamReady=true;scheduleWorkspaceRefresh(true);
       }
     }
   }catch{/* Revision polling covers unsupported, interrupted and buffered streams. */}
   finally{
     clearTimeout(timeout);await reader?.cancel().catch(()=>{});
     if(watch===connection){
       streamReady=false;if(connected)scheduleWorkspaceRefresh(true);
       retryStream=setTimeout(()=>{watch=null;watchWorkspace()},connected?250:5000);
     }
   }
 }
 void connect();
}
window.addEventListener('pagehide',stopStream);
window.addEventListener('pageshow',()=>{watchWorkspace();scheduleWorkspaceRefresh(true)});
function scheduleWorkspaceRefresh(immediate=false,retry=false){
 clearTimeout(syncTimer);
 const generation=++syncGeneration;
 if(!state||document.hidden||(!immediate&&!retry&&streamReady&&!busy))return;
 syncTimer=setTimeout(async()=>{
   const previous=state;
   if(!previous)return;
   const revision=previous.revision;let retryCheck=false;
   try{
     if(busy){retryCheck=true;return}
     const snapshot=await rpc('bootstrap',{knownRevision:revision,knownRole:previous.role,knownTeam:previous.team,accessOnly:tab==='Settings'});
     if(generation!==syncGeneration)return;
     if(state!==previous||state.revision!==revision||busy){retryCheck=true;return}
     if(!snapshot.items)return;
     applyLiveSnapshot(snapshot);
   }catch(error){
     if(generation!==syncGeneration||state!==previous)return;
     if([401,403].includes(error.status)){
       state=null;stopStream();el('drawer').close();el('app').replaceChildren();el('rail').replaceChildren();notify(error.message);
     }else{retryCheck=true;if(immediate)notify(error.message)}
   }finally{if(generation===syncGeneration)scheduleWorkspaceRefresh(false,retryCheck)}
 },immediate?0:5000);
}
document.addEventListener('visibilitychange',()=>{watchWorkspace();scheduleWorkspaceRefresh(true)});
window.addEventListener('focus',()=>scheduleWorkspaceRefresh(true));

function applyLiveSnapshot(snapshot){
 if(snapshot.role!==state.role){sectionData=null;sectionLoad++;settingTab='Personal'}
 const main=el('app'),scroll=main.scrollTop,focused=document.activeElement;
 const focusId=main.contains(focused)?focused.id:'',caret=focusId?focused.selectionStart:null;
 if(snapshot.role==='reader'&&el('editform')&&el('drawer').open)el('drawer').close();
 hydrate(snapshot);migrate();progress();
 if(selectedView&&!state.views.some(v=>v.id===selectedView))selectedView='';
 if(tab.startsWith('custom-')&&!Object.hasOwn(names,tab))tab='Custom views';
 const readOnlyId=el('drawer').open&&el('drawer').querySelector('[data-saved-record]')?.dataset.savedRecord;
 if(readOnlyId){if(get(readOnlyId))openItem(readOnlyId);else el('drawer').close()}
 render();main.scrollTop=scroll;
 if(focusId&&el(focusId)){
   el(focusId).focus({preventScroll:true});
   if(caret!=null)el(focusId).setSelectionRange(caret,caret);
 }
 if(el('drawer').open&&el('editform')&&draftConflict())el('error').textContent=conflictMessage;
}


let noticeTimer;
function notify(message,success=false){
  clearTimeout(noticeTimer);
  const n=el('notice');n.classList.toggle('success',success);n.textContent=message;n.hidden=!message;
  if(success)noticeTimer=setTimeout(()=>notify(''),4500);
}
function hydrate(snapshot){
  if(state?.workspace!==snapshot.workspace){viewSearch='';viewAuthor='';viewProgram='';lastConfirmed='';selectedView=''}
  state=snapshot;watchWorkspace();for(const id of Object.keys(names))delete names[id];Object.assign(names,originalNames);
  for(const t of state.tabs)names[t.builtin||'custom-'+t.id]=t.label;
  data=structuredClone(state.items.filter(r=>r.type!=='Organization').map(r=>({...r,start:r.start??'',end:r.end??'',owner:r.owner??''})));
  orgDb=structuredClone(state.items.filter(r=>r.type==='Organization'));
  settings={...state.settings,emails:state.preferences};
  directory.splice(0,directory.length,...(state.assignableMembers||[state.user]).map(member=>[member.name||member.email,'']));
  baselineItems=new Map(model().map(r=>[r.id,JSON.stringify(r)]));
  document.documentElement.style.setProperty('--pipeline-accent',state.accent);
  const header=el('pipeline-header')?.shadowRoot;
  if(header)header.querySelector('.combined-preview-label').hidden=state.role!=='reader';
}
const railToggle=el('pipeline-header')?.shadowRoot?.querySelector('.sidebar-toggle');
if(railToggle)railToggle.onclick=()=>{
 const rail=el('rail');rail.hidden=!rail.hidden;
 railToggle.setAttribute('aria-expanded',String(!rail.hidden));
 railToggle.title=rail.hidden?'Show sidebar':'Hide sidebar';
 railToggle.setAttribute('aria-label',railToggle.title);
};
async function rpc(op,input={},extra={}){
  const req={op,input,workspace:state?.workspace,revision:state?.revision,requestId:crypto.randomUUID(),...extra};
  return window.pipelineTransport(req);
}
async function refreshState(){hydrate(await rpc('bootstrap'));render()}
async function change(op,input,after,recover){
  if(busy)return;busy=true;document.querySelector('.layout').inert=true;
  try{
    const result=await rpc(op,input);
    await refreshState();
    lastConfirmed=op==='items.save'?'Saved record changes':op==='examples.remove'?'Removed example records':op==='view.remove'?'Removed a saved view':'';
    if(after)await after(result);
    notify(op==='examples.remove'?(result.kept?'Examples cleared. Records linked to your work were kept.':'Examples removed.'):op==='view.remove'?'View removed.':op==='items.save'&&input.remove?.length?'Item deleted.':'Saved',true);
  }catch(error){
    notify(error.message);
    try{await refreshState()}catch{document.querySelector('#app').replaceChildren();el('rail').replaceChildren()}
    if(recover&&error.status===409)recover(error);
  }finally{busy=false;document.querySelector('.layout').inert=false}
}
function persistPortfolio(recover){
  const list=model(),ids=new Set(list.map(r=>r.id));
  const upsert=list.filter(r=>baselineItems.get(r.id)!==JSON.stringify(r));
  const remove=[...baselineItems.keys()].filter(id=>!ids.has(id));
  if(upsert.length||remove.length)void change('items.save',{upsert,remove},undefined,recover);
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
    '<div class="pad"><p>Use '+name+' with your Pipeline role. Readers can explore the workspace. Editors and owners can edit records and shared custom views. Only owners can customize the workspace structure.</p>'+assistantAction(name,'Connect to')+'</div>')).join('')+'</div>';
}
const exampleTabs={
 Overview:['Program','program','Program'],Milestones:['Plan','plan','Program'],Timeline:['Plan','plan','Program'],
 Deliverables:['Deliverable','deliverable','Deliverable'],Risks:['Risk','risk','Risk'],Changes:['Change','change','Change']
};
function visibleExample(){
 const selection=exampleTabs[tab];
 if(!selection)return null;
 const [scope]=selection;
 const matches=r=>scope==='Program'||scope==='Plan'||r.type===scope;
 return state.items.some(r=>r.example&&matches(r))?selection:null;
}
function exampleCard([scope,label]){
 const whole=scope==='Program'||scope==='Plan';
 const copy=whole?'Remove the fictional EX-101 program and its remaining examples, then add your own program.':
   'Delete the example '+label+' when you’re ready to add your own.';
 const controls=state.role==='reader'?'':'<div class="example-actions"><button class="primary" data-remove-examples="'+scope+'">Delete example data</button></div>';
 return '<section class="panel empty-panel"><div><h2>Explore the EX-101 example</h2><p>'+copy+'</p></div>'+controls+'</section>';
}
function firstItemCard(type, title) {
  const action = state.role === 'reader' ? '<p>An editor can add the first item.</p>' :
    '<button type="button" class="primary" data-first-type="' + type + '">Add ' + type.toLowerCase() + '</button>';
  return '<section class="panel empty-panel"><h2>' + title + '</h2>' + action + '</section>';
}
function decorateWorkspace(){
  if(!state)return;
  const actions=el('pipeline-header')?.shadowRoot?.querySelector('.assistant-actions');
  if(actions&&!window.pipelineAssistant)into(actions).html=assistantActions('Open in');
  const holder=el('account-holder');
  if(holder){
    const frame=document.createElement('iframe');
    frame.className='account-frame';frame.title=settingTab;
    frame.src='/pipeline-account?tab='+(settingTab==='Support'?'support':'account')+(window.pipelineAssistant==='ChatGPT'?'&surface=chatgpt':'');
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
        const receipt=await rpc('assistant.state',{id:view.id,version:detail.version,state:draft},{revision:detail.revision});
        if(state.revision===detail.revision)state.revision=receipt.revision;
        detail.revision=receipt.revision;detail.version=receipt.version;view.version=receipt.version;lastConfirmed='Saved view controls';notify('Control values saved.',true)
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
 const list=state.views.filter(v=>v.title.toLowerCase().includes(viewSearch.toLowerCase())&&(!viewAuthor||v.author===viewAuthor)&&(!viewProgram||v.filters?.program===viewProgram));
 return '<div class="filters"><label>Search views<input id="view-query" value="'+E(viewSearch)+'"></label><label>Creator<select id="view-author">'+opts([['','All creators'],...new Map(state.views.map(v=>[v.author,[v.author,v.author_name]])).values()],viewAuthor)+'</select></label><label>Program<select id="view-program">'+opts([['','All programs'],...data.filter(r=>r.type==='Program').map(r=>[r.id,r.name])],viewProgram)+'</select></label></div>'+
 panel('Saved views',table(['View','Creator',''],list.map(v=>['<button data-view="'+E(v.id)+'">'+E(v.title)+'</button>',E(v.author_name),(state.role==='owner'||(state.role==='editor'&&state.user.id===v.author))?'<button data-delete-view="'+E(v.id)+'">Remove</button>':'']))+
   (list.length?'':'<p class="pad">'+(state.views.length?'No views match these filters.':state.role==='reader'?'No saved views yet.':window.pipelineAssistant?'Ask ChatGPT to create your first custom view.':'Ask ChatGPT or Claude to create your first custom view.')+'</p>'))+
 (selectedView?showView(state.views.find(v=>v.id===selectedView)):'');
}
const settingButton=(text,action)=>'<button type="button" data-action="'+action+'">'+text+'</button>';
function settingsPage(){
 const owner=state.role==='owner';
 const sections=settingsSections.filter(n=>(owner||!['Billing','Team'].includes(n))&&(!window.pipelineAssistant||n!=='Billing'));
 if(!sections.includes(settingTab))settingTab=sections[0];
 const menu='<div class="pipeline-settings"><nav class="settings-tabs" aria-label="Settings sections">'+sections.map(n=>'<button type="button" data-settings-section="'+n+'" aria-pressed="'+(settingTab===n)+'" class="'+(settingTab===n?'active':'')+'">'+sectionIcons[n]+n+'</button>').join('')+'</nav></div>';
 let body='';
 if(settingTab==='App')body=owner?planningSettings():panel('Planning defaults',table(['Currency','Date format','Lookahead','Reminder'],[[E(settings.currency),E(settings.dateFormat),settings.window+' days',settings.days+' days']]));
 if(settingTab==='App')body+=assistantSettings();
 if(settingTab==='Personal'||settingTab==='Support'){
   const part=settingTab==='Support'?'support':'account';
   body=window.pipelineHost&&(!window.pipelineAssistant||window.pipelineBundled)?panel(E(settingTab),'<div class="pad"><button data-external="/?section='+E(settingTab)+'&amp;workspace='+E(state.workspace)+'">Open '+E(settingTab)+' in TrialAgents</button></div>'):'<div id="account-holder"></div>';
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
 const invite=state.team?'<form class="pad gearform" id="invite">'+field('email','Email',inp('email','','email','required'))+field('role','Access',sel('role',[['editor','Editor'],['reader','Read only']],'editor'))+'<button class="primary">Send invitation</button></form>':window.pipelineAssistant?'<div class="pad"><p>Individual access is free. Team invitations are managed in the app.</p><button data-external="/?section=Team&amp;workspace='+E(state.workspace)+'">Open TrialAgents app ↗</button></div>':'<div class="pad"><p>Invite unlimited team members for US$49 per workspace per month.</p><button class="primary team-upgrade" data-action="billing.checkout">Upgrade · $49 / month</button></div>';
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
document.addEventListener('click',async e=>{
 const b=e.target.closest('button');if(!b)return;
 if(b.dataset.removeExamples&&state.role!=='reader'){
   const example=visibleExample();
   if(example&&b.dataset.removeExamples===example[0]){
     const originTab=tab;
     const entire=['Program','Plan'].includes(example[0]);
     const choice=entire?'Delete the remaining EX-101 example records?':'Delete example '+example[1]+'?';
     if(await confirmAction(choice+' Your own records and examples they depend on will be kept.'))void change('examples.remove',{scope:example[0]},()=>{
       if(filters.program&&!get(filters.program))delete filters.program;
       if(state.role!=='reader'&&tab===originTab)editor('','',example[2]);
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
 if(b.dataset.deleteView){
   const workspace=state.workspace,id=b.dataset.deleteView;
   const view=state.views.find(v=>v.id===id),pinned=state.tabs.some(t=>t.view===id);
   if(!view)return;
   const version=view.version;
   if(pinned&&state.role!=='owner'){notify('Ask the workspace owner to unpin this view before removing it.');return}
   const message='Remove “'+view.title+'”'+(pinned?' and its pinned navigation tab':'')+'?';
   if(await confirmAction(message)&&workspace===state.workspace)void change('view.remove',{id,version,...pinned&&{removePins:true}},()=>{
     if(selectedView===id)selectedView='';render()
   });
 }
 if(b.dataset.revoke)void change('team.revoke',{id:b.dataset.revoke},loadSection);
 if(b.dataset.external)void window.pipelineLink('https://pipeline.trialagents.com'+b.dataset.external);
 if(b.dataset.action?.startsWith('billing.'))void openBilling(b.dataset.action);
 if(b.dataset.action==='more-logs')void loadSection(true);
});
document.addEventListener('input',e=>{if(e.target.id==='view-query'){viewSearch=e.target.value;const pos=e.target.selectionStart;render();el('view-query').focus();el('view-query').setSelectionRange(pos,pos)}});
document.addEventListener('change',async e=>{
 if(e.target.id==='view-author'){viewAuthor=e.target.value;render()}
 if(e.target.id==='view-program'){viewProgram=e.target.value;render()}
 if(e.target.dataset.memberRole){
   if(e.target.value==='remove'&&!await confirmAction('Remove this member from the workspace?')){render();return}
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
window.pipelineLocation=()=>{
 if(!state)return;
 const url=new URL('/', 'https://pipeline.trialagents.com');
 url.searchParams.set('workspace',state.workspace);
 const pinned=state.tabs.find(t=>'custom-'+t.id===tab)?.view;
 if(tab==='Custom views'&&selectedView||pinned)url.searchParams.set('view',pinned||selectedView);
 else if(tab==='Settings')url.searchParams.set('section',settingTab);
 else url.searchParams.set('tab',tab);
 if(el('drawer').open&&editing&&el('editform')&&get(editing))url.searchParams.set('record',editing);
 const readOnlyRecord=el('drawer').querySelector('[data-saved-record]')?.dataset.savedRecord;
 if(el('drawer').open&&readOnlyRecord)url.searchParams.set('record',readOnlyRecord);
 const focused=el('app').querySelector('.selected-record [data-open]');
 if(!el('drawer').open&&focused)url.searchParams.set('record',focused.dataset.open);
 const linked=el('linked-table');
 if(linked&&el('drawer').open){url.searchParams.set('table',linked.dataset.table);if(linked.dataset.record)url.searchParams.set('record',linked.dataset.record)}
 return url.href;
};
window.pipelineMount=async(snapshot,search=new URLSearchParams(location.search))=>{
 if(window.pipelineAssistant){
  if(el('drawer').open)el('drawer').close();
  tab='Overview';filters={};selectedView='';sectionData=null;editing='';returnTo=null;expanded.clear();sectionLoad++;
 }
 hydrate(snapshot);mountPlan();scheduleWorkspaceRefresh(true);
 const record=search.get('record'),view=search.get('view');
 let selected=search.get('tab');
 if(['Updates','Digest'].includes(selected))selected='Overview';
 if(selected==='Overview'&&!record)selected=({Milestone:'Milestones',Activity:'Milestones',Decision:'Milestones',Deliverable:'Deliverables',Change:'Changes',Risk:'Risks'})[search.get('table')]||selected;
 if(selected&&(tabs.includes(selected)||Object.hasOwn(names,selected))&&selected!=='Settings')go(selected);
 if(record&&get(record))openItem(record);
 else if(search.get('table')&&(record||!(tabs.includes(selected)||Object.hasOwn(names,selected))||!['Program','Milestone','Activity','Decision','Deliverable','Change','Risk'].includes(search.get('table')))){
   const tableId=search.get('table');
   const showPage=async(offset=0)=>{
     const page=await rpc('assistant.read',{table:tableId,id:record,offset});
     present('<h2>'+E(selected||page.table)+'</h2><div id="linked-table"></div><button data-close>Close</button>');
     const holder=el('linked-table');holder.dataset.table=tableId;if(record)holder.dataset.record=record;holder.append(resultTable(page));
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
window.pipelineOpenView=id=>{if(state.views.some(v=>v.id===id)){viewSearch='';viewAuthor='';viewProgram='';selectedView=id;go('Custom views')}};

function confirmAction(message){
 const dialog=document.createElement('dialog'),text=document.createElement('p'),cancel=document.createElement('button'),accept=document.createElement('button')
 dialog.className='pipeline-confirm';dialog.setAttribute('aria-label',message);text.textContent=message
 cancel.textContent='Cancel';accept.textContent='Confirm';accept.className='primary'
 cancel.onclick=()=>dialog.close();accept.onclick=()=>dialog.close('confirm')
 dialog.append(text,cancel,accept);document.body.append(dialog)
 return new Promise(resolve=>{dialog.onclose=()=>{dialog.remove();resolve(dialog.returnValue==='confirm')};dialog.showModal();cancel.focus()})
}

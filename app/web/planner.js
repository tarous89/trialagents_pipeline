
const paths={People:'M12 10a3 3 0 1 0 0-6 3 3 0 0 0 0 6z M5 21v-3a7 7 0 0 1 14 0v3 M3 10a3 3 0 0 1 3-4 M2 18v-2l2-3',Developments:'M3 5h18v12H9l-5 4v-4H3z M7 9h10m-10 4h7',Pencil:'M14 3h7v7m0-7-7 7M10 21H3v-7m0 7 7-7',Overview:'M3 4h7v16H3z M14 4h7v6h-7z M14 14h7v6h-7z',Milestones:'M4 21V3m0 1h15l-3 4 3 4H4',Timeline:'M3 3v17h18 M6 6h7m-3 5h8m-4 5h6',Decisions:'M12 2l10 10-10 10L2 12z',Risks:'M12 3L2 21h20z M12 9v5m0 3v1',Settings:'M4 6h7m4 0h5M4 12h2m4 0h10M4 18h10m4 0h2 M11 3v6M7 9v6m8 0v6'};
const tabs=['Overview','Milestones','Timeline','Deliverables','Risks','Changes','Custom views','Settings'],names={Milestones:'Programs',Deliverables:'Deliverables',Changes:'Changes',Risks:'Risks',Settings:'Settings'},colors={Program:'#3354ac',Milestone:'#077862',Activity:'#7852b2',Decision:'#a27605'},glyph={Program:'▰',Milestone:'⚑',Activity:'▬',Decision:'◆'};
paths['Custom views']='M12 3 2 8l10 5 10-5-10-5z M3 12l9 5 9-5 M3 16l9 5 9-5';
const icon=k=>'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="'+(paths[k]||paths.Overview)+'"/></svg>',E=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])),el=id=>document.getElementById(id);
let data=[];
let tab='Overview',filters={},editing='',settings={days:7,window:90,currency:'EUR',dateFormat:'short',emails:{}},scale='Month',anchor=new Date().toISOString().slice(0,10);const get=id=>data.find(r=>r.id===id),money=v=>v==null||v===''?'—':new Intl.NumberFormat('en-GB',{style:'currency',currency:settings.currency,minimumFractionDigits:0,maximumFractionDigits:2}).format(v),date=formatDate,point=t=>['Decision','Milestone'].includes(t);
function formatDate(value){
 if(!value)return '—';
 const [year,month,day]=value.split('-');
 switch(settings.dateFormat){
 case 'iso':return value;
 case 'dmy':return [day,month,year].join('/');
 case 'mdy':return [month,day,year].join('/');
 default:return new Date(value+'T12:00:00Z').toLocaleDateString('en-GB',{day:'numeric',month:'short',timeZone:'UTC'});
 }
}
function itemName(r){return ['Program','Milestone'].includes(r.type)?'<strong class="plan-name">'+E(r.name)+'</strong>':'<span>'+E(r.name)+'</span>'}
function ancestry(r,seen=new Set()){if(!r||seen.has(r.id))return [];seen.add(r.id);return [r.id,...r.parents.flatMap(id=>ancestry(get(id),seen))]}
function match(r){r={...r,...forecast(r)};return (!filters.search||[r.name,r.owner,r.description,programOf(r)[0]?.name].join(' ').toLowerCase().includes(filters.search.trim().toLowerCase()))&&(!filters.owner||r.owner===filters.owner)&&(!filters.program||ancestry(r).includes(filters.program))&&(!filters.type||r.type===filters.type)&&(!filters.status||r.status===filters.status)&&(!filters.risk||r.risk===filters.risk)&&(!filters.budget||(r.budget!=null&&(filters.budget==='under'?r.budget<50000:r.budget>=50000)))&&(!filters.from||r.end>=filters.from)&&(!filters.until||r.start<=filters.until)}
function programOf(r){return ancestry(r).map(get).filter(x=>x?.type==='Program')}
function ordered(){return data.filter(r=>!aux(r)&&match(r)).sort((a,b)=>{let group=r=>programOf(r)[0]?.name||'';return group(a).localeCompare(group(b))||Number(b.type==='Program')-Number(a.type==='Program')||a.end.localeCompare(b.end)}).map(r=>[r,0])}
function editAction(r){return '<button class="edit-action" data-edit="'+E(r.id)+'" aria-label="Edit '+E(r.name)+'" title="Edit '+E(r.name)+'">'+icon('Pencil')+'</button>'}
function stageTrack(stage){const stages=['Discovery','Preclinical','Phase 1','Phase 2','Phase 3'],index=stages.indexOf(stage);return E(stage||'—')+(index<0?'':'<span class="stage-track" aria-hidden="true">'+stages.map((_,i)=>'<i class="'+(i===index?'current':i<index?'past':'')+'"></i>').join('')+'</span>')}
const tag=(s)=>'<span class="tag '+(['High','High risk','At risk'].includes(s)?'risk':['Pending','Medium','Medium risk'].includes(s)?'warn':['Completed','Low'].includes(s)?'good':'')+'">'+E(s)+'</span>',link=r=>'<button class="link" data-open="'+E(r.id)+'">'+itemName(r)+'</button>',type=t=>'<span class="type" style="--c:'+(colors[t]||'#546275')+'">'+(glyph[t]||'•')+' '+E(t==='Change'?'Change':t)+'</span>';
function table(h,rows){return '<div class="scroll"><table><thead><tr>'+h.map(x=>'<th>'+x+'</th>').join('')+'</tr></thead><tbody>'+rows.map(r=>'<tr>'+r.map(c=>'<td>'+c+'</td>').join('')+'</tr>').join('')+'</tbody></table></div>'}
const panel=(t,c)=>'<section class="panel">'+(t?'<h2>'+t+'</h2>':'')+c+'</section>',opts=(arr,v)=>arr.map(x=>'<option '+(String(x[0])===String(v)?'selected':'')+' value="'+E(x[0])+'">'+E(x[1])+'</option>').join(''),select=(k,label,arr)=>'<label>'+label+'<select data-filter="'+k+'">'+opts([['','All'],...arr],filters[k])+'</select></label>',pairs=a=>a.map(x=>[x,x]);
function toolbar(){return '<div class="filters"><label>Search<input id="planSearch" type="search" placeholder="Search plan items" value="'+E(filters.search||'')+'"></label>'+select('program','Program',data.filter(r=>r.type==='Program').map(r=>[r.id,r.name]))+select('owner','Owner',pairs([...new Set(data.map(r=>r.owner).filter(Boolean))].sort()))+select('type','Record',pairs(Object.keys(colors)))+select('status','Status',pairs(statuses))+select('risk','Risk',pairs(['High','Medium','Low','None']))+select('budget','Budget',[['under','Under '+money(50000)],['over',money(50000)+' and over']])+['from','until'].map(k=>'<label>'+(k==='from'?'From':'Through')+'<input type="date" data-filter="'+k+'" value="'+E(filters[k]||'')+'"></label>').join('')+'<button data-clear>Reset</button></div>'}
function go(t){tab=t;render();el('app').scrollTop=0;scheduleWorkspaceRefresh(true)}function present(content){const drawer=el('drawer');into(drawer).html='<div class="details">'+content+'</div>';if(!drawer.open)drawer.showModal();addGrip()}
function openItem(id){
 const r=get(id);if(!r)return;if(state.role==='reader'&&aux(r)){present('<h2 data-saved-record="'+E(r.id)+'">'+E(r.name)+'</h2><p>'+E(r.description||'')+'</p><button data-close>Close</button>');return}if(aux(r)){editor(id);return}if(r.parents[0])expanded.add(r.parents[0]);
 const dest='Milestones';if(r.type==='Milestone')expanded.add(id);
 filters=dest==='Milestones'?{program:programOf(r)[0]?.id}:{};
 go(dest);
 const b=Array.from(el('app').querySelectorAll('tr td:first-child [data-open],.plan-group [data-open]')).find(b=>b.dataset.open===id);
 if(b){const row=b.closest('tr,.plan-group,.entry');row?.classList.add('selected-record');b.focus({preventScroll:true});b.scrollIntoView({block:'nearest'})}
}
function chooseType(){present('<div class="line"><h2>Add record</h2><button data-close aria-label="Close">×</button></div>'+[['Plan',['Program','Milestone','Decision','Activity']],['Events',['Deliverable','Risk','Change']]].map(([name,types])=>'<section class="choice-group"><h3>'+name+'</h3><div class="newchoices">'+types.map(t=>'<button data-new="'+t+'">'+recordIcon(t)+E(t)+'</button>').join('')+'</div></section>').join(''))}
function addGrip(){const drawer=el('drawer');const grip=document.createElement('div');grip.className='grip';grip.tabIndex=0;grip.setAttribute('role','separator');grip.setAttribute('aria-orientation','vertical');grip.setAttribute('aria-label','Resize panel');drawer.prepend(grip);function resize(w){drawer.style.setProperty('--panel-width',Math.min(innerWidth,Math.max(350,w))+'px');grip.setAttribute('aria-valuenow',Math.round(drawer.offsetWidth))}grip.setAttribute('aria-valuenow',drawer.offsetWidth);grip.onpointerdown=e=>{grip.setPointerCapture(e.pointerId)};grip.onpointermove=e=>{if(grip.hasPointerCapture(e.pointerId))resize(innerWidth-e.clientX)};grip.onkeydown=e=>{if(['ArrowLeft','ArrowRight'].includes(e.key)){e.preventDefault();resize(drawer.offsetWidth+(e.key==='ArrowLeft'?40:-40))}}}
function overview(){let ps=data.filter(r=>r.type==='Program');return '<div class="strip">'+[[ps.length,'Active programs'],[data.filter(r=>r.type==='Decision'&&r.status==='Pending').length,'Pending decisions'],[ps.filter(r=>['Medium','High'].includes(r.risk)).length,'Programs at risk']].map(([n,t],i)=>'<div class="card" style="--c:'+['#3354ac','#8538a4','#cd6835'][i]+'"><small>'+t+'</small><strong>'+n+'</strong></div>').join('')+'</div>'+panel('Programs',table(['Program','Assets','Disease','Stage','Next milestone','Time to deadline','Budget · spent / forecast','Health',''],ps.map(r=>{let next=data.filter(x=>x.type==='Milestone'&&!['Completed','Cancelled'].includes(x.status)&&ancestry(x).includes(r.id)).sort((a,b)=>forecast(a).end.localeCompare(forecast(b).end))[0];return [link(r),E(r.asset||'—'),E(r.disease||'—'),stageTrack(r.stage),next?E(next.name):'—',deadline(r),money(r.spend)+' / '+money(forecast(r).budget),tag(r.status)+signals(r),editAction(r)]})))+panel('Upcoming decisions',table(['Decision','Due','Approver',''],data.filter(x=>x.type==='Decision'&&!['Completed','Cancelled'].includes(x.status)).map(r=>[E(r.name),date(forecast(r).end),E(r.owner),signals(r)+editAction(r)])))}


let filterObserver;
const expandedBars=new Set();
function visibleFilterCount(width,sizes,buttonWidth,gap){
 const sum=sizes.reduce((a,b)=>a+b,0);
 if(sum+gap*(sizes.length-1)<=width)return sizes.length;
 let used=buttonWidth,count=0;
 for(const size of sizes){if(used+gap+size>width)break;used+=gap+size;count++}
 return Math.max(1,count);
}
function prepareFilterBar(){
 filterObserver?.disconnect();
 const bar=el('app').querySelector('.filters');
 if(!bar)return;
 const controls=[...bar.children],first=document.createElement('div'),extra=document.createElement('div'),toggle=document.createElement('button');
 first.className='filter-line';extra.className='filter-extra';extra.id='additional-filters';
 toggle.type='button';toggle.className='filter-more';toggle.setAttribute('aria-controls',extra.id);
 bar.replaceChildren(first,extra);bar.classList.add('adaptive-bar');
 const sizes=controls.map(control=>{
  if(control.id==='planSearch'||control.querySelector('#planSearch'))return 165;
  if(control.querySelector('[type=date]'))return 150;
  if(control.tagName==='LABEL')return 150;
  return control.hasAttribute('data-clear')?74:80;
 });
 controls.forEach((control,i)=>control.style.setProperty('--control-width',sizes[i]+'px'));
 let previous=-1;
 function layout(){
  const count=visibleFilterCount(first.clientWidth,sizes,112,12);
  if(count!==previous){
   controls.slice(0,count).forEach(control=>first.append(control));
   controls.slice(count).forEach(control=>extra.append(control));
   first.append(toggle);previous=count;
  }
  const overflow=count<controls.length,open=overflow&&expandedBars.has(tab);
  toggle.hidden=!overflow;extra.hidden=!open;toggle.textContent=open?'Fewer filters':'More filters';toggle.setAttribute('aria-expanded',String(open));
 }
 toggle.onclick=()=>{if(expandedBars.has(tab))expandedBars.delete(tab);else expandedBars.add(tab);layout()};
 layout();filterObserver=new ResizeObserver(layout);filterObserver.observe(first);
}
function emptyWorkspaceTab(example){
 if(example)return exampleCard(example);
 const planned=data.some(r=>!aux(r));
 if((tab==='Overview'&&!data.some(r=>r.type==='Program'))||(['Milestones','Timeline'].includes(tab)&&!planned))return firstItemCard('Program','Start your first program');
 if(eventTabs[tab]&&!data.some(r=>r.type===eventTabs[tab]))return firstItemCard(eventTabs[tab],'No '+tab.toLowerCase()+' yet');
 return '';
}
function railButton(key){
 const label=E(names[key]||key);
 return '<button data-tab="'+key+'" class="'+(tab===key?'active':'')+'" aria-label="'+label+'" title="'+label+'">'+icon(key.startsWith('custom-')?'Custom views':key)+'<span>'+label+'</span></button>';
}
function sidebar(){
 const keys=[...tabs.slice(0,-1),...state.tabs.filter(t=>!t.builtin).map(t=>'custom-'+t.id)];
 const email=state.user.email||'', words=(state.user.name||email.split('@')[0]||'?').trim().split(/\s+/u);
 const initials=[words[0],...(words.length>1?[words.at(-1)]:[])].map(w=>Array.from(w)[0]).join('').toUpperCase();
 return '<nav class="rail-nav" aria-label="Workspace tabs">'+keys.map(railButton).join('')+'</nav>'+railButton('Settings')+
   '<div class="sidebar-identity" title="'+E(email)+'"><span class="account-initials" aria-hidden="true">'+E(initials)+'</span><small>'+E(email)+'</small></div>';
}
function render(){
 deriveRisk();into(el('rail')).html=sidebar();
 const banner=emptyWorkspaceTab(visibleExample());
 const content=tab==='Overview'?overview()+reviewQueue():tab==='Milestones'?work():tab==='Timeline'?timeline():tab==='Custom views'?viewsPage():tab.startsWith('custom-')?customTab():eventTabs[tab]?register(eventTabs[tab]):settingsPage();
 let action='';
 if(tab==='Custom views'&&window.pipelineAssistant&&state.role!=='reader')action='<button class="primary" data-ask-view>Ask ChatGPT to create a custom view</button>';
 else if(!banner&&!['Settings','Custom views'].includes(tab)&&!tab.startsWith('custom-')&&state.role!=='reader')action='<button class="primary" data-add>＋ Add record</button>';
 into(el('app')).html='<div class="title"><h1>'+(tab==='Overview'?'Pipeline Overview':E(names[tab]||tab))+'</h1><div>'+action+'</div></div>'+content+banner;
 prepareFilterBar();decorateWorkspace();
}
let draft;const allTypes=[...Object.keys(colors),'Deliverable','Risk','Change'],field=(name,label,input)=>'<label class="field">'+label+input+'</label>',inp=(name,val,kind='text',more='')=>'<input name="'+name+'" type="'+kind+'" value="'+E(val??'')+'" '+more+'>',sel=(name,arr,v,attr='')=>'<select name="'+name+'" '+attr+'>'+opts(arr,v)+'</select>';
const draftSources=new WeakMap();
const conflictMessage='This record or its linked items changed while you were editing. Your draft is still here. Copy any changes you want to keep, then reopen the record.';
function draftConflict(){
 const changed=d=>{
   const source=draftSources.get(d);
   if(!source||!d.id||source===state.items)return false;
   const relevant=row=>row.id===d.id||row.parents?.includes(d.id)||d.links?.parents.some(link=>link.id===row.id);
   return JSON.stringify(source.filter(relevant))!==JSON.stringify(state.items.filter(relevant));
 };
 return changed(draft)||(returnTo&&changed(returnTo.draft));
}
const memberLabel=m=>(m.name||m.email)+' <'+m.email+'>';
function canApprove(record){
 if(Object.hasOwn(record,'ownerId'))return record.ownerId===state.user.id;
 return [state.user.email,state.user.name].includes(record.owner);
}
function ownerInput(record){
 const members=state.assignableMembers||[],selected=members.find(m=>m.id===record.ownerId);
 const options=members.map(m=>'<option value="'+E(memberLabel(m))+'"></option>').join('');
 return inp('owner',selected?memberLabel(selected):record.owner,'text','list="owner-options" placeholder="Find a member or type a name"')+'<datalist id="owner-options">'+options+'</datalist>';
}
function captureOwner(value){
 const member=state.assignableMembers?.find(m=>memberLabel(m)===value);
 if(member){draft.owner=member.name||member.email;draft.ownerId=member.id}
 else if(value!==draft.owner||state.assignableMembers?.some(m=>m.id===draft.ownerId)){draft.owner=value;draft.ownerId=null}
}
function editor(id='',parent='',newType='Milestone'){if(state.role==='reader')return;editing=id;const r=get(id)||returnTo?.draft.pendingEvents?.find(x=>x.id===id);draft=r?JSON.parse(JSON.stringify(r)):{id:'',type:newType,name:'',parents:parent?[parent]:!returnTo&&newType!=='Program'&&filters.program?[filters.program]:[],owner:'',start:'',end:'',risk:'Low',status:newType==='Risk'?'Open':'Planned',deps:[]};draftSources.set(draft,state.items);if(!aux(draft))initLinks(draft);baseline=null;drawForm();capture();baseline=JSON.stringify(draft);refreshButtons();if(!el('drawer').open)el('drawer').showModal()}
function cycle(from,to,key,seen=new Set()){if(from===to)return true;if(seen.has(from))return false;seen.add(from);const r=get(from);return (r?.[key]||[]).some(x=>cycle(typeof x==='string'?x:x.id,to,key,seen))}
function drawForm(){if(aux(draft)){drawNote();return}let r=draft,t=r.type,allowed=t==='Program'?[]:t==='Milestone'?['Program']:t==='Activity'?['Program','Milestone']:['Program','Milestone'],parents=data.filter(x=>allowed.includes(x.type)&&x.id!==r.id),kids=r.id?data.filter(x=>x.parents.includes(r.id)):[];into(el('drawer')).html='<form id="editform"><div class="line"><h2>'+((editing?'Edit ':'Add ')+E(t.toLowerCase()))+'</h2><button type="button" data-close aria-label="Close record">✕</button></div>'+field('type','Record type',sel('type',allTypes.map(v=>[v,v==='Change'?'Change':v]),t,editing?'disabled':''))+field('name','Name *',inp('recordName',r.name,'text',(['Program','Milestone'].includes(t)?'class="plan-name" ':'')+'required autofocus'))+field('description','Description', '<textarea name="description">'+E(r.description||'')+'</textarea>')+(t==='Program'?'<div class="grid">'+field('asset','Assets',inp('asset',r.asset))+field('stage','Stage',sel('stage',[['','—'],...pairs(['Discovery','Preclinical','Phase 1','Phase 2','Phase 3'])],r.stage))+'</div>'+field('disease','Disease',inp('disease',r.disease)):'')+'<div class="grid">'+(point(t)?'':field('start','Start date',inp('start',r.start,'date')))+field('end',point(t)?'Baseline target date':'Baseline end date',inp('end',r.end,'date'))+'</div><details><summary>Timeline tolerance</summary><div class="grid">'+field('early','Earliest date',inp('early',r.early,'date'))+field('late','Latest date',inp('late',r.late,'date'))+'</div></details><div class="grid">'+field('owner','Owner',ownerInput(r))+field('status',t==='Decision'?'Decision status':'Status',sel('status',pairs(statuses),r.status))+'</div>'+(r.id?'<div class="risk-summary"><span class="forecast-label">Current forecast</span>　'+date(forecast(r).end)+' · '+money(forecast(r).budget)+'</div>':'')+approvalBox(r)+contextSections(r,parents)+'<details><summary>Budget</summary><div class="grid">'+field('budget','Approved budget ('+settings.currency+')',inp('budget',r.budget,'number','min="0"'))+field('spend','Spend to date ('+settings.currency+')',inp('spend',r.spend,'number','min="0"'))+field('reserve','Contingency ('+settings.currency+')',inp('reserve',r.reserve,'number','min="0"'))+'</div></details>'+collaborators(r)+attachments(r)+footer()+'</form>';addGrip()}
function dependencyRow(d,i){const rr=get(d.id);return '<div class="entry" data-rule-index="'+i+'">'+picker('Prerequisite','target',data.filter(x=>!aux(x)&&x.id!==editing),rr?[rr.id]:[],i)+sel('to',point(draft.type)?[['reached','Required to complete']]:[['start','Required to start'],['finish','Required to complete']],d.to)+(rr?.type==='Decision'?field('outcome','Required decision outcome',sel('outcome',[['Approved','Approved'],['Conditional','Conditional'],['No-go','No-go']],d.outcome==='Complete'?'Approved':d.outcome||'Approved')):'')+'<input type="hidden" name="from" value="'+(point(rr?.type)?'reached':'finish')+'"> <button type="button" data-rm="'+i+'">Remove</button></div>'}
function capture(){const f=el('editform'),fd=new FormData(f);if(fd.has('owner'))captureOwner(fd.get('owner'));if(fd.has('recordName'))fd.set('name',fd.get('recordName'));for(const k of ['spend','contact','signoff','format','severity','name','description','asset','stage','disease','start','end','status','risk','partner','early','late'])if(fd.has(k))draft[k]=fd.get(k);for(const k of ['budget','reserve'])if(fd.has(k))draft[k]=fd.get(k)===''?null:Number(fd.get(k));if(aux(draft))draft.parents=fd.getAll('parents');else draft.parents=draft.links.parents.map(x=>x.id).filter(Boolean);for(const k of ['kind','place','assignees'])if(fd.has(k))draft[k]=fd.get(k);if(fd.has('decisionResult'))draft.decisionResult=fd.get('decisionResult');if(draft.type==='Change'){draft.forecasts={};for(const id of draft.parents){const end=fd.get('forecastDate-'+id),budget=fd.get('forecastBudget-'+id);if(end||budget)draft.forecasts[id]={end:end||'',budget:budget||''}}}if(point(draft.type)||aux(draft))draft.start=draft.end}
document.addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;let d=b.dataset;if('plan'in d){el('drawer').close();filters={program:d.plan};go('Milestones')}else if('new'in d){editor('','',d.new)}else if('tab'in d){if(!['Timeline','Milestones'].includes(tab)||!['Timeline','Milestones'].includes(d.tab))filters={};go(d.tab)}else if('open'in d){e.preventDefault();if(el('drawer').open)el('drawer').close();openItem(d.open)}else if('edit'in d)editor(d.edit);else if('close'in d)finishEditor();else if('add'in d){chooseType()}else if('clear'in d){filters={};render()}else if('rule'in d){capture();draft.deps.push({id:'',to:point(draft.type)?'reached':'start',from:'finish'});drawForm()}else if('rm'in d){capture();draft.deps.splice(+d.rm,1);drawForm()}});
document.addEventListener('change',e=>{if(e.target.dataset.filter){filters[e.target.dataset.filter]=e.target.value;render()}if(e.target.name==='type'){capture();draft.type=e.target.value;if(!aux(draft)){draft.links={parents:[],children:[]};draft.parents=[]}draft.status=draft.type==='Risk'?'Open':'Planned';draft.parents=draft.parents.filter(x=>get(x)?.type==='Program');drawForm()}if(e.target.name==='target'){capture();drawForm()}});
document.addEventListener('submit',e=>{e.preventDefault();
if(e.target.id!=='editform'||pendingFiles)return;capture();if(draftConflict()){el('error').textContent=conflictMessage;return}
const savedDraft=structuredClone(draft),savedSource=draftSources.get(draft),savedEditing=editing,savedBaseline=baseline,savedParent=returnTo;
function recover(error){
 if(!state||state.role==='reader'||[401,403].includes(error.status))return;
 draft=savedDraft;draftSources.set(draft,savedSource);editing=savedEditing;baseline=savedBaseline;returnTo=savedParent;
 drawForm();refreshButtons();if(!el('drawer').open)el('drawer').showModal();
 el('error').textContent=draftConflict()?conflictMessage:error.message;
}
let r=draft,msg=!r.name.trim()?'Enter a name.':r.start&&r.end&&r.start>r.end?'End date must follow the start.':r.early&&r.late&&r.early>r.late?'Latest date must follow earliest date.':'';if(msg){el('error').textContent=msg;return}if(!aux(r)&&!savePlan(r))return;if(aux(r)&&!validateLinks(r))return;
if(returnTo&&!returnTo.draft.id&&aux(r)){r.id||=idFor();const parent=returnTo.draft;parent.pendingEvents=(parent.pendingEvents||[]).filter(x=>x.id!==r.id).concat(r);finishEditor();return}
commitOrganizations(r);if(r.status!=='Completed')delete r.approved;if(r.type==='Program')r.parents=[];if(!r.id){r.id=crypto.randomUUID();data.push(r)}else data[data.findIndex(x=>x.id===r.id)]=r;for(const note of r.pendingEvents||[]){note.parents=[...new Set([...note.parents,r.id])];commitOrganizations(note);data.push(note)}delete r.pendingEvents;progress();if(returnTo){const current=get(returnTo.editing);if(current&&returnTo.draft.status===returnTo.originalStatus){returnTo.draft.status=current.status;const normalized=JSON.parse(returnTo.baseline||'null');if(normalized){normalized.status=current.status;returnTo.baseline=JSON.stringify(normalized)}}}finishEditor();render();persistPortfolio(recover)});
const aux=r=>['Risk','Change','Deliverable'].includes(r.type);
const levels=riskLevels;
let exposure=new Map();
function linkedRisks(r){return exposure.get(r.id)||[]}
function deriveRisk(){
 exposure=riskExposure(data);
 for(const r of data)if(!aux(r))r.risk=riskLevel(linkedRisks(r));
}
function implicit(){return []}
function effective(r){return r.deps}
function validateLinks(r){return validateLinksWithPrevious(r,get(r.id))}
function validateLinksWithPrevious(r,previous){
 const items=[...data.filter(x=>x.id!==r.id),r],lookup=new Map(items.map(x=>[x.id,x]));
 function loop(id,path){if(path.has(id))return true;const item=lookup.get(id);return item&&effective(item,items).some(d=>loop(d.id,new Set([...path,id])))}
 const unmet=r.deps.filter(d=>!met(d));
 let msg=r.deps.some(d=>!get(d.id))?'Choose an item for every dependency.':items.some(x=>loop(x.id,new Set()))?'These links would create a dependency cycle.':unmet.some(d=>r.status==='Completed'||(d.to==='start'&&r.status==='In progress'))?'Resolve the mandatory dependency before changing this status.':'';
 if(!msg&&!aux(r)&&r.status==='Completed'&&previous?.status!=='Completed'&&(!r.owner?.trim()||r.approved?.by!==r.owner))msg='Owner approval is required to complete this item.';if(!msg&&!aux(r)&&r.status==='Pending'&&!onlyDecision(r))msg='Pending applies when only a decision remains.';if(msg)el('error').textContent=msg;return !msg
}
function riskInfo(r){const risks=linkedRisks(r);return '<section class="risk-summary"><strong>Risk exposure</strong> '+tag(risks.length?levels[Math.max(...risks.map(x=>levels.indexOf(x.severity)))]: 'None')+(risks.length?'<p>'+risks.map(x=>E(x.name)).join(' · ')+'</p>':'')+'</section>'}
function recordsTable(rows,t){return table([t,'Affected items','Date','Responsible person',...(t==='Risk'?['Severity','Status']:t==='Deliverable'?['Signed off by']:[]),'Files',''],rows.slice().sort((a,b)=>b.end.localeCompare(a.end)).map(r=>[link(r),r.parents.map(get).filter(Boolean).map(x=>E(x.name)).join('<br>')||'—',date(r.end),E(r.owner||'—'),...(t==='Risk'?[tag(r.severity),tag(r.status)]:t==='Deliverable'?[E(r.signoff||'—')]:[]),String(r.files?.length||0),editAction(r)]))}
function register(t){const rows=data.filter(r=>r.type===t),visible=rows.filter(r=>!filters.owner||r.owner===filters.owner);return '<div class="filters">'+select('owner','Responsible person',pairs([...new Set(rows.map(r=>r.owner).filter(Boolean))].sort()))+'<button data-clear>Reset</button></div>'+panel('',recordsTable(visible,t)+(rows.length&&!visible.length?'<p class="pad">No matching items.</p>':''))}

function footer(){return '<p role="alert" id="error"></p><div class="save">'+(editing?'<details class="more"><summary aria-label="More actions">•••</summary><button type="button" data-delete>Delete</button></details><button type="button" data-duplicate>Duplicate</button>':'')+'<button type="button" data-close class="cancel">Cancel</button><button class="primary" type="submit" hidden>Save</button></div>'}
function drawNote(){const r=draft,isRisk=r.type==='Risk',deliver=r.type==='Deliverable';into(el('drawer')).html='<form id="editform"><div class="line"><h2>'+(editing?'Edit ':'Add ')+r.type.toLowerCase()+'</h2><button type="button" data-close aria-label="Close">×</button></div>'+field('name','Name *',inp('recordName',r.name,'text','required autofocus'))+picker('Affected plan items','parents',data.filter(x=>!aux(x)),r.parents)+field('description',isRisk?'Risk and mitigation':deliver?'Content':'What changed','<textarea rows="4" name="description">'+E(r.description||'')+'</textarea>')+attachments(r)+'<div class="grid">'+field('end','Date',inp('end',r.end,'date'))+field('owner','Responsible person',ownerInput(r))+'</div>'+(deliver?'<div class="grid">'+field('signoff','Signed off by',inp('signoff',r.signoff))+field('format','Format',sel('format',pairs(['','Decision','Document','Information','Other',...(r.format==='Email'?['Email']:[])]),r.format))+'</div>':'')+(isRisk?'<div class="grid">'+field('severity','Severity',sel('severity',pairs(['',...levels.slice(1)]),r.severity))+field('status','Status',sel('status',pairs(['','Open','Closed']),r.status))+'</div>':'')+collaborators(r)+(r.type==='Change'?field('place','Location or workstream',inp('place',r.place))+forecastFields(r):'')+footer()+'</form>';addGrip()}
function picker(label,name,records,selected,index=''){
 const value=selected.filter(id=>records.some(r=>r.id===id));
 return '<div class="field picker" data-candidates="'+E(JSON.stringify(records.map(r=>r.id)))+'" data-name="'+name+'" data-index="'+index+'"><label>'+label+'<input type="search" placeholder="Search items…" autocomplete="off"></label>'+value.map(id=>'<input type="hidden" name="'+name+'" value="'+E(id)+'"><button class="chip" type="button" data-unpick="'+id+'" aria-label="Remove '+E(get(id).name)+'">'+type(get(id).type)+' '+itemName(get(id))+' ×</button>').join('')+(name==='target'&&!value.length?'<input type="hidden" name="target" value="">':'')+'<div class="results" hidden></div></div>'
}
function suggestions(p){const q=p.querySelector('[type=search]').value.trim().toLowerCase(),selected=[...p.querySelectorAll('[type=hidden]')].map(n=>n.value);
 const matches=JSON.parse(p.dataset.candidates).map(get).filter(r=>!selected.includes(r.id)&&(r.name+' '+r.type+' '+(programOf(r)[0]?.name||'')).toLowerCase().includes(q));
 const box=p.querySelector('.results');box.hidden=false;into(box).html=matches.map(r=>'<button type="button" data-pick="'+r.id+'">'+type(r.type)+itemName(r)+'</button>').join('')||'<small>No matching items</small>'
}
document.addEventListener('focusin',e=>{document.querySelectorAll('.picker').forEach(p=>{if(!p.contains(e.target))p.querySelector('.results').hidden=true});if(e.target.matches('.picker input[type=search]'))suggestions(e.target.closest('.picker'))});
document.addEventListener('input',e=>{if(e.target.matches('.picker input[type=search]'))suggestions(e.target.closest('.picker'))});
document.addEventListener('keydown',e=>{const p=e.target.closest('.picker');if(!p)return;const options=[...p.querySelectorAll('[data-pick]')];if(e.key==='ArrowDown'||e.key==='ArrowUp'){e.preventDefault();options[Math.max(0,Math.min(options.length-1,options.indexOf(e.target)+(e.key==='ArrowDown'?1:-1)))]?.focus()}if(e.key==='Enter'&&e.target.type==='search'){e.preventDefault();options[0]?.click()}});
document.addEventListener('click',async e=>{const b=e.target.closest('button');if(!b)return;const d=b.dataset;
 if('child'in d)editor('',d.parent,d.child);
 if('pick'in d||'unpick'in d){const p=b.closest('.picker');capture();if(p.dataset.name.startsWith('hier-')){const rows=draft.links[p.dataset.name.slice(5)];rows[+p.dataset.index]=relation(d.pick||'')}else if(['parents','related'].includes(p.dataset.name)){const k=p.dataset.name;draft[k]=d.pick?(k==='parents'&&!aux(draft)?[d.pick]:[...(draft[k]||[]),d.pick]):draft[k].filter(id=>id!==d.unpick)}else{const rule=draft.deps[+p.dataset.index];rule.id=d.pick||'';rule.from=point(get(d.pick)?.type)?'reached':'finish'}drawForm()}
 if('duplicate'in d){capture();if(draft.links)draft.links.children=[];editing='';draft.id='';delete draft.approved;if(!aux(draft))draft.status='Planned';draft.name+=' (copy)';baseline='';drawForm()}
 if('delete'in d){if(draftConflict()){el('error').textContent=conflictMessage;return}const id=editing;if(returnTo?.draft.pendingEvents?.some(x=>x.id===id)){returnTo.draft.pendingEvents=returnTo.draft.pendingEvents.filter(x=>x.id!==id);finishEditor();return}if(data.some(r=>r.parents.includes(id))){el('error').textContent='Reassign or remove the child items before deleting this record.';return}if(!await confirmAction('Delete this record and remove references to it from dependency rules?'))return;data=data.filter(r=>r.id!==id);data.forEach(r=>{r.deps=r.deps.filter(x=>x.id!==id);r.related=(r.related||[]).filter(x=>x!==id)});if(filters.program===id)filters={};finishEditor();render();persistPortfolio()}
});

let baseline=null,returnTo=null,stakeTab='People',pendingFiles=false;
const expanded=new Set(data.filter(x=>x.type==='Milestone').map(x=>x.id));
const directory=[]; let orgDb=[];
const eventTabs={Deliverables:'Deliverable',Risks:'Risk',Changes:'Change'};
paths.Deliverables='M4 5h9l3 3h4v12H4z M8 13l3 3 5-6';paths.Changes=paths.Developments;
function historyFor(r,rollup=false){return data.filter(x=>x.type==='Change'&&r.id&&(rollup?ancestry(x):x.parents).includes(r.id)).sort((a,b)=>b.end.localeCompare(a.end)||b.id.localeCompare(a.id))}
function forecast(r){const current={end:r.end,start:r.start,budget:r.budget};if(aux(r))return current;for(const u of historyFor(r).reverse()){const f=u.forecasts?.[r.id];if(f?.end)current.end=f.end;if(f?.budget!==undefined&&f.budget!=='')current.budget=Number(f.budget)}if(point(r.type))current.start=current.end;return current}
function signals(r){return '<span class="signals">'+Object.values(eventTabs).map(t=>{const n=eventsFor(r,t).length;return n?'<button type="button" data-section="'+t+'" data-item="'+r.id+'" class="sig '+t.toLowerCase()+'">'+n+' '+t.toLowerCase()+(n===1?'':'s')+'</button>':''}).join('')+'</span>'}

function contextSections(r,homes){
 const choices=data.filter(x=>!aux(x)&&x.id!==r.id);
 const children=choices.filter(x=>x.type!=='Program'&&(r.type==='Program'||r.type==='Milestone'&&x.type!=='Milestone'));
 return '<details open><summary>Linked items</summary>'+(r.type==='Program'?'':hierarchyList(r,'parents',homes))+
 (['Program','Milestone'].includes(r.type)?hierarchyList(r,'children',children):'')+
 '</details>'+eventHistory(r)}



function refreshButtons(){const f=el('editform');if(!f)return;capture();const dirty=baseline!==null&&JSON.stringify(draft)!==baseline;f.querySelector('.cancel').textContent=dirty?'Ignore changes':'Cancel';f.querySelector('[type=submit]').hidden=!dirty;f.querySelector('[type=submit]').disabled=pendingFiles}
function finishEditor(){if(returnTo){const old=returnTo;returnTo=null;editing=old.editing;draft=old.draft;baseline=old.baseline;drawForm();refreshButtons()}else el('drawer').close()}
document.addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;const d=b.dataset;
 if('note'in d){capture();returnTo={draft,editing,baseline,originalStatus:draft.status};editor(d.note,draft.id,d.event||'Change')}
 
 if('toggle'in d){expanded.has(d.toggle)?expanded.delete(d.toggle):expanded.add(d.toggle);render()}
 if('section'in d && d.item){editor(d.item);const box=el('history-'+d.section);box.open=true;box.scrollIntoView()}
 if('fileRemove'in d){capture();draft.files.splice(+d.fileRemove,1);drawForm()}
 if(el('editform')&&el('drawer').open)refreshButtons()
});
document.addEventListener('input',e=>{if(e.target.closest('#editform'))refreshButtons()});
document.addEventListener('change',async e=>{if(!e.target.closest('#editform'))return;if(e.target.id==='files'){
 const target=draft;pendingFiles=true;refreshButtons();
 try{const files=await Promise.all([...e.target.files].map(file=>new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve({name:file.name,url:String(reader.result).replace(/^data:[^,]*,/, 'data:application/octet-stream;base64,')});reader.onerror=reject;reader.readAsDataURL(file)})));if(target===draft){capture();draft.files=[...(draft.files||[]),...files];drawForm()}}
 catch{el('error').textContent='Could not read the attachment. Please select it again.'}finally{pendingFiles=false}}
 refreshButtons()});
el('drawer').addEventListener('cancel',e=>{if(returnTo){e.preventDefault();finishEditor()}});

document.addEventListener('click',e=>{if(tab!=='Milestones'||e.target.closest('button,a,input,dialog,select,summary'))return;e.target.closest('tr')?.querySelector('[data-toggle]')?.click()});
function attachments(r){return '<section><label class="field">Files<input type="file" multiple id="files"></label>'+(r.files||[]).map((f,i)=>'<div class="line"><button type="button" data-file-item="'+E(r.id)+'" data-file-id="'+E(f.id||'')+'" data-file-index="'+i+'">'+E(f.name)+'</button><button type="button" data-file-remove="'+i+'">Remove</button></div>').join('')+'</section>'}
function collaborators(r){return '<section class="participants organization-section">'+organizations(r)+'</section><section class="participants">'+members(r)+'</section>'}
function forecastFields(r){return '<details><summary>Forecast changes by item</summary>'+r.parents.map(id=>{const x=get(id),f=r.forecasts?.[id]||{};return '<div class="entry">'+type(x.type)+' '+itemName(x)+'<div class="grid">'+field('','Revised date',inp('forecastDate-'+id,f.end,'date'))+field('','Revised budget ('+settings.currency+')',inp('forecastBudget-'+id,f.budget,'number','min="0"'))+'</div></div>'}).join('')+'</details>'}
function eventsFor(r,t){return (t==='Risk'?linkedRisks(r):data.filter(x=>r.id&&x.type===t&&ancestry(x).includes(r.id))).sort((a,b)=>b.end.localeCompare(a.end))}
function eventHistory(r){return Object.values(eventTabs).map(t=>{const list=[...eventsFor(r,t),...(r.pendingEvents||[]).filter(x=>x.type===t)];return '<details class="event-summary" id="history-'+t+'" open><summary>'+t+'s · '+list.length+'</summary>'+list.map(x=>'<button type="button" class="history-entry" data-note="'+x.id+'"><span>'+E(x.name)+'</span><small>'+[x.end?date(x.end):'',E(x.owner)].filter(Boolean).join(' · ')+'</small></button>').join('')+('<button type="button" data-note="" data-event="'+t+'">＋ Add '+t.toLowerCase()+'</button>')+'</details>'}).join('')}
function outline(){
 const plans=data.filter(x=>!aux(x)),rows=[],filtered=Object.entries(filters).some(([k,v])=>k!=='program'&&v);
 const sort=(a,b)=>(forecast(a).end||'9999').localeCompare(forecast(b).end||'9999')||a.name.localeCompare(b.name);
 function visit(r,depth){const kids=plans.filter(x=>x.parents[0]===r.id).sort((a,b)=>Number(b.type==='Milestone')-Number(a.type==='Milestone')||sort(a,b));
 if(!match(r)&&!plans.some(x=>match(x)&&ancestry(x).includes(r.id)))return;
 const open=r.type==='Program'||expanded.has(r.id)||filtered;rows.push({r,depth,open,kids:kids.length});
 if(open)for(const child of kids)visit(child,depth+1)}
 plans.filter(x=>!x.parents[0]||!get(x.parents[0])).sort((a,b)=>Number(b.type==='Program')-Number(a.type==='Program')||a.name.localeCompare(b.name)).forEach(r=>visit(r,0));return rows}
function treeName({r,open,kids}){
 const label=itemName(r);
 if(r.type==='Milestone'&&kids)return '<div class="tree-label"><button class="milestone-toggle" data-toggle="'+E(r.id)+'" aria-expanded="'+Boolean(open)+'"><span class="caret" aria-hidden="true">'+(open?'▾':'▸')+'</span>'+label+'</button></div>';
 return '<div class="tree-label">'+label+'</div>';
}
function workRows(rows){return table(['Plan item','Type','Deadline','Budget','Owner','Status','Health',''],rows.map(row=>{const r=row.r,f=forecast(r);return [treeName(row),type(r.type),date(f.end),money(f.budget),E(r.owner||'—'),tag(r.status),signals(r),editAction(r)]}))}
function timeRows(rows,program){if(program)rows=[{r:program,depth:0},...rows];const dates=outline().flatMap(({r})=>{const f=forecast(r);return [f.start,f.end].filter(Boolean).map(Date.parse)}).filter(Number.isFinite);
 const lo=Math.min(...dates),hi=Math.max(...dates),span=Math.max(86400000,hi-lo),pos=s=>2+94*(Date.parse(s)-lo)/span;
 const ticks=dates.length?[0,.25,.5,.75,1].map(v=>'<span>'+date(new Date(lo+span*v).toISOString().slice(0,10))+'</span>').join(''):'';
 return rows.length?'<div class="scroll"><div class="chart"><div class="chartrow"><div>Plan item</div><div class="ticks">'+ticks+'</div><div></div></div>'+rows.map(row=>{const r=row.r,f=forecast(r),a=f.start||f.end,b=f.end||a;return '<div class="chartrow">'+(r===program?'<div><small>Program duration</small></div>':treeName(row))+'<div class="track">'+(a?'<span title="'+date(a)+' – '+date(b)+'" class="timeline-mark '+(r.type==='Decision'?'diamond':r.type==='Milestone'?'timeline-flag':'bar')+'" style="--c:'+colors[r.type]+';left:'+pos(a)+'%;'+(point(r.type)?'':'width:'+Math.max(1,pos(b)-pos(a))+'%;')+'">'+(r.type==='Milestone'?'⚑':'')+'</span>':'<small>Unscheduled</small>')+'</div>'+editAction(r)+'</div>'}).join('')+'</div></div>':table(['Plan item','Timeline',''],[])}

const statuses=['Planned','In progress','Pending','On hold','Completed','Cancelled'];
const iconKeys={Program:'Overview',Milestone:'Milestones',Decision:'Decisions',Deliverable:'Deliverables',Change:'Changes',Risk:'Risks',Activity:'Activity'};
paths.Activity='M4 5h16v14H4z M8 12l3 3 5-6';
function recordIcon(t){return '<span style="color:'+(colors[t]||'#375778')+'">'+icon(iconKeys[t])+'</span>'}
function deadline(r){const end=forecast(r).end;if(!end)return '—';const now=new Date(),days=Math.round((Date.parse(end)-Date.UTC(now.getFullYear(),now.getMonth(),now.getDate()))/86400000);return date(end)+'<small class="note">'+(days===0?'Due today':Math.abs(days)+' days '+(days<0?'overdue':'left'))+'</small>'}
function programCards(view){const groups=new Map();for(const row of outline()){const p=programOf(row.r)[0];if(!groups.has(p))groups.set(p,[]);if(p!==row.r)groups.get(p).push(row)}
 return toolbar()+([...groups].map(([p,rows])=>'<section class="panel"><div class="program-head"><h2>'+E(p?.name||'Unassigned items')+'</h2>'+(p?'<span><small>'+date(forecast(p).start)+' – '+date(forecast(p).end)+'</small>'+tag(p.status)+signals(p)+editAction(p)+'</span>':'')+'</div>'+view(rows,p)+'</section>').join('')||panel('',view([])+(data.some(r=>!aux(r))?'<p class="pad">No matching items.</p>':'')))}
function work(){return programCards(workRows)}function timeline(){return programCards(timeRows)+(outline().length?'<div class="legend" aria-label="Timeline legend">'+Object.keys(colors).map(type).join('')+'</div>':'')}
function splitNames(s){return [...new Set(String(s||'').split(',').map(v=>v.trim()).filter(Boolean))]}
function idFor(){return 'o'+Date.now().toString(36)+Math.random().toString(36).slice(2,7)}
function orgByName(name,items){return items.find(x=>x.name.toLowerCase()===name.toLowerCase())}
function migrate(){for(const r of data){
 if(!aux(r)){const prior=r.status;if(r.type==='Decision'&&['No-go','Conditional'].includes(prior))r.decisionResult=prior;r.status=({Complete:'Completed','On track':'Planned',Conditional:'Completed','No-go':'Completed'})[prior]||prior;if(!statuses.includes(r.status))r.status='Planned';if(r.status==='Pending'&&r.type!=='Decision'&&!onlyDecision(r))r.status='Planned'}
 r.members??=splitNames(r.assignees);if(!r.orgIds){r.orgIds=[];for(const name of splitNames(r.partner)){let o=orgByName(name,orgDb);if(!o){o={id:idFor(),name,contacts:directory.filter(x=>x[1]===name).map(x=>x[0])};orgDb.push(o)}o.contacts=[...new Set([...o.contacts,...splitNames(r.contact)])];r.orgIds.push(o.id)}}}}
function members(r){const choices=[...new Set([...directory.map(x=>x[0]),...data.flatMap(x=>[x.owner,...(x.members||[])])].filter(Boolean))].sort();return '<h3>Team members</h3>'+chips(r.members||[],'member')+'<div class="inline-field"><input id="member-name" aria-label="Team member" list="people-list" placeholder="Find or add a person"><datalist id="people-list">'+choices.map(n=>'<option value="'+E(n)+'">').join('')+'</datalist><button type="button" data-member-add>Add</button></div>'}
function chips(values,kind){return values.map(v=>'<button class="chip" type="button" data-remove-'+kind+'="'+E(v)+'">'+E(v)+' ×</button>').join(' ')}
function availableOrgs(r){const merged=new Map(orgDb.map(o=>[o.id,o]));for(const o of r.orgEdits||[])merged.set(o.id,o);return [...merged.values()]}
function organizations(r){const options=availableOrgs(r),ids=r.orgIds||[];return '<h3>Organizations</h3>'+ids.map(id=>{const o=options.find(x=>x.id===id);if(!o)return '';return '<div class="org-row"><div><span>'+E(o.name)+'</span><small>'+E(o.contacts.join(' · '))+'</small></div><button type="button" class="org-pencil" data-org-edit="'+id+'" aria-label="Edit '+E(o.name)+'" title="Edit organization">'+icon('Pencil')+'</button><button type="button" aria-label="Remove organization" data-org-remove="'+id+'">×</button></div>'}).join('')+'<div class="inline-field"><select id="org-pick" aria-label="Select organization">'+opts([['','Select an organization'],...options.filter(o=>!ids.includes(o.id)).map(o=>[o.id,o.name])],'')+'</select><button type="button" data-org-add>Add</button></div><details id="org-fields"><summary>Add organization</summary><input id="org-id" type="hidden">'+field('','Organization name',inp('orgName','','text','id="org-name"'))+field('','Contact persons',inp('orgContacts','','text','id="org-contacts" placeholder="Names, separated by commas"'))+'<button type="button" data-org-store>Use organization</button><p role="alert" id="org-error"></p></details>'}
function commitOrganizations(r){for(const o of r.orgEdits||[]){const i=orgDb.findIndex(x=>x.id===o.id);if(i<0)orgDb.push(o);else orgDb[i]=o}delete r.orgEdits}
function met(d){const p=get(d.id);return p?.status==='Completed'&&(p.type!=='Decision'||(p.decisionResult||'Approved')===(d.outcome==='Complete'?'Approved':d.outcome||'Approved'))}
function onlyDecision(r){const missing=r.deps.filter(d=>!met(d));return missing.length?missing.every(d=>get(d.id)?.type==='Decision'):r.type==='Decision'}
function evidence(r){return data.some(x=>x.type==='Deliverable'&&x.parents.includes(r.id))}
function reviewDeps(r){return [...r.deps,...(r.links?.children||[]).filter(v=>v.id&&v.to).map(v=>({...v}))]}
function ready(r){return !aux(r)&&['In progress','Pending'].includes(r.status)&&evidence(r)&&reviewDeps(r).every(met)}
function progress(){for(const r of data){if(aux(r)||!evidence(r)||['Completed','Cancelled','On hold'].includes(r.status))continue;
 const missing=r.deps.filter(d=>!met(d));r.status=missing.length&&onlyDecision(r)?'Pending':missing.some(d=>d.to==='start')?'Planned':'In progress'}}
function approvalBox(r){const decision=r.type==='Decision'?field('decisionResult','Decision outcome',sel('decisionResult',pairs(['Approved','Conditional','No-go']),r.decisionResult||'Approved')):'';
 return decision+(r.id&&!['Cancelled','On hold','Completed'].includes(r.status)&&reviewDeps(r).every(met)?'<section class="approval"><span>'+E(r.owner||'Unassigned owner')+(ready(r)?' · Deliverable received. Ready for completion review.':' · Completion review')+'</span><button type="button" data-approve>Approve completion</button></section>':'')}
function reviewQueue(){const items=data.filter(ready);return items.length?panel('Awaiting owner approval',table(['Plan item','Owner',''],items.map(r=>[itemName(r),E(r.owner||'Unassigned'),'<button data-edit="'+r.id+'">Review completion</button>']))):''}
document.addEventListener('input',e=>{if(e.target.id==='planSearch'){const pos=e.target.selectionStart;filters.search=e.target.value;render();const input=el('planSearch');input.focus();input.setSelectionRange(pos,pos)}});
document.addEventListener('click',async e=>{const b=e.target.closest('button');if(!b)return;const d=b.dataset;
 if('approve'in d){capture();if(!canApprove(draft)){el('error').textContent='Only the assigned record owner can approve completion.';return}if(!reviewDeps(draft).every(met)){el('error').textContent='Resolve the mandatory dependencies first.';return}if(!await confirmAction('Record completion approval by '+draft.owner+'?'))return;draft.approved={by:draft.owner,date:new Date().toISOString()};draft.status='Completed';drawForm();refreshButtons();return}
 if(!Object.keys(d).some(k=>['memberAdd','removeMember','orgAdd','orgEdit','orgRemove','orgStore'].includes(k)))return;
 capture();if('memberAdd'in d){const name=el('member-name').value.trim();if(!name)return;draft.members=[...new Set([...(draft.members||[]),name])]}
 if('removeMember'in d)draft.members=(draft.members||[]).filter(n=>n!==d.removeMember);
 if('orgEdit'in d){const o=availableOrgs(draft).find(o=>o.id===d.orgEdit);el('org-fields').querySelector('summary').textContent='Edit organization';el('org-fields').open=true;el('org-id').value=o.id;el('org-name').value=o.name;el('org-contacts').value=o.contacts.join(', ');el('org-contacts').focus();return}
 if('orgAdd'in d){const id=el('org-pick').value;if(!id)return;draft.orgIds=[...new Set([...(draft.orgIds||[]),id])]}
 if('orgRemove'in d)draft.orgIds=(draft.orgIds||[]).filter(id=>id!==d.orgRemove);
 if('orgStore'in d){const name=el('org-name').value.trim();if(!name){el('org-error').textContent='Enter an organization name.';return}
 const existing=orgByName(name,availableOrgs(draft)),id=el('org-id').value||existing?.id||idFor();if(existing&&existing.id!==id){el('org-error').textContent='An organization already uses this name.';return}
 const contacts=splitNames(el('org-contacts').value);const o={id,name,contacts:el('org-id').value?contacts:[...new Set([...(existing?.contacts||[]),...contacts])]};
 draft.orgEdits=[...(draft.orgEdits||[]).filter(x=>x.id!==id),o];draft.orgIds=[...new Set([...(draft.orgIds||[]),id])]}
 drawForm();refreshButtons()
});
const mailTypes=[
 ['assignment','Owner assignment','When you become the owner of a record.'],
 ['deadline','Deadline reminder','Once per deadline, at the lead time selected above.'],
 ['review','Completion review','When a deliverable is present and all prerequisites are met.'],
 ['change','Change recorded','When a change is logged against an item you own.'],
 ['risk','Risk recorded','When a risk is logged against an item you own.'],
 ['deliverable','Deliverable received','When a deliverable is added to an item you own.']
];


const sectionIcons={"App":"<svg aria-hidden=\"true\" fill=\"none\" height=\"18\" viewBox=\"0 0 24 24\" width=\"18\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"1.8\"><circle cx=\"12\" cy=\"12\" r=\"3\" /><path d=\"M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.2h-4V21a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9A1.7 1.7 0 0 0 3 14H2.8v-4H3a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9L4.2 7 7 4.2l.1.1A1.7 1.7 0 0 0 9 4.6 1.7 1.7 0 0 0 10 3V2.8h4V3a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.2v4H21a1.7 1.7 0 0 0-1.6 1Z\" /></svg>","Personal":"<svg aria-hidden=\"true\" fill=\"none\" height=\"18\" viewBox=\"0 0 24 24\" width=\"18\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"1.8\"><path d=\"M3 21h18\" /><path d=\"M6 21V7l6-4 6 4v14\" /><path d=\"M9 9h1\" /><path d=\"M14 9h1\" /><path d=\"M9 13h1\" /><path d=\"M14 13h1\" /><path d=\"M10 21v-4h4v4\" /></svg>","Team":"<svg aria-hidden=\"true\" fill=\"none\" height=\"18\" viewBox=\"0 0 24 24\" width=\"18\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"1.8\"><circle cx=\"9\" cy=\"8\" r=\"3\" /><path d=\"M3.5 20a5.5 5.5 0 0 1 11 0\" /><path d=\"M16 5.5a3 3 0 0 1 0 5.8\" /><path d=\"M18 20a5 5 0 0 0-3.2-4.7\" /></svg>","Logs":"<svg aria-hidden=\"true\" fill=\"none\" height=\"18\" viewBox=\"0 0 24 24\" width=\"18\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"1.8\"><path d=\"M3 12h4l2-7 4 14 2-7h6\" /></svg>","Billing":"<svg aria-hidden=\"true\" fill=\"none\" height=\"18\" viewBox=\"0 0 24 24\" width=\"18\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"1.8\"><rect x=\"3\" y=\"5\" width=\"18\" height=\"14\" rx=\"2\" /><path d=\"M3 10h18\" /><path d=\"M7 15h3\" /></svg>","Notifications":"<svg aria-hidden=\"true\" fill=\"none\" height=\"18\" viewBox=\"0 0 24 24\" width=\"18\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"1.8\"><path d=\"M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9\" /><path d=\"M10 21h4\" /></svg>","Support":"<svg aria-hidden=\"true\" fill=\"none\" height=\"18\" viewBox=\"0 0 24 24\" width=\"18\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"1.8\"><circle cx=\"12\" cy=\"12\" r=\"9\" /><path d=\"M9.5 9a2.7 2.7 0 0 1 5.2 1c0 2-2.7 2.2-2.7 4\" /><path d=\"M12 18h.01\" /></svg>"};
const settingsSections=['Personal','App','Team','Logs','Billing','Notifications','Support'];
let settingTab=settingsSections[0];

function planningSettings(){
 
return panel('Planning defaults','<form id="settingsform" class="pad gearform">'+field('currency','Budget currency',sel('currency',pairs(['EUR','USD','GBP','CHF','CAD','AUD','JPY']),settings.currency))+
 field('dateFormat','Date format',sel('dateFormat',[['short','23 Nov'],['dmy','DD/MM/YYYY'],['mdy','MM/DD/YYYY'],['iso','YYYY-MM-DD']],settings.dateFormat))+field('window','Milestone lookahead (days)',inp('window',settings.window,'number','min="1" required'))+field('days','Deadline reminder (days before)',inp('days',settings.days,'number','min="0" required'))+
 '<button class="primary">Save settings</button> <output></output></form>');
}
function relation(id,edge){return {id,to:edge?.to==='reached'?'finish':edge?.to||'',outcome:edge?.outcome||'Approved'}}
function initLinks(r){
 const children=data.filter(x=>!aux(x)&&r.id&&x.parents.includes(r.id));
 r.links={parents:r.parents.map(id=>relation(id,get(id)?.deps.find(d=>d.id===r.id))),children:children.map(x=>relation(x.id,r.deps.find(d=>d.id===x.id)))};
 r.deps=r.deps.filter(d=>!children.some(x=>x.id===d.id));
}
function hierarchyList(r,side,choices){
 const parent=side==='parents',rows=r.links[side],title=parent?'Parent items':'Child items';
 if(!rows.length)rows.push(relation(''));
 return '<section class="hier"><h3>'+title+'</h3><small>'+(parent?'This item must be complete before the selected parent can start or finish.':'The selected child must be complete before this item can start or finish.')+' Applies when a dependency is selected.</small>'+
 rows.map((row,i)=>'<div class="hier-row">'+picker(parent?'Belongs to':'Child item','hier-'+side,choices.filter(x=>!rows.some((v,j)=>i!==j&&v.id===x.id)),row.id?[row.id]:[],i)+
 field('','Dependency',sel('hierRule',[['','Optional'],['start','Required to start'],['finish','Required to complete']],row.to,'data-side="'+side+'" data-row="'+i+'"'))+
 ((parent?r.type:get(row.id)?.type)==='Decision'&&row.to?field('','Required decision outcome',sel('hierOutcome',pairs(['Approved','Conditional','No-go']),row.outcome,'data-side="'+side+'" data-row="'+i+'"')):'')+
 ( !parent&&get(row.id)?.parents.some(id=>id!==r.id)?'<small class="move-hint">Saving moves this child from '+get(row.id).parents.map(get).filter(Boolean).map(itemName).join(', ')+'.</small>':'')+'</div>').join('')+(parent?'':'<button type="button" data-more-child>＋ Add child item</button>')+'</section>';
}
document.addEventListener('change',e=>{const n=e.target;if(!['hierRule','hierOutcome'].includes(n.name))return;capture();draft.links[n.dataset.side][+n.dataset.row][n.name==='hierRule'?'to':'outcome']=n.value;drawForm();refreshButtons()});
document.addEventListener('click',e=>{if(e.target.closest('[data-more-child]')){capture();draft.links.children.push(relation(''));drawForm();refreshButtons()}});
function savePlan(d){
 const id=d.id||idFor(),r={...d,id,parents:[...d.parents],deps:[...d.deps]},before=data;
 const rows=d.links;
 if(Object.values(rows).flat().some(x=>!x.id&&x.to)){el('error').textContent='Choose an item for each dependency.';return false}
 const childIds=rows.children.map(x=>x.id).filter(Boolean);
 const edge=(item,row)=>({id:item.id,to:row.to,from:point(item.type)?'reached':'finish',...(item.type==='Decision'?{outcome:row.outcome}:{})});
 const updated=before.filter(x=>x.id!==id).map(item=>{
   if(aux(item))return item;
   const x={...item,parents:[...item.parents],deps:item.deps.filter(dep=>!childIds.includes(dep.id)||!get(dep.id)?.parents.includes(item.id))};
   if(x.parents.includes(id)||childIds.includes(x.id)){
    x.parents=x.parents.filter(p=>p!==id);
    if(childIds.includes(x.id)){x.parents=[id];const row=rows.children.find(v=>v.id===x.id);if(row.to)r.deps.push(edge(x,row))}
   }
   if(before.find(p=>p.id===id)?.parents.includes(x.id)||r.parents.includes(x.id)){
    x.deps=x.deps.filter(v=>v.id!==id);const row=rows.parents.find(v=>v.id===x.id);if(row?.to)x.deps.push(edge(r,row))
   }
   return x;
 });
 data=before.some(x=>x.id===id)?before.map(x=>x.id===id?r:updated.find(v=>v.id===x.id)):[...updated,r];let ok=false;
 try{
  if(data.some(x=>x.parents.some(pid=>cycle(pid,x.id,'parents')))){el('error').textContent='This would create a parent–child cycle.';return false}
  if(!validateLinksWithPrevious(r,before.find(x=>x.id===id)))return false;
  for(const x of updated){const old=before.find(v=>v.id===x.id);if(JSON.stringify(x.deps)!==JSON.stringify(old.deps)&&!validateLinksWithPrevious(x,old))return false}
  ok=true;
 }finally{if(!ok)data=before}
 Object.assign(d,r);delete d.links;return true
}
function mountPlan(){migrate();progress();data.filter(r=>r.type==='Milestone').forEach(r=>expanded.add(r.id));

render()}

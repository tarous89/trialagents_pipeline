import {test} from 'node:test'
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {JSDOM} from 'jsdom'
const shell=await readFile('dist/pipeline.html','utf8'),script=await readFile('dist/pipeline.js','utf8')
const snap={id:'w',workspace:'w',role:'owner',revision:0,title:'My workspace',workspaces:[],user:{name:'A',id:'a',email:'a@example.org'},settings:{currency:'EUR',dateFormat:'short',days:7,window:90},preferences:{},tabs:[],views:[],items:[],accent:'#123456'}
test('authenticated browser opens empty, saves a record and renders every section',async()=>{
 const dom=new JSDOM(shell,{runScripts:'outside-only',url:'https://pipeline.trialagents.com/'}),w=dom.window,d=w.document
 const errors=[],ops=[]
 w.addEventListener('error',e=>errors.push(e.message))
 w.structuredClone=structuredClone;w.ResizeObserver=class{observe(){}disconnect(){}};w.requestAnimationFrame=fn=>setTimeout(fn,0)
 w.HTMLDialogElement.prototype.showModal=function(){this.open=true};w.HTMLDialogElement.prototype.close=function(){this.open=false}
 w.fetch=async(url,init)=>{const r=JSON.parse(init.body);ops.push(r);if(r.op==='items.save'){snap.items=r.input.upsert;snap.revision++}
 return {ok:true,json:async()=>r.op==='bootstrap'?structuredClone(snap):r.op==='team.list'?{members:[],invitations:[]}:r.op==='logs'?{entries:[]}:{}}
 }
 const member={id:'m-2',name:'Alex',email:'second@example.org'}
 snap.assignableMembers=[{...member,id:'m-1',email:'first@example.org'},member]
 w.eval(script);const tick=()=>new Promise(r=>setTimeout(r,15));await tick()
 assert.equal(d.querySelectorAll('#rail [data-tab]').length,8);assert.doesNotMatch(d.querySelector('main').textContent,/NorthTherapeutics|Maya Chen/)
 assert.equal(d.querySelector('.sidebar-identity small').textContent,snap.user.email)
 assert(d.querySelector('[data-first-type="Program"]'))
 assert.equal(d.querySelector('[data-add]'),null);d.querySelector('[data-first-type="Program"]').click()
 const currentForm=d.querySelector('#editform')
 assert.equal(currentForm.querySelectorAll('#owner-options option').length,2)
 currentForm.elements.owner.value='Alex <second@example.org>'
 currentForm.elements.recordName.value='First program';currentForm.dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));await tick()
 assert.equal(ops.filter(r=>r.op==='items.save').length,1);assert.equal(snap.items[0].name,'First program');assert.equal(snap.items[0].ownerId,member.id);assert.equal(snap.items[0].owner,'Alex')
 d.querySelector('[data-edit]').click()
 const edited=d.querySelector('#editform');edited.elements.owner.value='External advisor'
 edited.dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));await tick()
 assert.equal(snap.items[0].owner,'External advisor');assert.equal(snap.items[0].ownerId,null)
 for(const b of [...d.querySelectorAll('#rail [data-tab]')]){d.querySelector('#rail [data-tab="'+b.dataset.tab+'"]').click();await tick()}
 const tabs=['Personal','App','Team','Logs','Billing','Notifications','Support'];
 assert.deepEqual(Array.from(d.querySelectorAll('[data-settings-section]'),button=>button.textContent),tabs);
 assert.equal(d.querySelector('[data-settings-section][aria-pressed=true]').textContent,'Personal');
 assert.equal(d.querySelector('.account-frame').getAttribute('src'),'/pipeline-account?tab=account');
 for(const name of tabs){
  d.querySelector('[data-settings-section="'+name+'"]').click();await tick();
  assert(d.querySelector('[data-settings-section="'+name+'"].active'))
  if(name==='Team')assert.equal(d.querySelector('main .panel h2').textContent,'Members')
  if(name==='Notifications')assert(d.querySelector('#save-notices input[role=switch]'))
  if(name==='App'){
   assert.equal(d.querySelectorAll('button.assistant-link:disabled').length,2)
   assert.equal(d.querySelector('#design'),null)
   assert.equal(d.querySelectorAll('.assistant-settings-cards .panel').length,2)
  }
 }
 for(const [section,expected] of [['Personal settings','Personal'],['App settings','App'],['Personal','Personal'],['App','App'],['Billing','Billing']]){
  w.history.replaceState(null,'','/?section='+encodeURIComponent(section));
  await w.pipelineMount(structuredClone(snap));
  assert.equal(d.querySelector('[data-settings-section][aria-pressed=true]').textContent,expected);
 }
 assert.deepEqual(errors,[]);dom.window.close()
})

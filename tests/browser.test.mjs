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
 w.eval(script);const tick=()=>new Promise(r=>setTimeout(r,15));await tick()
 assert.equal(d.querySelectorAll('#rail [data-tab]').length,9);assert.doesNotMatch(d.querySelector('main').textContent,/NorthTherapeutics|Maya Chen/)
 d.querySelector('[data-add]').click();d.querySelector('[data-new="Program"]').click();const form=d.querySelector('#editform');assert(form)
 form.elements.recordName.value='First program';form.dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));await tick()
 assert.equal(ops.filter(r=>r.op==='items.save').length,1);assert.equal(snap.items[0].name,'First program')
 for(const b of [...d.querySelectorAll('#rail [data-tab]')]){d.querySelector('#rail [data-tab="'+b.dataset.tab+'"]').click();await tick()}
 for(const name of ['Team','Logs','Billing','Personal settings','Support','Notifications','App settings']){
  d.querySelector('[data-settings-section="'+name+'"]').click();await tick();
  assert(d.querySelector('[data-settings-section="'+name+'"].active'))
 }
 assert.deepEqual(errors,[]);dom.window.close()
})

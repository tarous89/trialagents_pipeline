import {test,before,after} from 'node:test'
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {randomUUID} from 'node:crypto'
import {PGlite} from '@electric-sql/pglite'
import {pipeline} from '../app/server/store.mjs'
import {stripeBilling} from '../app/server/billing.mjs'
import {deliverMail} from '../app/server/mail.mjs'
const pg=new PGlite()
const db={transaction:fn=>pg.transaction(tx=>fn(async(sql,p)=>(await tx.query(sql,p)).rows))}
const owner={id:'u:owner',email:'owner@example.org',firstName:'Mary',lastName:'Jones'}
const reader={id:'u:reader',email:'reader@example.org',firstName:'Jane',lastName:'Lee'}
const editor={id:'u:editor',email:'editor@example.org',firstName:'Alex',lastName:'A'}
const run=pipeline(db)
let w,version=0
const req=(op,input={},extra={})=>({op,input,workspace:w,requestId:randomUUID(),revision:version,...extra})
const prog={id:'study',name:'Phase 1',type:'Program',status:'Planned',parents:[],deps:[],owner:'Mary Jones',start:'',end:''}
before(async()=>{await pg.exec(await readFile('app/server/schema.sql','utf8'))})
after(()=>pg.close())
test('owner and new workspace; save, replay and reject stale or cross-workspace edits',async()=>{
 const snap=await run(owner,{op:'bootstrap'});w=snap.workspace;assert.deepEqual(snap.items,[]);assert.equal(snap.role,'owner')
 const request=req('items.save',{upsert:[prog]})
 assert.equal((await run(owner,request)).revision,1);assert.equal((await run(owner,request)).revision,1)
 await assert.rejects(run(owner,req('items.save',{remove:['study']})),{status:409})
 await assert.rejects(run(reader,req('bootstrap')),{status:403});version=1
 const entries=(await run(owner,req('logs'))).entries;assert.equal(entries.filter(x=>x.action==='record.created').length,1)
})
test('invites require payment, are email-bound, delivered once, and roles apply to direct operations',async()=>{
 await assert.rejects(run(owner,req('team.invite',{email:reader.email,role:'reader'})),{status:402})
 await pg.query("UPDATE pipeline.workspace SET paid_until=now()+interval '1 month' WHERE id=$1",[w])
 for(const [u,role] of [[reader,'reader'],[editor,'editor']]){
   await run(owner,req('team.invite',{email:u.email,role}))
   let token;await deliverMail(db,async job=>{token=job.message.match(/invite=([\w-]+)/)[1]})
   await assert.rejects(run(owner,req('team.accept',{token})),{status:403})
   assert.equal((await run(u,req('team.accept',{token}))).workspace,w)
   assert.equal((await run(u,req('bootstrap'))).role,role)
 }
 await assert.rejects(run(reader,req('items.save',{remove:['study']})),{status:403})
 await assert.rejects(run(editor,req('design.save',{})),{status:403})
 await run(reader,req('preferences.save',{deadline:false}))
 const view=await run(editor,req('view.save',{title:'Programs',filters:{type:'Program'}}));version=view.revision
 const d=await run(owner,req('design.save',{title:'Portfolio',tabs:[{id:randomUUID(),view:view.id,label:'Programs report'}],accent:'#226644'}));version=d.revision
 await assert.rejects(run(editor,req('view.remove',{id:view.id})),{status:409})
 await run(owner,req('team.member',{user:editor.id,role:'reader'}))
 await assert.rejects(run(editor,req('view.save',{title:'New',filters:{}})),{status:403})
})
test('subscription replay, expiry and renewal preserve membership',async()=>{
 await pg.query("UPDATE pipeline.workspace SET stripe_mode='test',customer='cus_local' WHERE id=$1",[w])
 let status='active'
 const stripe=stripeBilling({stripeMode:()=> 'test',priceId:()=> 'price_flat',stripeRequest:async()=>Response.json({data:[{id:'sub_1',status,metadata:{pipeline_workspace:w},items:{data:[{price:{id:'price_flat'},quantity:1,current_period_end:Math.floor(Date.now()/1000)+3600}]}}]})})
 const event=id=>({id,type:'customer.subscription.updated',livemode:false,data:{object:{customer:'cus_local',metadata:{pipeline_workspace:w}}}})
 status='canceled';await stripe.webhook(db,event('evt_1'));await stripe.webhook(db,event('evt_1'))
 await assert.rejects(run(reader,req('bootstrap')),{status:403});assert.equal((await run(owner,req('bootstrap'))).role,'owner')
 status='active';await stripe.webhook(db,event('evt_2'));assert.equal((await run(reader,req('bootstrap'))).role,'reader')
})
test('invalid links roll back changes, including audit rows',async()=>{
 const bad={...prog,id:'other',type:'Activity',parents:['missing']}
 await assert.rejects(run(owner,req('items.save',{upsert:[bad]})),{status:400})
 assert.equal((await run(owner,req('bootstrap'))).revision,version)
})

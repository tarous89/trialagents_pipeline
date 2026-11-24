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
 const snap=await run(owner,{op:'bootstrap'});w=snap.workspace;assert.equal(snap.items.filter(x=>x.example).length,8);assert.equal(snap.role,'owner')
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
   const joined=await run(u,req('bootstrap'));assert.equal(joined.role,role);version=joined.revision
 }
 await assert.rejects(run(reader,req('items.save',{remove:['study']})),{status:403})
 await assert.rejects(run(reader,req('examples.remove',{scope:'Program'})),{status:403})
 await assert.rejects(run(editor,req('design.save',{})),{status:403})
 await run(reader,req('preferences.save',{deadline:false}))
 await assert.rejects(run(editor,req('view.save',{title:'Manual',filters:{}})),{status:403})
 const view=await run(editor,req('assistant.view.create',{title:'Programs',query:{table:'Program'},renderer:'live'}),'Claude');version=view.revision
 const d=await run(owner,req('design.save',{title:'Portfolio',tabs:[{id:randomUUID(),view:view.id,label:'Programs report'}],accent:'#226644'}));version=d.revision
 await assert.rejects(run(editor,req('view.remove',{id:view.id})),{status:409})
 await assert.rejects(run(reader,req('view.remove',{id:view.id,version:1,removePins:true})),{status:403})
 await assert.rejects(run(editor,req('view.remove',{id:view.id,version:1,removePins:true})),{status:409})
 const revised=await run(editor,req('assistant.view.update',{id:view.id,version:1,title:'Revised',query:{table:'Program'},renderer:'live'}),'Claude');version=revised.revision
 await assert.rejects(run(owner,req('view.remove',{id:view.id,version:1,removePins:true})),{status:409})
 assert.equal((await run(owner,req('bootstrap'))).views[0].title,'Revised')
 const removal=req('view.remove',{id:view.id,version:2,removePins:true},{revision:0})
 version=(await run(owner,removal)).revision
 assert.equal((await run(owner,removal)).revision,version)
 const after=await run(owner,req('bootstrap'));assert.equal(after.views.length,0);assert.equal(after.tabs.length,0)
 version=(await run(owner,req('team.member',{user:editor.id,role:'reader'}))).revision
 await assert.rejects(run(editor,req('assistant.view.create',{title:'New',query:{table:'Program'},renderer:'live'}),'Claude'),{status:403})
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
test('membership and bootstrap query counts remain constant at 20 and 200 visible programs',async()=>{
 const user={id:'perf',email:'performance@example.org'},ws=(await run(user,{op:'bootstrap'})).workspace
 const counts=[]
 for(const n of [20,200]){
  await pg.query("INSERT INTO pipeline.item SELECT $1, 'r'||i, 'Program', jsonb_build_object('id','r'||i,'type','Program','name','Program '||i) FROM generate_series(1,$2::int) AS i ON CONFLICT DO NOTHING",[ws,n])
  const queries=[]
  const measured=pipeline({transaction:fn=>pg.transaction(tx=>fn(async(sql,p)=>{queries.push(sql);return (await tx.query(sql,p)).rows}))})
  const payload=await measured(user,{workspace:ws,op:'bootstrap'})
  counts.push(queries.length)
  assert.equal(payload.items.filter(item=>!item.example).length,n)
  assert.equal(queries.filter(s=>s.includes(' AND m.user_id=$2')).length,1)
  const matches=await measured(user,{workspace:ws,op:'records.read',input:{type:'Program',id:'r10',limit:1}})
  assert.equal(matches.total,1);assert.equal(matches.records[0].id,'r10')
 }
 assert.deepEqual(counts,[5,5])
})
test('rich views load on demand and belong to their workspace',async()=>{
 const doc='<figure><svg viewBox="0 0 20 20"><circle cx="10" cy="10" r="8"/></svg><figcaption>Program review</figcaption></figure>'
 const saved=await run(owner,req('assistant.view.create',{title:'Portfolio review',query:{table:'Program'},renderer:'static',presentation:doc}),'Claude');version=saved.revision
 const snap=await run(owner,req('bootstrap'));const summary=snap.views.find(v=>v.id===saved.id)
 assert.equal(summary.rich,true);assert.equal(summary.presentation,undefined)
 assert.equal((await run(reader,req('view.read',{id:saved.id}))).presentation,doc)
 const other=(await run(reader,{op:'bootstrap'})).workspace
 await assert.rejects(run(reader,{op:'view.read',workspace:other,input:{id:saved.id}}),{status:404})
})
test('flat monthly Team checkout reuses the open session and pins quantity to one',async()=>{
 const user={id:'billing-owner',email:'billing@example.org'},workspace=(await run(user,{op:'bootstrap'})).workspace
 const requests=[];let amount=4800, configured='price_team', created=false
 const billing=stripeBilling({stripeMode:()=> 'test',priceId:()=> configured,stripeRequest:async(path,args)=>{
  requests.push([path,args])
  if(path.startsWith('/prices?lookup_keys[]='))return Response.json({data:created?[{id:'price_team'}]:[]})
  if(path==='/prices'){
   assert.equal(args.body.get('unit_amount'),'4900')
   assert.equal(args.body.get('recurring[interval]'),'month')
   assert.equal(args.headers['Idempotency-Key'],args.body.get('lookup_key'))
   created=true
   return Response.json({id:'price_team'})
  }
  if(path==='/prices/price_team')return Response.json({active:true,currency:'usd',unit_amount:amount,recurring:{interval:'month',interval_count:1}})
  if(path==='/customers')return Response.json({id:'cus_team'})
  if(path.startsWith('/subscriptions?'))return Response.json({data:[]})
  if(path==='/checkout/sessions')return Response.json({id:'cs_one',url:'https://checkout.stripe.com/sample'})
  if(path==='/checkout/sessions/cs_one')return Response.json({status:'open',url:'https://checkout.stripe.com/sample'})
  throw Error('Unexpected Stripe request')
 }})
 const paidRun=pipeline(db,{billing:billing.checkout})
 await assert.rejects(paidRun(user,{op:'billing.checkout',workspace}),{status:503})
 amount=4900;configured=undefined
 const first=await paidRun(user,{op:'billing.checkout',workspace})
 assert.deepEqual(await paidRun(user,{op:'billing.checkout',workspace}),first)
 assert.equal(requests.filter(([path])=>path==='/prices').length,1)
 const sessions=requests.filter(([path])=>path==='/checkout/sessions')
 assert.equal(sessions.length,1);assert.equal(sessions[0][1].body.get('line_items[0][quantity]'),'1')
 assert.equal(sessions[0][1].body.get('subscription_data[metadata][pipeline_workspace]'),workspace)
})

test('new homes get one linked, removable example of each type without sending mail or reseeding',async()=>{
 const user={id:'demo-onboarding',email:'new@example.org'}
 const [first,again]=await Promise.all([run(user,{op:'bootstrap'}),run(user,{op:'records.read'})])
 assert.equal(again.workspace,first.workspace);assert(again.records.every(r=>r.example))
 const snap=()=>run(user,{op:'bootstrap',workspace:first.workspace})
 const items=first.items, byType=t=>items.find(x=>x.type===t)
 assert.equal(items.length,8)
 assert.equal(new Set(items.map(r=>r.type)).size,8)
 assert.equal(byType('Program').asset,'EX-101')
 assert(byType('Milestone').parents.includes(byType('Program').id))
 assert(byType('Activity').parents.includes(byType('Milestone').id))
 assert(byType('Decision').deps.some(d=>d.id===byType('Milestone').id))
 assert.equal((await pg.query('SELECT * FROM pipeline.mail WHERE workspace_id=$1',[first.workspace])).rows.length,0)
 assert.deepEqual((await snap()).items,items)
 const write=(op,input,revision)=>({workspace:first.workspace,revision,requestId:randomUUID(),op,input})
 const request=write('examples.remove',{scope:'Deliverable'},first.revision)
 const cleared=await run(user,request)
 assert.equal(cleared.removed,1);assert.deepEqual(await run(user,request),cleared)
 assert.equal((await snap()).items.length,7)
 const savedRisk={...byType('Risk'),name:'Our own risk'}
 const real={...prog,id:'our-program',name:'EX-101',example:true}
 const revised=await run(user,write('items.save',{upsert:[savedRisk,real]},cleared.revision))
 assert(!(await snap()).items.find(r=>r.id===savedRisk.id).example)
 assert(!(await snap()).items.find(r=>r.id===real.id).example)
 await assert.rejects(run(user,write('examples.remove',{scope:'Plan'},cleared.revision)),{status:409})
 const result=await run(user,write('examples.remove',{scope:'Program'},revised.revision))
 assert(result.kept>0)
 const remaining=(await snap()).items
 assert(remaining.every(r=>!r.example))
 assert(remaining.some(r=>r.id===savedRisk.id)&&remaining.some(r=>r.id===real.id))
 assert(remaining.some(r=>r.id===savedRisk.parents[0]))
 const emptyUser={id:'existing-empty',email:'existing@example.org'}
 const home=await run(emptyUser,{op:'bootstrap'})
 const noRisk=await run(emptyUser,{...write('examples.remove',{scope:'Risk'},home.revision),workspace:home.workspace})
 const overview=await run(emptyUser,{op:'records.read',workspace:home.workspace,input:{type:'Program'}})
 assert.equal(overview.records[0].risk,'None')
 const all=await run(emptyUser,{...write('examples.remove',{scope:'Plan'},noRisk.revision),workspace:home.workspace})
 assert.equal(all.removed,7);assert.deepEqual((await run(emptyUser,{op:'bootstrap'})).items,[])
 const legacy={...prog,id:'imported',example:true}
 await pg.query('INSERT INTO pipeline.item(workspace_id,id,kind,body) VALUES($1,$2,$3,$4)',[home.workspace,legacy.id,legacy.type,JSON.stringify(legacy)])
 const imported=await run(emptyUser,{op:'bootstrap'})
 assert.equal(imported.items[0].example,undefined)
 const cleanup=await run(emptyUser,{...write('examples.remove',{scope:'Program'},imported.revision),workspace:home.workspace})
 assert.equal(cleanup.removed,0)
 assert.equal((await run(emptyUser,{op:'bootstrap'})).items[0].id,'imported')
})

test('assignments distinguish members with the same name and preserve external owners',async()=>{
 const user={id:'pick-owner',email:'pick@example.org'},ws=(await run(user,{op:'bootstrap'})).workspace
 await pg.query("UPDATE pipeline.workspace SET paid_until=now()+interval '1 month' WHERE id=$1",[ws])
 for(const id of ['alex-a','alex-b'])await pg.query("INSERT INTO pipeline.member(workspace_id,user_id,email,display_name,role) VALUES($1,$2,$3,'Alex','editor')",[ws,id,id+'@example.org'])
 const snap=await run({id:'alex-a',email:'alex-a@example.org'},{op:'bootstrap',workspace:ws})
 assert.deepEqual(snap.assignableMembers.filter(m=>m.name==='Alex').map(m=>m.id),['alex-a','alex-b'])
 assert.deepEqual(await run(user,{op:'bootstrap',workspace:ws,input:{knownRevision:snap.revision,knownRole:'owner',knownTeam:true}}),{revision:snap.revision})
 const item={...prog,id:'assigned',owner:'Alex',ownerId:'alex-b'}
 const save=async(record,revision)=>run(user,{op:'items.save',workspace:ws,revision,requestId:randomUUID(),input:{upsert:[record]}})
 await assert.rejects(save({...item,ownerId:'someone-else'},0),/current workspace member/)
 await save(item,0)
 const mail=await pg.query("SELECT recipient FROM pipeline.mail WHERE workspace_id=$1 AND category='assignment'",[ws])
 assert.deepEqual(mail.rows,[{recipient:'alex-b@example.org'}])
 await save({...item,ownerId:null},1)
 const external=(await run(user,{op:'bootstrap',workspace:ws})).items.find(r=>r.id===item.id)
 assert.equal(external.owner,'Alex');assert.equal(external.ownerId,null)
})

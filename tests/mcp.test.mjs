import test from 'node:test'
import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import {readFile} from 'node:fs/promises'
import {PGlite} from '@electric-sql/pglite'
import {pipeline} from '../app/server/store.mjs'
import {pipelineHttp,protectedResource,resource,metadataPath} from '../mcp/http.mjs'
import {widgetUri} from '../mcp/tools.mjs'

test('standalone shared-web MCP authenticates the exact audience and runs the complete tool-to-database path',async t=>{
 const db=new PGlite();t.after(()=>db.close());await db.exec(await readFile('app/server/schema.sql','utf8'))
 const store=pipeline({transaction:fn=>db.transaction(tx=>fn(async(s,p)=>(await tx.query(s,p)).rows))})
 const user={id:'fictional',email:'user@example.invalid'}
 const {workspace}=await store(user,{op:'home.ensure'},'consent')
 let lost=true
 const serve=pipelineHttp({authorize:(token,aud)=>token==='member'&&aud===resource?user:null,run:async(u,r,source)=>{
   const data=await store(u,r,source)
   if(lost&&r.op==='assistant.view.create'){lost=false;throw Object.assign(Error('Interrupted'),{status:503})}
   return data
 },readWidget:()=>readFile('dist/pipeline-chatgpt.html','utf8')})
 const request=async(method,params,token='member')=>serve(new Request(resource,{method:'POST',headers:{authorization:'Bearer '+token,'content-type':'application/json',accept:'application/json, text/event-stream'},body:JSON.stringify({jsonrpc:'2.0',id:1,method,params})}))
 const unauth=await request('tools/list',{},'other');assert.equal(unauth.status,401);assert.ok(unauth.headers.get('www-authenticate').includes(metadataPath))
 assert.equal((await protectedResource().json()).resource,resource)
 async function rpc(method,params){const res=await request(method,params),raw=await res.text();assert.equal(res.status,200,raw)
   const json=JSON.parse(raw.startsWith('{')?raw:raw.split('\n').find(l=>l.startsWith('data: ')).slice(6));assert.ifError(json.error);return json.result}
 async function call(name,args){const r=await rpc('tools/call',{name,arguments:args});assert.ok(!r.isError,JSON.stringify(r.content));return r}
 const init=await rpc('initialize',{protocolVersion:'2025-11-25',clientInfo:{name:'test',version:'1'},capabilities:{}});assert.equal(init.serverInfo.name,'TrialAgents Pipeline')
 const {tools}=await rpc('tools/list',{});assert.ok(tools.length>=25);assert.ok(tools.every(t=>t.securitySchemes?.[0]?.type==='oauth2'&&t._meta.securitySchemes[0].type==='oauth2'&&t.outputSchema));assert.ok(tools.every(t=>!t.name.includes('billing')))
 const open=await call('open_pipeline',{query:{table:'Milestone',programSearch:'EX-101',fields:['name','end'],order:'end',limit:1}})
 const rows=open.structuredContent.result.data.records;assert.equal(rows[0].values.name,'Site readiness review');assert.doesNotMatch(JSON.stringify(open),/user@example|contacts|billing/)
 const result=async(n,a)=>(await call(n,a)).structuredContent.result
 const metadata=await result('get_pipeline_schema',{workspace});assert.ok(metadata.canManage)
 const def=await result('add_pipeline_table',{workspace,revision:0,request_id:randomUUID(),label:'Committees'})
 const row=await result('create_pipeline_record',{workspace,revision:def.revision,request_id:randomUUID(),table:def.id,values:{name:'Board'}})
 const request_id=randomUUID(),args={workspace,revision:row.revision,request_id,view:{title:'Review committees',query:{table:def.id,fields:['name']}}}
 const saved=(await call('create_pipeline_view',args))._meta.pipeline
 assert.equal(saved.view.data.records[0].values.name,'Board')
 const retry=(await call('retry_pipeline_view',{workspace,request_id}))._meta.pipeline
 assert.deepEqual(retry.receipt,saved.receipt);assert.equal((await result('list_pipeline_views',{workspace})).views.length,1)
 const ui=(await rpc('resources/read',{uri:widgetUri})).contents[0]
 assert.equal(ui._meta.ui.csp.frameDomains[0],'https://pipeline.trialagents.com');assert.match(ui.text,/Open TrialAgents app/)
 const read = query => result('read_pipeline', {workspace,query})
 async function seed(table, name, fields=['name']) {
   const page=await read({table,search:name,fields})
   assert.equal(page.records.length,1)
   return page.records[0]
 }
 const program=await seed('Program','Clinical development of EX-101')
 const milestone=await seed('Milestone','Site readiness review',['name','start','end'])
 const activity=await seed('Activity','Prepare the site readiness checklist')
 const cases=[
   ['Program',{name:'Clinical development of RX-204',asset:'RX-204',stage:'Phase 1',status:'Planned'}],
   ['Milestone',{name:'Protocol sign-off',end:'2027-02-15',parents:[program.id]}],
   ['Deliverable',{name:'Site readiness evidence pack',signoff:'Clinical Operations',parents:[activity.id]}],
   ['Change',{name:'Add a second readiness review',description:'The team requested a second review.',parents:[milestone.id]}],
   ['Activity',{name:'Prepare activation summary',parents:[program.id],start:'2027-03-01',end:'2027-03-05',deps:[{id:milestone.id,from:'reached',to:'start'}]}]
 ]
 for(const [table,values] of cases)await t.test('review case creates and reopens one '+table,async()=>{
   const before=await read({table,search:values.name})
   assert.equal(before.records.length,0)
   const write={workspace,table,revision:before.revision,request_id:randomUUID(),values}
   const created=await result('create_pipeline_record',write)
   assert.deepEqual(await result('create_pipeline_record',write),created)
   const query={table,id:created.id,fields:Object.keys(values)}
   const shown=(await call('open_pipeline',{workspace,query}))._meta.pipeline
   assert.equal(shown.data.records.length,1)
   assert.deepEqual(shown.data.records[0],{table,id:created.id,values})
   assert.equal((await read({table,search:values.name})).records.length,1)
   if(table==='Change')assert.deepEqual(await seed('Milestone','Site readiness review',['name','start','end']),milestone)
 })
})

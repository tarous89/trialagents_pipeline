import test from 'node:test'
import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import {readFile} from 'node:fs/promises'
import {PGlite} from '@electric-sql/pglite'
import {PROTOCOL_VERSION_META_KEY,CLIENT_INFO_META_KEY,CLIENT_CAPABILITIES_META_KEY} from '@modelcontextprotocol/server'
import {pipeline} from '../app/server/store.mjs'
import {pipelineHttp,protectedResource,resource,claudeResource,metadataPath} from '../mcp/http.mjs'
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
 const request=async(method,params,token='member',headers={})=>serve(new Request(resource,{method:'POST',headers:{authorization:'Bearer '+token,'content-type':'application/json',accept:'application/json, text/event-stream',...headers},body:JSON.stringify({jsonrpc:'2.0',id:1,method,params})}))
 const unauth=await request('tools/list',{},'other');assert.equal(unauth.status,401);assert.ok(unauth.headers.get('www-authenticate').includes(metadataPath))
 assert.equal((await protectedResource().json()).resource,resource)
 async function rpc(method,params,headers){const res=await request(method,params,'member',headers),raw=await res.text();assert.equal(res.status,200,raw)
   const json=JSON.parse(raw.startsWith('{')?raw:raw.split('\n').find(l=>l.startsWith('data: ')).slice(6));assert.ifError(json.error);return json.result}
 let context
 const scoped=(name,args,session)=>rpc('tools/call',{name,arguments:args,_meta:{'openai/session':session}})
 async function call(name,args){
   const quiet=tools.find(t=>t.name===name).inputSchema.properties.workspace_context
   const r=await scoped(name,quiet?{...args,workspace_context:context}:args,'session A')
   assert.ok(!r.isError,JSON.stringify(r.content))
   context=r.structuredContent.result.workspace_context??context
   return r
 }
 const init=await rpc('initialize',{protocolVersion:'2025-11-25',clientInfo:{name:'test',version:'1'},capabilities:{}});assert.equal(init.serverInfo.name,'TrialAgents Pipeline')
 const {tools}=await rpc('tools/list',{});assert.ok(tools.length>=25);assert.ok(tools.every(t=>t.securitySchemes?.[0]?.type==='oauth2'&&t._meta.securitySchemes[0].type==='oauth2'&&t.outputSchema));assert.ok(tools.every(t=>!t.name.includes('billing')))
 await t.test('tools that can send email declare irreversible external writes',()=>{
   for(const name of ['create_pipeline_record','update_pipeline_record','invite_pipeline_member']){
     const tool=tools.find(tool=>tool.name===name)
     assert.equal(tool.annotations.readOnlyHint,false,name)
     assert.equal(tool.annotations.destructiveHint,true,name)
     assert.equal(tool.annotations.openWorldHint,true,name)
     assert.match(tool.description,/email/i,name)
   }
 })
 await t.test('modern clients discover, enumerate tools and read a program',async()=>{
   const version='2026-07-28'
   const _meta={[PROTOCOL_VERSION_META_KEY]:version,[CLIENT_INFO_META_KEY]:{name:'test',version:'1'},[CLIENT_CAPABILITIES_META_KEY]:{}}
   async function modern(method,params={}){
     const headers={'Mcp-Protocol-Version':version,'Mcp-Method':method}
     if(params.name)headers['Mcp-Name']=params.name
     return rpc(method,{...params,_meta},headers)
   }
   assert.ok(await modern('server/discover'))
   assert.deepEqual((await modern('tools/list')).tools.map(t=>t.name),tools.map(t=>t.name))
   const res=await modern('tools/call',{name:'read_pipeline',arguments:{workspace,query:{table:'Program',search:'EX-101',fields:['name','status']}}})
   assert.equal(tools.find(t=>t.name==='read_pipeline')._meta.ui.resourceUri,widgetUri)
   assert.equal(res._meta.pipeline.workspace,workspace)
   assert.equal(res.structuredContent.result.url,res._meta.pipeline.url)
   assert.ok(res.structuredContent.result.workspace_context)
   assert.equal(res.structuredContent.result.records[0].values.name,'Clinical development of EX-101')
 })
 const open=await call('open_pipeline',{query:{table:'Milestone',programSearch:'EX-101',fields:['name','end'],order:'end',limit:1}})
 const rows=open.structuredContent.result.data.records;assert.equal(rows[0].values.name,'Site readiness review');assert.doesNotMatch(JSON.stringify(open),/user@example|contacts|billing/)
 const result=async(n,a)=>(await call(n,a)).structuredContent.result
 const quietArgs={workspace,workspace_context:context,query:{table:'Program',fields:['name']}}
 assert.equal((await scoped('read_pipeline_followup',quietArgs,'session B')).isError,true)
 const quiet=await call('read_pipeline_followup',quietArgs)
 assert.equal(quiet._meta,undefined);assert.equal(quiet.structuredContent.result.records.length,1)
 const firstWrite=await scoped('create_pipeline_record',{workspace,revision:0,request_id:randomUUID(),table:'Program',values:{name:'Should never be created'}},'session B')
 assert.equal(firstWrite.isError,true);assert.match(firstWrite.content[0].text,/open_pipeline/)
 for(const selection of ['design','workspaces']){
   const first=await scoped('read_pipeline',{selection},'session B')
   assert.equal(first._meta.pipeline.workspace,workspace);assert.ok(first.structuredContent.result.workspace_context)
 }
 const metadata=await result('get_pipeline_schema',{workspace});assert.ok(metadata.canManage)
 const def=await result('add_pipeline_table',{workspace,revision:0,request_id:randomUUID(),label:'Committees'})
 const row=await result('create_pipeline_record',{workspace,revision:def.revision,request_id:randomUUID(),table:def.id,values:{name:'Board'}})
 const request_id=randomUUID(),args={workspace,revision:row.revision,request_id,view:{title:'Review committees',query:{table:def.id,fields:['name']}}}
 const saved=(await call('create_pipeline_view',args))._meta.pipeline
 assert.equal(saved.view.data.records[0].values.name,'Board')
 const retry=(await call('retry_pipeline_view',{workspace,request_id}))._meta.pipeline
 assert.deepEqual(retry.receipt,saved.receipt);assert.equal((await result('list_pipeline_views',{workspace})).views.length,1)
 const ui=(await rpc('resources/read',{uri:widgetUri})).contents[0]
 assert.equal(ui._meta.ui.csp.frameDomains[0],'https://pipeline.trialagents.com');assert.match(ui.text,/pipeline-embedded/)
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

test('Claude uses its own audience and route, the same tools, and is recorded as Claude',async t=>{
 const db=new PGlite();t.after(()=>db.close());await db.exec(await readFile('app/server/schema.sql','utf8'))
 const store=pipeline({transaction:fn=>db.transaction(tx=>fn(async(s,p)=>(await tx.query(s,p)).rows))})
 const user={id:'fictional-claude',email:'claude-user@example.invalid'}
 const {workspace}=await store(user,{op:'home.ensure'},'consent')
 const sources=[]
 const serve=pipelineHttp({audience:claudeResource,authorize:(token,aud)=>token==='member'&&aud===claudeResource?user:null,
   run:(u,r,source)=>{sources.push(source);return store(u,r,source)},readWidget:()=>readFile('dist/pipeline-chatgpt.html','utf8')})
 const post=(url,method,params,token='member')=>serve(new Request(url,{method:'POST',headers:{authorization:'Bearer '+token,'content-type':'application/json',accept:'application/json, text/event-stream'},body:JSON.stringify({jsonrpc:'2.0',id:1,method,params})}))
 assert.equal((await post(resource,'tools/list',{})).status,404)
 const unauth=await post(claudeResource,'tools/list',{},'other');assert.equal(unauth.status,401)
 assert.ok(unauth.headers.get('www-authenticate').includes('https://mcp.trialagents.com/.well-known/oauth-protected-resource/pipeline/claude'))
 assert.equal((await protectedResource(undefined,claudeResource).json()).resource,claudeResource)
 const rpc=async(method,params)=>{const raw=await (await post(claudeResource,method,params)).text()
   const json=JSON.parse(raw.startsWith('{')?raw:raw.split('\n').find(l=>l.startsWith('data: ')).slice(6));assert.ifError(json.error);return json.result}
 const {tools}=await rpc('tools/list',{})
 // Claude lists read-only tools, one record-edit tool and one app-change tool.
 const model=tools.filter(t=>!t._meta?.ui?.visibility||t._meta.ui.visibility.includes('model'))
 assert.ok(tools.every(t=>t.title&&t.annotations))
 assert.deepEqual(model.filter(t=>!t.annotations.readOnlyHint).map(t=>t.name).sort(),['change_pipeline_app','edit_pipeline_records'])
 assert.ok(model.filter(t=>t.annotations.readOnlyHint).every(t=>!t.annotations.destructiveHint&&!t.annotations.openWorldHint))
 assert.ok(model.filter(t=>!t.annotations.readOnlyHint).every(t=>t.annotations.destructiveHint))
 assert.equal(tools.find(t=>t.name==='edit_pipeline_records').annotations.openWorldHint,true)
 assert.deepEqual(tools.filter(t=>!model.includes(t)).map(t=>t.name),['pipeline_workspace_request'])
 assert.ok(['open_pipeline','read_pipeline','read_pipeline_followup','read_active_pipeline_selection','prepare_pipeline_view'].every(n=>model.some(tool=>tool.name===n)))
 assert.equal((await rpc('tools/call',{name:'create_pipeline_record',arguments:{workspace,revision:0,request_id:randomUUID(),table:'Program',values:{name:'Hidden tool'}}})).isError,true)
 const read=await rpc('tools/call',{name:'read_pipeline',arguments:{workspace}})
 assert.ok(!read.isError,JSON.stringify(read.content))
 // claude.ai shows the model the text block, so it must carry the records and continuation context.
 const shown=JSON.parse(read.content[0].text)
 assert.deepEqual(shown,read.structuredContent)
 assert.ok(shown.result.workspace_context&&Array.isArray(shown.result.records))
 const workspace_context=shown.result.workspace_context
 const call=async(name,args)=>{const r=await rpc('tools/call',{name,arguments:{workspace,workspace_context,...args}});assert.ok(!r.isError,name+' '+JSON.stringify(r.content));return r}
 const revision=async()=>(await store(user,{op:'bootstrap',workspace})).revision
 // Record edits run through one tool.
 const created=(await call('edit_pipeline_records',{action:'create',table:'Program',values:{name:'Combined tool program'},revision:await revision(),request_id:randomUUID()})).structuredContent.result
 await call('edit_pipeline_records',{action:'update',table:'Program',id:created.id,values:{name:'Renamed program'},revision:await revision(),request_id:randomUUID()})
 assert.ok((await store(user,{op:'bootstrap',workspace})).items.some(r=>r.name==='Renamed program'))
 await call('edit_pipeline_records',{action:'delete',table:'Program',id:created.id,revision:await revision(),request_id:randomUUID()})
 assert.ok(!(await store(user,{op:'bootstrap',workspace})).items.some(r=>r.id===created.id))
 assert.equal((await rpc('tools/call',{name:'edit_pipeline_records',arguments:{workspace,workspace_context,action:'archive',table:'Program',revision:0,request_id:randomUUID()}})).isError,true)
 // Schema, design and custom views run through the other, and present the workspace.
 const table=await call('change_pipeline_app',{action:'add_table',label:'Committees',revision:await revision(),request_id:randomUUID()})
 assert.match(table._meta.pipeline.url,/tab=Settings/)
 assert.equal(table.structuredContent.result.workspace_context,workspace_context)
 await call('change_pipeline_app',{action:'add_column',table:table.structuredContent.result.id,column:{label:'Chair',type:'text'},revision:await revision(),request_id:randomUUID()})
 const request_id=randomUUID()
 const saved=await call('change_pipeline_app',{action:'create_view',view:{title:'Committee list',query:{table:'Program'}},revision:await revision(),request_id})
 const viewId=saved._meta.pipeline.view.id
 assert.match(saved._meta.pipeline.url,new RegExp('view='+viewId))
 assert.equal((await call('change_pipeline_app',{action:'retry_view',request_id}))._meta.pipeline.receipt.id,viewId)
 await call('change_pipeline_app',{action:'update_view',id:viewId,version:saved._meta.pipeline.view.version,view:{title:'Committee overview',query:{table:'Program'}},revision:await revision(),request_id:randomUUID()})
 assert.equal((await call('read_pipeline_view',{id:viewId})).structuredContent.result.title,'Committee overview')
 assert.ok(sources.length&&sources.every(s=>s==='Claude'))
})

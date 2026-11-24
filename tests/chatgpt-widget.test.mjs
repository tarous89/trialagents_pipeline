import test from 'node:test'
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {build} from 'esbuild'
import {chromium,expect} from '@playwright/test'
import headless from '@sparticuz/chromium'
import {PGlite} from '@electric-sql/pglite'
import {createHash} from 'node:crypto'
import {serveFrame} from '../app/server/frame.mjs'
import {selectionRelay} from '../app/server/selection.mjs'
import {pipelineHttp,resource} from '../mcp/http.mjs'
import {pipeline} from '../app/server/store.mjs'
import {invoke,toolList} from '../mcp/tools.mjs'

test('the connected workspace uses the standalone layout, edits records, links the current view and toggles its rail',async t=>{
 const db=new PGlite()
 t.after(()=>db.close())
 await db.exec(await readFile('app/server/schema.sql','utf8'))
 const data={transaction:fn=>db.transaction(tx=>fn(async(s,p)=>(await tx.query(s,p)).rows))}
 const run=pipeline(data)
 const user={id:'owner',firstName:'Testing',email:'owner@example.invalid',accessDigest:'b'.repeat(64)}
 await db.exec(`CREATE TABLE users(id text primary key,email text,first_name text,last_name text,organization text);
 CREATE TABLE oauth_access_tokens(token_hash text,user_id text,resource text,scope text,revoked_at timestamptz,expires_at timestamptz);
 INSERT INTO users VALUES('owner','owner@example.invalid','Testing','','');`)
 await db.query("INSERT INTO oauth_access_tokens VALUES($1,'owner',$2,'mcp:tools',NULL,now()+interval '30 minutes')",[user.accessDigest,resource])
 const {workspace}=await run(user,{op:'home.ensure'},'consent')
 const server=(request,surface)=>run(user,request,surface==='workspace'?'ChatGPT workspace':'ChatGPT')
 const saved=await invoke('create_pipeline_view',{workspace,revision:0,request_id:crypto.randomUUID(),view:{title:'Committee review',query:{table:'Program'},renderer:'interactive',presentation:'<label>Committee <input id="committee" data-filter></label><p data-filter-value="Alpha">Alpha</p><p data-filter-value="Beta">Beta</p>'}},server)
 const id=saved._meta.pipeline.view.id
 const selection=selectionRelay({
   listen:async(channel,callback)=>({unlisten:await db.listen(channel,callback)}),
   publish:(channel,payload)=>db.query('SELECT pg_notify($1,$2)',[channel,payload])
 })
 const serve=pipelineHttp({authorize:async()=>user,run,selection,readWidget:()=>readFile('dist/pipeline-chatgpt.html','utf8')})
 async function assistant(name,args,session='this chat'){
   const response=await serve(new Request(resource,{method:'POST',headers:{authorization:'Bearer member','content-type':'application/json',accept:'application/json, text/event-stream'},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/call',params:{name,arguments:args,_meta:{'openai/session':session}}})}))
   const raw=await response.text();return JSON.parse(raw.startsWith('{')?raw:raw.split('\n').find(l=>l.startsWith('data: ')).slice(6)).result
 }
 const initial=await assistant('read_pipeline',{workspace,query:{table:'Program',fields:['name','status']}})
 assert.equal(initial.structuredContent.result.records[0].values.status,'In progress')
 const descriptor=toolList.find(tool=>tool.name==='read_pipeline')
 assert.ok(descriptor._meta.ui.resourceUri)
 assert.equal(descriptor._meta['openai/ui'].preferredModelDisplayMode,'fullscreen')
 assert.ok(initial.structuredContent.result.panel_instance)
 // Exercise hosts which deliver structuredContent without the optional private envelope.
 const {structuredContent}=initial
 const open={content:initial.content,structuredContent}
 const source=await build({stdin:{resolveDir:process.cwd(),contents:`
 import {AppBridge,PostMessageTransport} from '@modelcontextprotocol/ext-apps/app-bridge';
 const iframe=document.querySelector('iframe'),bridge=new AppBridge(null,{name:'test',version:'1'},{serverTools:{},openLinks:{},message:{text:{}}});
 bridge.oncalltool=p=>window.dispatch(p);bridge.onopenlink=p=>window.opened(p.url).then(()=>({}));
 bridge.onmessage=p=>window.sent(p).then(()=>({}));
 window.getSelectionFromApp=()=>bridge.callTool({name:'read_current_pipeline_view',arguments:{}});
 bridge.oninitialized=()=>bridge.sendToolResult(${JSON.stringify(open)});
 bridge.connect(new PostMessageTransport(iframe.contentWindow,iframe.contentWindow)).then(()=>iframe.src='/widget');`},bundle:true,write:false,format:'iife'})
 const browser=await chromium.launch({executablePath:await headless.executablePath(),args:headless.args.filter(arg=>arg!=='--disable-web-security')})
 t.after(()=>browser.close())
 const page=await browser.newPage({viewport:{width:1150,height:850}}),links=[],calls=[],errors=[]
 const messages=[]
 await page.exposeFunction('sent',p=>messages.push(p))
 page.on('pageerror',e=>errors.push(e.message))
 await page.exposeFunction('opened',u=>links.push(u))
 await page.exposeFunction('dispatch',async({name,arguments:args})=>{
   calls.push(name)
   return invoke(name,args,server)
 })
 await page.route('https://host.example/**',async route=>{
   const path=new URL(route.request().url()).pathname
   if(path==='/widget')return route.fulfill({contentType:'text/html',body:await readFile('dist/pipeline-chatgpt.html')})
   if(path==='/host.js')return route.fulfill({contentType:'application/javascript',body:source.outputFiles[0].text})
   return route.fulfill({contentType:'text/html',body:'<style>*{margin:0}iframe{width:100vw;height:100vh;border:none}</style><iframe></iframe><script src="/host.js"></script>'})
 })
 const standalone=await browser.newPage({viewport:{width:1150,height:850}})
 await standalone.route('https://pipeline.trialagents.com/**',async r=>{
   const path=new URL(r.request().url()).pathname
   if(path==='/api/pipeline')return r.fulfill({json:await run(user,r.request().postDataJSON())})
   if(path==='/trialagents-mark-white.png')return r.fulfill({path:'assets/mark-dark.png'})
   return r.fulfill({path:path==='/'?'dist/pipeline.html':'dist/pipeline.js',contentType:path==='/'?'text/html':'application/javascript'})
 })
 const requests=[],activeWaits=new Set()
 t.after(()=>{for(const c of activeWaits)c.abort()})
 await page.route('https://pipeline.trialagents.com/**',async r=>{
   const req=r.request(),path=new URL(req.url()).pathname
   if(path==='/api/pipeline/frame'){
     const headers=await req.allHeaders(),body=req.postData()
     requests.push({op:JSON.parse(body).op,headers})
     const controller=new AbortController();activeWaits.add(controller)
     const answer=await serveFrame(new Request(req.url(),{method:'POST',headers,body,signal:controller.signal}),{db:data,run,selection,audience:resource})
     activeWaits.delete(controller)
     return r.fulfill({status:answer.status,json:await answer.json()}).catch(()=>{})
   }
   const files={'/pipeline-embedded':'dist/pipeline-embedded.html','/pipeline-assets/pipeline-embedded.js':'dist/pipeline-embedded.js','/trialagents-mark-white.png':'assets/mark-dark.png'}
   if(files[path])return r.fulfill({path:files[path],contentType:path.endsWith('.js')?'application/javascript':path.endsWith('.png')?'image/png':'text/html'})
   return r.fulfill({status:404,body:''})
 })
 await page.route('https://pipeline.trialagents.com/pipeline-renderer',r=>r.fulfill({contentType:'text/html',path:'dist/pipeline-renderer.html'}))
 await Promise.all([standalone.goto('https://pipeline.trialagents.com/'),page.goto('https://host.example/')])
 const frame=page.frameLocator('iframe').frameLocator('iframe')
 await frame.getByRole('heading',{name:'Pipeline Overview'}).waitFor({timeout:7000}).catch(async error=>{
   throw Error(JSON.stringify({errors,calls,requests:requests.map(r=>[r.op,r.headers.origin]),frames:await Promise.all(page.frames().map(async f=>[f.url(),(await f.locator('body').innerText().catch(()=>'' )).slice(0,220)]))}),{cause:error})
 })
 await standalone.getByRole('heading',{name:'Pipeline Overview'}).waitFor()
 assert.deepEqual(calls,['connect_pipeline_frame'])
 assert.equal(requests[0].op,'bootstrap')
 for(const tab of ['Overview','Milestones','Timeline','Deliverables','Risks','Changes']){
   await frame.locator('[data-tab="'+tab+'"]').click()
   await standalone.locator('[data-tab="'+tab+'"]').click()
   assert.equal(await frame.locator('#app').innerText(),await standalone.locator('#app').innerText(),tab)
 }
 await frame.locator('[data-tab="Overview"]').click()
 await standalone.locator('[data-tab="Overview"]').click()
 for(const surface of [frame,standalone]){
   await surface.locator('[data-tab="Milestones"]').click()
   assert.equal(await surface.locator('.program-head h2').first().evaluate(e=>getComputedStyle(e).fontWeight),'700')
   assert.equal(await surface.locator('select[data-filter=program] option').last().evaluate(e=>getComputedStyle(e).fontWeight),'400')
   await surface.locator('[data-tab="Timeline"]').click()
   assert.equal(await surface.locator('.program-head h2').first().evaluate(e=>getComputedStyle(e).fontWeight),'700')
   await surface.locator('[data-tab="Settings"]').click()
   await surface.locator('[data-settings-section="Notifications"]').click()
   assert.equal(await surface.locator('.mail-pref strong').first().evaluate(e=>getComputedStyle(e).fontWeight),'400')
   assert.equal(await surface.locator('.mail-pref').count(),6)
   assert.equal(await surface.locator('.settings-page').evaluate(e=>Math.round(e.getBoundingClientRect().left)),await surface.locator('.title').evaluate(e=>Math.round(e.getBoundingClientRect().left)))
   await surface.locator('[data-tab="Overview"]').click()
 }
 assert.deepEqual(await frame.locator('#app').screenshot(),await standalone.locator('#app').screenshot())
 await frame.getByRole('button',{name:'Hide sidebar'}).click()
 await expect(frame.locator('#rail')).toBeHidden()
 await frame.getByRole('button',{name:'Show sidebar'}).press('Enter')
 await expect(frame.locator('#rail')).toBeVisible()
 assert.equal(await frame.locator('.example-label,[data-tab="Updates"],[data-add]').count(),0)
 await frame.getByRole('button',{name:'Delete example data'}).click()
 await frame.getByRole('button',{name:'Confirm',exact:true}).click()
 await frame.locator('[name="recordName"]').fill('UI parity test')
 await frame.locator('#editform [type=submit]').click()
 await frame.getByText('Saved',{exact:true}).waitFor()
 assert.equal((await run(user,{op:'bootstrap',workspace})).items.filter(r=>r.name==='UI parity test').length,1)
 for(const surface of [standalone,frame])await surface.locator('[data-tab="Milestones"]').click()
 const latestRevision=async()=>(await run(user,{op:'bootstrap',workspace})).revision
 const contextToken=initial.structuredContent.result.workspace_context
 const created=await assistant('create_pipeline_record',{workspace,workspace_context:contextToken,table:'Program',values:{name:'Live program'},revision:await latestRevision(),request_id:crypto.randomUUID()})
 assert.ok(!created.isError,JSON.stringify(created))
 for(const surface of [standalone,frame])await surface.getByRole('heading',{name:'Live program'}).waitFor({timeout:14000})
 assert.equal(created.structuredContent.result.workspace,workspace)
 const liveId=created.structuredContent.result.id
 await frame.locator('[data-edit="'+liveId+'"]').first().click()
 await frame.locator('[name="recordName"]').fill('My unsaved title')
 const renamed=await assistant('update_pipeline_record',{workspace,workspace_context:contextToken,table:'Program',id:liveId,values:{name:'Updated by chat'},revision:await latestRevision(),request_id:crypto.randomUUID()})
 assert.ok(!renamed.isError,JSON.stringify(renamed))
 await frame.locator('#error').getByText(/changed while you were editing/).waitFor({timeout:14000})
 await expect(frame.locator('[name="recordName"]')).toHaveValue('My unsaved title')
 await frame.locator('#editform [type=submit]').click()
 await expect(frame.locator('#editform')).toBeVisible()
 await frame.locator('#editform .cancel').click()
 await standalone.getByRole('heading',{name:'Updated by chat'}).waitFor({timeout:14000})
 const deleted=await assistant('delete_pipeline_record',{workspace,workspace_context:contextToken,table:'Program',id:liveId,revision:await latestRevision(),request_id:crypto.randomUUID()})
 assert.ok(!deleted.isError,JSON.stringify(deleted))
 for(const surface of [standalone,frame])await surface.getByRole('heading',{name:'Updated by chat'}).waitFor({state:'hidden',timeout:14000})
 await frame.locator('[data-tab="Custom views"]').click()
 await frame.locator('[data-view="'+id+'"]').click()
 assert.equal(await frame.getByRole('button',{name:'Share current view'}).count(),0)
 assert.equal(messages.length,0)
 await frame.getByRole('button',{name:'Ask ChatGPT to create a custom view'}).click()
 await expect.poll(()=>messages.length).toBe(1)
 assert.match(messages[0].content[0].text,/create and save a new custom view/)
 const ask={workspace,workspace_context:initial.structuredContent.result.workspace_context,instance:initial.structuredContent.result.panel_instance}
 assert.equal(requests.filter(r=>r.op==='selection.answer').length,0)
 const other=await assistant('read_pipeline',{workspace},'other chat')
 assert.equal((await assistant('read_active_pipeline_selection',{...ask,workspace_context:other.structuredContent.result.workspace_context},'other chat')).isError,true)
 const pulled=await assistant('read_active_pipeline_selection',ask)
 assert.equal(pulled.structuredContent?.result.view.id,id,JSON.stringify(pulled))
 assert.equal(messages.length,1)
 const context=await page.evaluate(()=>window.getSelectionFromApp())
 assert.equal(JSON.parse(context.content[0].text).view.id,id)
 const inside=frame.frameLocator('#view-plot iframe')
 await inside.locator('#committee').fill('Beta')
 await inside.locator('p').filter({hasText:'Alpha'}).waitFor({state:'hidden'})
 await frame.getByRole('button',{name:'Open TrialAgents app'}).click()
 await expect.poll(()=>links.at(-1)).toBe('https://pipeline.trialagents.com/?workspace='+workspace+'&view='+id)
 assert.equal(requests.filter(r=>r.op==='assistant.state').length,0)
 await frame.getByRole('button',{name:'Save control values'}).click()
 await frame.getByText('Control values saved.').waitFor()
 assert.equal((await run(user,{op:'assistant.view',workspace,input:{id,content:true}})).state.committee,'Beta')
 // Another client advances the workspace revision after the visible list and controls were saved.
 const latest=await run(user,{workspace,op:'bootstrap'})
 await run(user,{workspace,op:'items.save',input:{upsert:[{...latest.items[0],name:'UI parity test'}]},revision:latest.revision,requestId:crypto.randomUUID()})
 await frame.locator('[data-delete-view="'+id+'"]').click()
 await frame.getByRole('button',{name:'Confirm',exact:true}).click()
 await frame.getByText('View removed.',{exact:true}).waitFor()
 assert.equal(await frame.locator('[data-view="'+id+'"]').count(),0)
 await standalone.locator('[data-tab="Custom views"]').click()
 await expect(standalone.getByText('No saved views yet.',{exact:false}).or(standalone.getByText('Ask ChatGPT or Claude to create your first custom view.'))).toBeVisible({timeout:12000})
 assert.equal((await run(user,{op:'bootstrap',workspace})).views.length,0)
 await page.setViewportSize({width:390,height:810});await page.reload()
 await frame.getByRole('heading',{name:'Pipeline Overview'}).waitFor()
 await expect(frame.locator('#rail')).toBeVisible()
 await frame.getByRole('button',{name:'Hide sidebar'}).press('Space')
 await expect(frame.locator('#rail')).toBeHidden()
 await frame.getByRole('button',{name:'Show sidebar'}).press('Space')
 await frame.locator('[data-tab="Timeline"]').click()
 await frame.locator('.program-head').filter({hasText:'UI parity test'}).waitFor()
 const captured=requests.at(-1).headers
 const probe=async(req,headers=captured)=>serveFrame(new Request('https://pipeline.trialagents.com/api/pipeline/frame',{method:'POST',headers,body:JSON.stringify(req)}),{db:data,run,audience:resource})
 assert.equal((await probe({workspace,op:'billing.checkout'})).status,403)
 assert.equal((await probe({workspace:crypto.randomUUID(),op:'bootstrap'})).status,403)
 assert.equal((await probe({workspace,op:'bootstrap'},{...captured,origin:'https://elsewhere.example'})).status,403)
 await db.exec('UPDATE oauth_access_tokens SET revoked_at=now()')
 assert.equal((await probe({workspace,op:'bootstrap'})).status,401)
 for(const c of activeWaits)c.abort()
 assert.deepEqual(errors,[])
})

test('workspace actions are app-only, keep private data out of chat and enforce membership',async t=>{
 const db=new PGlite();t.after(()=>db.close())
 await db.exec(await readFile('app/server/schema.sql','utf8'))
 const run=pipeline({transaction:fn=>db.transaction(tx=>fn(async(s,p)=>(await tx.query(s,p)).rows))})
 const user={id:'owner',email:'owner@example.invalid'}
 const {workspace}=await run(user,{op:'home.ensure'},'consent')
 const server=u=>(request,surface)=>run(u,request,surface==='workspace'?'ChatGPT workspace':'ChatGPT')
 const challenge=createHash('sha256').update('test-only random frame value').digest('hex')
 const args={workspace,challenge}
 assert.deepEqual(toolList.find(t=>t.name==='connect_pipeline_frame')._meta.ui.visibility,['app'])
 const response=await invoke('connect_pipeline_frame',args,server({...user,accessDigest:'c'.repeat(64)}))
 assert.deepEqual(response,{content:[],structuredContent:{result:{workspace}}})
 assert.equal((await invoke('connect_pipeline_frame',args,server({id:'stranger',email:'other@example.invalid',accessDigest:'d'.repeat(64)}))).isError,true)
 await assert.rejects(()=>run(user,{op:'bootstrap',workspace},'ChatGPT'))
})

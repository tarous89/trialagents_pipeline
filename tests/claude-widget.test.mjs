import test from 'node:test'
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {build} from 'esbuild'
import {chromium,expect} from '@playwright/test'
import headless from '@sparticuz/chromium'
import {PGlite} from '@electric-sql/pglite'
import {selectionRelay} from '../app/server/selection.mjs'
import {pipelineHttp,claudeResource} from '../mcp/http.mjs'
import {pipeline} from '../app/server/store.mjs'

const read=f=>readFile('dist/'+f,'utf8')

test('the Claude view bundles the workspace with Claude wording and the ChatGPT build keeps its frame',async()=>{
 const [claude,chatgptHost,chatgptEmbedded]=await Promise.all(['pipeline-claude.html','pipeline-chatgpt.html','pipeline-embedded.js'].map(read))
 for(const phrase of ['Ask Claude to create a custom view','Ask Claude to create your first custom view.','Copy message to Claude','pipeline_workspace_request'])assert.ok(claude.includes(phrase),phrase)
 for(const phrase of ['Ask ChatGPT to create a custom view','Ask ChatGPT to create your first custom view.','Copy message to ChatGPT']){
   assert.ok(!claude.includes(phrase),phrase)
   assert.ok(chatgptEmbedded.includes(phrase),phrase)
 }
 // Nothing in the view loads from or frames the app origin; links still open it.
 for(const blocked of ['/pipeline-embedded','/api/pipeline','/pipeline-assets/','src="/trialagents-mark'])assert.ok(!claude.includes(blocked),blocked)
 assert.ok(chatgptHost.includes('/pipeline-embedded'))
})

test('Claude shows the same workspace inside its own view, edits through the app-only tool and follows chat changes',async t=>{
 const db=new PGlite()
 t.after(()=>db.close())
 await db.exec(await readFile('app/server/schema.sql','utf8'))
 const run=pipeline({transaction:fn=>db.transaction(tx=>fn(async(s,p)=>(await tx.query(s,p)).rows))})
 const user={id:'owner',firstName:'Testing',email:'owner@example.invalid'}
 const {workspace}=await run(user,{op:'home.ensure'},'consent')
 const sources=[]
 const selection=selectionRelay({
   listen:async(channel,callback)=>({unlisten:await db.listen(channel,callback)}),
   publish:(channel,payload)=>db.query('SELECT pg_notify($1,$2)',[channel,payload])
 })
 const serve=pipelineHttp({audience:claudeResource,authorize:async()=>user,selection,run:(u,r,source)=>{sources.push(source);return run(u,r,source)},readWidget:()=>read('pipeline-claude.html')})
 async function mcp(method,params){
   const response=await serve(new Request(claudeResource,{method:'POST',headers:{authorization:'Bearer member','content-type':'application/json',accept:'application/json, text/event-stream'},body:JSON.stringify({jsonrpc:'2.0',id:1,method,params})}))
   const raw=await response.text(),json=JSON.parse(raw.startsWith('{')?raw:raw.split('\n').find(l=>l.startsWith('data: ')).slice(6))
   assert.ifError(json.error);return json.result
 }
 const assistant=(name,args)=>mcp('tools/call',{name,arguments:args})
 const {tools}=await mcp('tools/list',{})
 const appTool=tools.find(tool=>tool.name==='pipeline_workspace_request')
 assert.deepEqual(appTool._meta.ui.visibility,['app'])
 const uri=tools.find(tool=>tool.name==='read_pipeline')._meta.ui.resourceUri
 assert.equal(uri,'ui://trialagents-pipeline/claude-workspace-v1.html')
 const {contents:[resource]}=await mcp('resources/read',{uri})
 assert.equal(resource.text,await read('pipeline-claude.html'))
 assert.equal(resource._meta.ui.csp.frameDomains,undefined)
 // The app-only tool keeps the frame endpoint's scope.
 const denied=async request=>(await assistant('pipeline_workspace_request',{request})).isError
 assert.ok(await denied({op:'billing.checkout',workspace}))
 assert.ok(await denied({op:'bootstrap',workspace:crypto.randomUUID()}))
 assert.ok(await denied({op:'workspace.events',workspace}))
 assert.ok(await denied({op:'frame.connect',workspace}))

 const view=await assistant('change_pipeline_app',{action:'create_view',workspace,revision:(await run(user,{op:'bootstrap',workspace})).revision,request_id:crypto.randomUUID(),view:{title:'Committee review',query:{table:'Program'},renderer:'interactive',presentation:'<label>Committee <input id="committee" data-filter></label><p data-filter-value="Alpha">Alpha</p><p data-filter-value="Beta">Beta</p>'}})
 assert.ok(!view.isError,JSON.stringify(view.content))
 const id=view.structuredContent.result.view.id
 const initial=await assistant('read_pipeline',{workspace,query:{table:'Program',fields:['name','status']}})
 assert.ok(!initial.isError,JSON.stringify(initial.content))
 const open={content:initial.content,structuredContent:initial.structuredContent}

 const host=await build({stdin:{resolveDir:process.cwd(),contents:`
 import {AppBridge,PostMessageTransport} from '@modelcontextprotocol/ext-apps/app-bridge';
 const iframe=document.querySelector('iframe'),bridge=new AppBridge(null,{name:'test',version:'1'},{serverTools:{},openLinks:{},message:{text:{}}});
 bridge.oncalltool=p=>window.dispatch(p);bridge.onopenlink=p=>window.opened(p.url).then(()=>({}));
 bridge.onmessage=p=>window.sent(p).then(()=>({}));
 window.getSelectionFromApp=()=>bridge.callTool({name:'read_current_pipeline_view',arguments:{}});
 bridge.oninitialized=()=>bridge.sendToolResult(${JSON.stringify(open)});
 bridge.connect(new PostMessageTransport(iframe.contentWindow,iframe.contentWindow)).then(()=>iframe.src='/widget');`},bundle:true,write:false,format:'iife'})
 const browser=await chromium.launch({executablePath:await headless.executablePath(),args:headless.args.filter(arg=>arg!=='--disable-web-security')})
 t.after(()=>browser.close())
 const page=await browser.newPage({viewport:{width:1150,height:850}}),links=[],calls=[],messages=[],errors=[],appOrigin=[]
 page.on('pageerror',e=>errors.push(e.message))
 const logs=[];page.on('console',m=>logs.push(m.text().slice(0,200)))
 await page.exposeFunction('sent',p=>messages.push(p))
 await page.exposeFunction('opened',u=>links.push(u))
 await page.exposeFunction('dispatch',async p=>{calls.push(p.arguments?.request?.op??p.name);return assistant(p.name,p.arguments)})
 // Claude's sandbox: no external origins, blob: and data: frames only.
 const csp="default-src 'none'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'none'; frame-src blob: data:"
 await page.route('https://host.example/**',async route=>{
   const path=new URL(route.request().url()).pathname
   if(path==='/widget')return route.fulfill({contentType:'text/html',headers:{'Content-Security-Policy':csp},body:resource.text})
   if(path==='/host.js')return route.fulfill({contentType:'application/javascript',body:host.outputFiles[0].text})
   return route.fulfill({contentType:'text/html',body:'<style>*{margin:0}iframe{width:100vw;height:100vh;border:none}</style><iframe></iframe><script src="/host.js"></script>'})
 })
 await page.route('https://pipeline.trialagents.com/**',r=>{appOrigin.push(r.request().url());return r.fulfill({status:404,body:''})})
 const standalone=await browser.newPage({viewport:{width:1150,height:850}})
 await standalone.route('https://pipeline.trialagents.com/**',async r=>{
   const path=new URL(r.request().url()).pathname
   if(path==='/api/pipeline'&&r.request().postDataJSON().op==='workspace.events')return r.fulfill({status:503,body:'Stream offline'})
   if(path==='/api/pipeline')return r.fulfill({json:await run(user,r.request().postDataJSON())})
   if(path==='/trialagents-mark-white.png')return r.fulfill({path:'assets/mark-dark.png'})
   return r.fulfill({path:path==='/'?'dist/pipeline.html':'dist/pipeline.js',contentType:path==='/'?'text/html':'application/javascript'})
 })
 await Promise.all([standalone.goto('https://pipeline.trialagents.com/'),page.goto('https://host.example/')])
 const frame=page.frameLocator('iframe')
 await frame.getByRole('heading',{name:'Pipeline Overview'}).waitFor({timeout:7000}).catch(async error=>{throw Error(JSON.stringify({errors,calls,appOrigin,console:logs,frames:await Promise.all(page.frames().map(async f=>[f.url().slice(0,60),(await f.locator('body').innerText().catch(()=>'')).slice(0,300)]))}),{cause:error})})
 await standalone.getByRole('heading',{name:'Pipeline Overview'}).waitFor()
 assert.equal(calls[0],'bootstrap')
 for(const tab of ['Overview','Milestones','Timeline','Deliverables','Risks','Changes']){
   await frame.locator('[data-tab="'+tab+'"]').click()
   await standalone.locator('[data-tab="'+tab+'"]').click()
   assert.equal(await frame.locator('#app').innerText(),await standalone.locator('#app').innerText(),tab)
 }
 await frame.locator('[data-tab="Overview"]').click()
 await standalone.locator('[data-tab="Overview"]').click()
 assert.deepEqual(await frame.locator('#app').screenshot(),await standalone.locator('#app').screenshot())
 if(process.env.PIPELINE_SCREENSHOT)await page.screenshot({path:process.env.PIPELINE_SCREENSHOT})
 await frame.getByRole('button',{name:'Delete example data'}).click()
 await frame.getByRole('button',{name:'Confirm',exact:true}).click()
 await frame.locator('[name="recordName"]').fill('Claude parity test')
 await frame.locator('#editform [type=submit]').click()
 await frame.getByText('Saved',{exact:true}).waitFor()
 assert.equal((await run(user,{op:'bootstrap',workspace})).items.filter(r=>r.name==='Claude parity test').length,1)
 assert.ok(sources.includes('Claude workspace'))
 // A record added from chat appears through revision checks.
 await frame.locator('[data-tab="Milestones"]').click()
 const created=await assistant('edit_pipeline_records',{action:'create',workspace,workspace_context:initial.structuredContent.result.workspace_context,table:'Program',values:{name:'Live program'},revision:(await run(user,{op:'bootstrap',workspace})).revision,request_id:crypto.randomUUID()})
 assert.ok(!created.isError,JSON.stringify(created.content))
 await frame.getByRole('heading',{name:'Live program'}).waitFor({timeout:14000})
 // Saved views render in the bundled renderer.
 await frame.locator('[data-tab="Custom views"]').click()
 await frame.locator('[data-view="'+id+'"]').click()
 const inside=frame.frameLocator('#view-plot iframe')
 await inside.locator('#committee').fill('Beta')
 await inside.locator('p').filter({hasText:'Alpha'}).waitFor({state:'hidden'})
 await frame.getByRole('button',{name:'Save control values'}).click()
 await frame.getByText('Control values saved.').waitFor()
 assert.equal((await run(user,{op:'assistant.view',workspace,input:{id,content:true}})).state.committee,'Beta')
 await frame.getByRole('button',{name:'Ask Claude to create a custom view'}).click()
 await expect.poll(()=>messages.length).toBe(1)
 assert.match(messages[0].content[0].text,/create and save a new custom view/)
 // Claude can read the open selection, through the server tool or the view's own tool.
 const pulled=await assistant('read_active_pipeline_selection',{workspace,workspace_context:initial.structuredContent.result.workspace_context,instance:initial.structuredContent.result.panel_instance})
 assert.equal(pulled.structuredContent?.result.view.id,id,JSON.stringify(pulled))
 assert.equal(JSON.parse((await page.evaluate(()=>window.getSelectionFromApp())).content[0].text).view.id,id)
 await frame.getByRole('button',{name:'Open TrialAgents app'}).click()
 await expect.poll(()=>links.at(-1)).toBe('https://pipeline.trialagents.com/?workspace='+workspace+'&view='+id)
 assert.ok(!calls.includes('workspace.events'))
 assert.deepEqual(appOrigin,[])
 assert.deepEqual(errors,[])
})

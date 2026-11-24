import test from 'node:test'
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {build} from 'esbuild'
import {chromium,expect} from '@playwright/test'
import headless from '@sparticuz/chromium'
import {PGlite} from '@electric-sql/pglite'
import {createHash} from 'node:crypto'
import {serveFrame} from '../app/server/frame.mjs'
import {resource} from '../mcp/http.mjs'
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
 const open=await invoke('open_pipeline',{workspace},server)
 const source=await build({stdin:{resolveDir:process.cwd(),contents:`
 import {AppBridge,PostMessageTransport} from '@modelcontextprotocol/ext-apps/app-bridge';
 const iframe=document.querySelector('iframe'),bridge=new AppBridge(null,{name:'test',version:'1'},{serverTools:{},openLinks:{}});
 bridge.oncalltool=p=>window.dispatch(p);bridge.onopenlink=p=>window.opened(p.url).then(()=>({}));
 bridge.oninitialized=()=>bridge.sendToolResult(${JSON.stringify(open)});
 bridge.connect(new PostMessageTransport(iframe.contentWindow,iframe.contentWindow)).then(()=>iframe.src='/widget');`},bundle:true,write:false,format:'iife'})
 const browser=await chromium.launch({executablePath:await headless.executablePath(),args:headless.args.filter(arg=>arg!=='--disable-web-security')})
 t.after(()=>browser.close())
 const page=await browser.newPage({viewport:{width:1150,height:850}}),links=[],calls=[],errors=[]
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
 const requests=[]
 await page.route('https://pipeline.trialagents.com/**',async r=>{
   const req=r.request(),path=new URL(req.url()).pathname
   if(path==='/api/pipeline/frame'){
     const headers=await req.allHeaders(),body=req.postData()
     requests.push({op:JSON.parse(body).op,headers})
     const answer=await serveFrame(new Request(req.url(),{method:'POST',headers,body}),{db:data,run,audience:resource})
     return r.fulfill({status:answer.status,json:await answer.json()})
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
 for(const tab of ['Overview','Milestones','Timeline','Deliverables','Risks','Changes','Updates','Custom views']){
   await frame.locator('[data-tab="'+tab+'"]').click()
   await standalone.locator('[data-tab="'+tab+'"]').click()
   assert.equal(await frame.locator('#app').innerText(),await standalone.locator('#app').innerText(),tab)
 }
 await frame.locator('[data-tab="Overview"]').click()
 await standalone.locator('[data-tab="Overview"]').click()
 assert.deepEqual(await frame.locator('#app').screenshot(),await standalone.locator('#app').screenshot())
 await frame.getByRole('button',{name:'Hide sidebar'}).click()
 await expect(frame.locator('#rail')).toBeHidden()
 await frame.getByRole('button',{name:'Show sidebar'}).press('Enter')
 await expect(frame.locator('#rail')).toBeVisible()
 await frame.locator('[data-add]').click()
 await frame.locator('[data-new="Program"]').click()
 await frame.locator('[name="recordName"]').fill('UI parity test')
 await frame.locator('#editform [type=submit]').click()
 await frame.getByText('Saved',{exact:true}).waitFor()
 assert.equal((await run(user,{op:'bootstrap',workspace})).items.filter(r=>r.name==='UI parity test').length,1)
 await frame.locator('[data-tab="Custom views"]').click()
 await frame.locator('[data-view="'+id+'"]').click()
 const inside=frame.frameLocator('#view-plot iframe')
 await inside.locator('#committee').fill('Beta')
 await inside.locator('p').filter({hasText:'Alpha'}).waitFor({state:'hidden'})
 await frame.getByRole('button',{name:'Open TrialAgents app'}).click()
 await expect.poll(()=>links.at(-1)).toBe('https://pipeline.trialagents.com/?workspace='+workspace+'&view='+id)
 assert.equal(requests.filter(r=>r.op==='assistant.state').length,0)
 await frame.getByRole('button',{name:'Save control values'}).click()
 await frame.getByText('Control values saved.').waitFor()
 assert.equal((await run(user,{op:'assistant.view',workspace,input:{id,content:true}})).state.committee,'Beta')
 await page.setViewportSize({width:390,height:810});await page.reload()
 await frame.getByRole('heading',{name:'Pipeline Overview'}).waitFor()
 await expect(frame.locator('#rail')).toBeHidden()
 const toggle=frame.getByRole('button',{name:'Show sidebar'})
 await toggle.press('Space')
 await frame.locator('[data-tab="Timeline"]').click()
 await frame.locator('.program-head').filter({hasText:'UI parity test'}).waitFor()
 const captured=requests.at(-1).headers
 const probe=async(req,headers=captured)=>serveFrame(new Request('https://pipeline.trialagents.com/api/pipeline/frame',{method:'POST',headers,body:JSON.stringify(req)}),{db:data,run,audience:resource})
 assert.equal((await probe({workspace,op:'billing.checkout'})).status,403)
 assert.equal((await probe({workspace:crypto.randomUUID(),op:'bootstrap'})).status,403)
 assert.equal((await probe({workspace,op:'bootstrap'},{...captured,origin:'https://elsewhere.example'})).status,403)
 await db.exec('UPDATE oauth_access_tokens SET revoked_at=now()')
 assert.equal((await probe({workspace,op:'bootstrap'})).status,401)
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

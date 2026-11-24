import test from 'node:test'
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {createServer} from 'node:http'
import {Readable} from 'node:stream'
import {json} from 'node:stream/consumers'
import {PGlite} from '@electric-sql/pglite'
import {chromium,expect} from '@playwright/test'
import headless from '@sparticuz/chromium'
import {workspaceEvents} from '../app/server/events.mjs'
import {pipeline} from '../app/server/store.mjs'

test('a commit reaches an open browser over SSE and a restored stream catches up',async t=>{
 const pg=new PGlite()
 await pg.exec(await readFile('app/server/schema.sql','utf8'))
 const run=pipeline({transaction:fn=>pg.transaction(tx=>fn(async(s,p)=>(await tx.query(s,p)).rows))})
 const user={id:'sse-owner',email:'owner@example.invalid'}
 const {workspace}=await run(user,{op:'bootstrap'})
 const listeners=new Set(),checks=[],streams=[]
 let offline=false
 const listen=async(channel,onchange)=>{
   const off=await pg.listen(channel,onchange);listeners.add(off)
   return {unlisten:async()=>{listeners.delete(off);await off()}}
 }
 const server=createServer(async(req,res)=>{
   try{
     if(req.url==='/api/pipeline'){
       const request=await json(req)
       if(request.op==='workspace.events'){
         if(offline){res.writeHead(503).end();return}
         const c=new AbortController();streams.push(c);res.on('close',()=>c.abort())
         const stream=await workspaceEvents(workspace,c.signal,listen,()=>run(user,{op:'workspace.access',workspace}))
         res.writeHead(stream.status,Object.fromEntries(stream.headers))
         Readable.fromWeb(stream.body).pipe(res);return
       }
       checks.push(request)
       res.setHeader('content-type','application/json');res.end(JSON.stringify(await run(user,request)));return
     }
     const path=req.url==='/'?'pipeline.html':req.url==='/pipeline-assets/pipeline.js'?'pipeline.js':null
     if(!path){res.writeHead(404).end();return}
     res.setHeader('content-type',path.endsWith('js')?'application/javascript':'text/html')
     res.end(await readFile('dist/'+path))
   }catch(error){res.writeHead(error.status||500).end(JSON.stringify({error:error.message}))}
 })
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve))
 const browser=await chromium.launch({executablePath:await headless.executablePath(),args:headless.args})
 t.after(async()=>{await browser.close();for(const c of streams)c.abort();server.closeAllConnections();await new Promise(r=>server.close(r));await pg.close()})
 const page=await browser.newPage()
 await page.goto('http://127.0.0.1:'+server.address().port,{waitUntil:'domcontentloaded'})
 await expect.poll(()=>listeners.size).toBe(1).catch(async error=>{throw Error(JSON.stringify({text:(await page.locator("body").innerText()).slice(0,300),checks:checks.map(r=>r.op)}),{cause:error})})
 await expect.poll(()=>checks.filter(r=>r.input?.knownRevision!=null).length).toBeGreaterThan(0)
 const create=async name=>{
   const {revision}=await run(user,{op:'bootstrap',workspace})
   await run(user,{op:'assistant.row.create',workspace,revision,requestId:crypto.randomUUID(),input:{table:'Program',values:{name}}},'ChatGPT')
 }
 await create('Pushed program')
 await expect(page.getByRole('button',{name:'Pushed program',exact:true})).toBeVisible({timeout:3000})
 const count=checks.length
 await page.waitForTimeout(5500)
 assert.equal(checks.length,count,'healthy stream suppresses idle polling')
 offline=true;streams.at(-1).abort()
 await create('Created while offline')
 await expect(page.getByRole('button',{name:'Created while offline',exact:true})).toBeVisible({timeout:12000})
 offline=false
 await expect.poll(()=>listeners.size,{timeout:15000}).toBe(1)
 await create('After reconnect')
 await expect(page.getByRole('button',{name:'After reconnect',exact:true})).toBeVisible({timeout:3000})
})

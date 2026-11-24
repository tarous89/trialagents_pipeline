import test from 'node:test'
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {chromium} from '@playwright/test'
import headless from '@sparticuz/chromium'
import {PGlite} from '@electric-sql/pglite'
import {pipeline} from '../app/server/store.mjs'
test('Chromium opens real PostgreSQL-backed workspace, saves and restores a program and custom view',async()=>{
 const db=new PGlite();await db.exec(await readFile('app/server/schema.sql','utf8'))
 const run=pipeline({transaction:fn=>db.transaction(tx=>fn(async(s,p)=>(await tx.query(s,p)).rows))})
 const user={id:'owner',email:'alex@example.com',firstName:'Alex',lastName:'Example'}
 const browser=await chromium.launch({executablePath:await headless.executablePath(),args:headless.args})
 try{
 const page=await browser.newPage({viewport:{width:1366,height:900}}),errors=[]
 page.on('pageerror',e=>errors.push(e.message));await page.route('https://pipeline.trialagents.com/**',async route=>{
   const req=route.request(),url=new URL(req.url())
   if(url.pathname==='/api/pipeline'){
    try{return await route.fulfill({json:await run(user,req.postDataJSON())})}catch(e){return route.fulfill({status:e.status||500,json:{error:e.message}})}
   }
   if(url.pathname==='/pipeline-renderer')return route.fulfill({contentType:'text/html',body:await readFile('dist/pipeline-renderer.html')})
   if(url.pathname==='/')return route.fulfill({contentType:'text/html',body:await readFile('dist/pipeline.html')})
   if(url.pathname==='/pipeline-assets/pipeline.js')return route.fulfill({contentType:'application/javascript',body:await readFile('dist/pipeline.js')})
   return route.fulfill({status:404,body:''})
 })
 await page.goto('https://pipeline.trialagents.com/')
 await page.locator('[data-add]').click();await page.locator('[data-new="Program"]').click()
 await page.locator('[name="recordName"]').fill('NT-101 · Lung cancer');await page.locator('#editform [type=submit]').click()
 await page.getByText('Saved',{exact:true}).waitFor();await page.reload()
 await page.locator('.plan-name').filter({hasText:'NT-101'}).first().waitFor()
 const snap=await run(user,{op:'bootstrap'})
 const shared=await run(user,{op:'assistant.view.create',workspace:snap.workspace,revision:snap.revision,requestId:crypto.randomUUID(),input:{title:'Protocol readiness',renderer:'interactive',presentation:'<input id="milestone" data-filter><p data-filter-value="Reviewed">Reviewed</p>',query:{table:'Milestone',fields:['name']}}},'ChatGPT')
 await page.goto(shared.url)
 const field=page.frameLocator('#view-plot iframe').locator('#milestone');await field.fill('Reviewed')
 await page.getByRole('button',{name:'Save control values'}).click();await page.getByText('Control values saved.',{exact:true}).waitFor()
 const detail=await run(user,{workspace:snap.workspace,op:'assistant.view',input:{id:shared.id,content:true}},'ChatGPT')
 assert.equal(detail.version,2);assert.equal(detail.state.milestone,'Reviewed')
 await page.locator('[data-tab="Settings"]').click();await page.locator('[data-settings-section="Logs"]').click()
 await page.getByText('record.created',{exact:true}).waitFor()
 await page.setViewportSize({width:390,height:844});await page.locator('[data-tab="Timeline"]').click();await page.locator('.program-head').filter({hasText:'NT-101'}).waitFor()
 assert.deepEqual(errors,[])
 }finally{await browser.close();await db.close()}
})

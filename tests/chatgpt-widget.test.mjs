import test from 'node:test'
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {build} from 'esbuild'
import {chromium,expect} from '@playwright/test'
import headless from '@sparticuz/chromium'

test('the ChatGPT widget paints the first result without fetching, opens the same web view, and explicitly saves isolated controls',async()=>{
 const url='https://pipeline.trialagents.com/?workspace=w&view=v',calls=[],links=[]
 const base={workspace:'w',role:'owner',title:'My workspace',revision:3,accent:'#14644e',tabs:[],canInvite:false,tab:'Overview',url:'https://pipeline.trialagents.com/?workspace=w',data:{table:'Program',fields:['name'],records:[{id:'p',table:'Program',values:{name:'EX-101'}}]}}
 const script=(await build({stdin:{resolveDir:process.cwd(),contents:`
 import {AppBridge,PostMessageTransport} from '@modelcontextprotocol/ext-apps/app-bridge';
 const iframe=document.querySelector('iframe'),bridge=new AppBridge(null,{name:'test',version:'1'},{serverTools:{},openLinks:{}});
 bridge.oncalltool=p=>window.dispatch(p);bridge.onopenlink=p=>window.opened(p.url).then(()=>({}));
 bridge.oninitialized=()=>bridge.sendToolResult({content:[],_meta:{pipeline:${JSON.stringify(base)}}});
 bridge.connect(new PostMessageTransport(iframe.contentWindow,iframe.contentWindow)).then(()=>iframe.src='/widget');`},bundle:true,write:false,format:'iife'})).outputFiles[0].text
 const browser=await chromium.launch({executablePath:await headless.executablePath(),args:headless.args})
 try{
  const page=await browser.newPage({viewport:{width:480,height:800}})
  await page.exposeFunction('opened',u=>links.push(u))
  await page.exposeFunction('dispatch',({name,arguments:a})=>{
   calls.push([name,a]);let data
   if(name==='open_pipeline'&&a.view)data={...base,tab:'Custom views',url,view:{id:'v',version:2,available:true,title:'Committee review',renderer:'interactive',state:{committee:'Alpha'},presentation:'<label>Committee <input id="committee" data-filter></label><p data-filter-value="Alpha">Alpha</p><p data-filter-value="Beta">Beta</p>'}}
   else if(name==='open_pipeline')data={...base,tab:'Custom views',data:undefined,views:[{id:'v',title:'Committee review'}]}
   else if(name==='save_pipeline_controls')data={revision:4,version:3}
   else throw Error('Unexpected tool '+name)
   return {content:[],structuredContent:{result:data},_meta:{pipeline:data}}
  })
  await page.route('https://host.example/**',async route=>{
   const path=new URL(route.request().url()).pathname
   if(path==='/widget')return route.fulfill({contentType:'text/html',body:await readFile('dist/pipeline-chatgpt.html')})
   if(path==='/host.js')return route.fulfill({contentType:'application/javascript',body:script})
   return route.fulfill({contentType:'text/html',body:'<iframe style="width:100%;height:700px"></iframe><script src="/host.js"></script>'})
  })
  await page.route('https://pipeline.trialagents.com/pipeline-renderer',r=>r.fulfill({contentType:'text/html',path:'dist/pipeline-renderer.html'}))
  await page.goto('https://host.example/')
  const frame=page.frameLocator('iframe');await frame.getByRole('button',{name:'EX-101'}).waitFor()
  assert.equal(calls.length,0)
  await frame.getByRole('button',{name:'Invite teammate'}).click();await frame.getByText('Invitations are unavailable in this workspace.').waitFor()
  assert.equal(calls.length,0)
  await frame.getByRole('button',{name:'Custom views'}).click();await frame.getByRole('button',{name:'Committee review'}).click()
  const inside=frame.frameLocator('iframe');const field=inside.locator('#committee')
  await field.waitFor();await page.waitForFunction(()=>document.readyState==='complete')
  await frame.getByRole('button',{name:'Open TrialAgents app'}).click()
  await expect.poll(()=>links[0]).toBe(url)
  await field.fill('Beta');await inside.locator('p').filter({hasText:'Alpha'}).waitFor({state:'hidden',timeout:4000})
  assert.equal(calls.filter(([n])=>n==='save_pipeline_controls').length,0)
  await frame.getByRole('button',{name:'Save control values'}).click();await frame.getByText('Control values saved.').waitFor()
  assert.deepEqual(calls.at(-1)[1].state,{committee:'Beta'})
  assert.equal(await frame.locator('iframe').getAttribute('sandbox'),'allow-scripts')
 }finally{await browser.close()}
})

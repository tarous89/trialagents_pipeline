// The browser pages embed Inter, and the policy the shared web service sends with them lets it load.
import {test} from 'node:test'
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {chromium} from '@playwright/test'
import headless from '@sparticuz/chromium'

test('Inter loads on the browser pages under their production Content-Security-Policy',async t=>{
  const browser=await chromium.launch({executablePath:await headless.executablePath(),args:headless.args.filter(arg=>arg!=='--disable-web-security')})
  t.after(()=>browser.close())
  const p=await browser.newPage()
  for(const [route,page] of [['pipeline-app','pipeline.html'],['pipeline-embedded','pipeline-embedded.html']]){
    const csp=(await readFile('integration/shared-web/app/'+route+'/route.ts','utf8')).match(/'Content-Security-Policy':"([^"]+)"/)[1]
    assert.match(csp,/font-src 'self' data:/,route)
    const html=(await readFile('dist/'+page,'utf8')).replace(/<script[^>]*src=[^>]*><\/script>/g,'')
    await p.unrouteAll()
    await p.route('https://pipeline.trialagents.com/**',r=>r.fulfill({contentType:'text/html',headers:{'Content-Security-Policy':csp},body:html}))
    await p.goto('https://pipeline.trialagents.com/'+page)
    const status=await p.evaluate(async()=>{await document.fonts.load('500 14px Inter');return [...document.fonts].filter(f=>f.family==='Inter').map(f=>f.status)})
    assert.deepEqual(status,['loaded'],page)
  }
})

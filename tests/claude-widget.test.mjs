import test from 'node:test'
import assert from 'node:assert/strict'
import {createHash} from 'node:crypto'
import {readFile} from 'node:fs/promises'

const read=f=>readFile('dist/'+f,'utf8')

test('Claude widget and embedded workspace use Claude wording and leave the ChatGPT build unchanged',async()=>{
 const [claudeHost,chatgptHost,claudeEmbedded,chatgptEmbedded,claudePage]=await Promise.all(['pipeline-claude.html','pipeline-chatgpt.html','pipeline-embedded-claude.js','pipeline-embedded.js','pipeline-embedded-claude.html'].map(read))
 assert.ok(claudeHost.includes("/pipeline-embedded-claude'")||claudeHost.includes('/pipeline-embedded-claude"'))
 assert.ok(!chatgptHost.includes('pipeline-embedded-claude'))
 assert.ok(claudePage.includes('/pipeline-assets/pipeline-embedded-claude.js'))
 for(const phrase of ['Ask Claude to create a custom view','Ask Claude to create your first custom view.','The Claude connection timed out.','Copy message to Claude'])assert.ok(claudeEmbedded.includes(phrase),phrase)
 for(const phrase of ['Ask ChatGPT to create a custom view','Ask ChatGPT to create your first custom view.','The ChatGPT connection timed out.','Copy message to ChatGPT']){
   assert.ok(!claudeEmbedded.includes(phrase),phrase)
   assert.ok(chatgptEmbedded.includes(phrase),phrase)
 }
})

test('Claude embedded route trusts only the Pipeline connector sandbox and claude.ai',async()=>{
 const host=createHash('sha256').update('https://mcp.trialagents.com/pipeline/claude').digest('hex').slice(0,32)+'.claudemcpcontent.com'
 const route=await readFile('integration/shared-web/app/pipeline-embedded-claude/route.ts','utf8')
 assert.ok(route.includes("'https://"+host+"'"))
 assert.ok(route.includes("frame-ancestors 'self' \"+claudeSandbox+\" https://claude.ai"))
 assert.ok(!route.includes('*.claudemcpcontent.com'))
})

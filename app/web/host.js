import {App} from '@modelcontextprotocol/ext-apps'
window.pipelineHost=true
const app=new App({name:'TrialAgents Pipeline',version:'0.1.0'},{availableDisplayModes:['inline','fullscreen']})
window.pipelineTransport=async request=>{
 const r=await app.callServerTool({name:'pipeline_widget_action',arguments:{request}})
 if(r.isError)throw Error(r.content?.find(c=>c.type==='text')?.text||'Pipeline request failed')
 return r._meta?.pipeline??r.structuredContent?.result
}
window.pipelineLink=async url=>{await app.openLink({url})}
document.getElementById('pipeline-header')?.shadowRoot?.querySelector('.workspace-brand')?.addEventListener('click',()=>window.pipelineLink('https://pipeline.trialagents.com/'))
let initialized=false
app.ontoolresult=async result=>{
 const data=result._meta?.pipeline;if(!data)return
 initialized=true;await window.pipelineMount(data)
 const view=result._meta?.view
 if(view)window.pipelineOpenView(view)
}
app.onteardown=async()=>({})
app.connect().then(async()=>{
 if(initialized)return
 // A host may reconnect a restored widget before replaying its tool result.
 const data=await window.pipelineTransport({op:'bootstrap'});if(!initialized){initialized=true;await window.pipelineMount(data)}
}).catch(e=>{document.getElementById('app').textContent=e.message})

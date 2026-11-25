import DOMPurify from 'dompurify'
import {createRoot} from 'react-dom/client'
import {InteractiveVisualization} from './intel/InteractiveVisualization.tsx'
import {fitFrame} from './fit-frame.js'
let root
function renderChart(container,html,title){
 if(window.pipelineHost&&!window.pipelineAssistant){
  root=createRoot(container)
  root.render(<InteractiveVisualization html={html} title={title} state={null} onChange={()=>{}}/>)
  return
 }
 // Standalone charts are read-only. Keep scripts disabled while measuring the document.
 const frame=document.createElement('iframe')
 frame.title=title
 frame.setAttribute('sandbox','allow-same-origin')
 frame.referrerPolicy='no-referrer'
 frame.addEventListener('load',()=>fitFrame(frame,'body'))
 frame.srcdoc=html
 container.replaceChildren(frame)
}
const escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))
export function paintChart(container,view,rows){
 root?.unmount();root=undefined
 if(!container||!view||(!view.chart&&!view.presentation))return
 if(view.presentation){
  const body=DOMPurify.sanitize(view.presentation,{USE_PROFILES:{html:true,svg:true},FORBID_TAGS:['style','script','iframe','form','input','object','embed','image','img','link','meta','base','use','animate','set','foreignObject'],FORBID_ATTR:['href','xlink:href','src','srcset','style','action','formaction','target']})
  const html='<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src &apos;none&apos;; style-src &apos;unsafe-inline&apos;"><style>body{margin:0;padding:16px;color:#172638;font:15px/1.5 system-ui}svg{max-width:100%;height:auto}table{border-collapse:collapse;width:100%}td,th{padding:6px;text-align:left;border-bottom:1px solid #ddd}</style></head><body>'+body+'</body></html>'
  renderChart(container,html,view.title);return
 }
 const records=rows(view.filters),groups=new Map()
 for(const r of records){const label=r[view.chart]||'Unassigned';groups.set(label,(groups.get(label)||0)+1)}
 const max=Math.max(...groups.values(),1)
 const bars=[...groups].sort((a,b)=>b[1]-a[1]).map(([label,n])=>'<div class="bar-row"><span class="bar-label">'+escape(label)+'</span><div class="bar-track"><svg viewBox="0 0 100 12" preserveAspectRatio="none"><rect width="'+100*n/max+'" height="12" rx="3" fill="#286748"/></svg></div><span class="bar-value">'+n+'</span></div>').join('')
 const html='<!doctype html><html><head><meta charset="utf-8"><style>body{margin:0;padding:16px;color:#172638;font:15px system-ui}figure{margin:16px 0}.bar-row{display:grid;grid-template-columns:minmax(80px,1fr) 2fr 40px;align-items:center;gap:12px;margin-bottom:8px}.bar-track svg{width:100%;height:12px}</style></head><body><p class="summary">'+records.length+' matching records grouped by '+escape(view.chart)+'.</p><figure class="bar-chart" aria-label="'+escape(view.title)+'">'+bars+'</figure></body></html>'
 renderChart(container,html,view.title)
}

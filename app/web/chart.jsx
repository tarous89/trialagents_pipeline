import {createRoot} from 'react-dom/client'
import {InteractiveVisualization} from './intel/InteractiveVisualization.tsx'
let root
const escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))
export function paintChart(container,view,rows){
 root?.unmount();root=undefined
 if(!container||!view?.chart)return
 const records=rows(view.filters),groups=new Map()
 for(const r of records){const label=r[view.chart]||'Unassigned';groups.set(label,(groups.get(label)||0)+1)}
 const max=Math.max(...groups.values(),1)
 const bars=[...groups].sort((a,b)=>b[1]-a[1]).map(([label,n])=>'<div class="bar-row"><span class="bar-label">'+escape(label)+'</span><div class="bar-track"><svg viewBox="0 0 100 12" preserveAspectRatio="none"><rect width="'+100*n/max+'" height="12" rx="3" fill="#286748"/></svg></div><span class="bar-value">'+n+'</span></div>').join('')
 const html='<!doctype html><html><head><meta charset="utf-8"><style>body{margin:0;padding:16px;color:#172638;font:15px system-ui}figure{margin:16px 0}.bar-row{display:grid;grid-template-columns:minmax(80px,1fr) 2fr 40px;align-items:center;gap:12px;margin-bottom:8px}.bar-track svg{width:100%;height:12px}</style></head><body><p class="summary">'+records.length+' matching records grouped by '+escape(view.chart)+'.</p><figure class="bar-chart" aria-label="'+escape(view.title)+'">'+bars+'</figure></body></html>'
 root=createRoot(container);root.render(<InteractiveVisualization html={html} title={view.title} state={null} onChange={()=>{}}/>)
}

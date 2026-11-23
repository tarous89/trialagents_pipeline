export class PipelineError extends Error {
  constructor(status, message) { super(message); this.status = status }
}
export function check(condition, message, status = 400) {
  if (!condition) throw new PipelineError(status, message)
}
export const types = ['Program','Milestone','Activity','Decision','Deliverable','Risk','Change']
export const uuid = v => typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v)
export const key = v => typeof v === 'string' && /^[a-zA-Z0-9_-]{1,100}$/.test(v) && !['__proto__','constructor','prototype'].includes(v)
export const title = v => typeof v === 'string' && v.trim().length > 0 && v.length <= 240
export const noticeKeys = ['assignment','deadline','review','change','risk','deliverable']
const dates = ['start','end','early','late']
function validDate(v) {
  if (!v) return true
  const ms = Date.parse(v)
  return typeof v === 'string' && /^\d{4}-\d\d-\d\d$/.test(v) && Number.isFinite(ms) && new Date(ms).toISOString().startsWith(v)
}
export function filters(input) {
  check(input && typeof input==='object' && !Array.isArray(input),'Invalid filters')
  const allowed=['program','owner','type','status','risk','budget','from','until','search']
  for (const [k,v] of Object.entries(input)) check(allowed.includes(k) && typeof v==='string' && v.length<=240,'Invalid filter')
  return input
}
export function settings(input) {
  check(input && ['EUR','USD','GBP','CHF','CAD','AUD','JPY'].includes(input.currency),'Unknown currency')
  check(['short','dmy','mdy','iso'].includes(input.dateFormat),'Unknown date format')
  check(Number.isInteger(input.days) && input.days>=0 && input.days<=3650 && Number.isInteger(input.window) && input.window>0 && input.window<=3650,'Invalid reminder or lookahead')
  return {currency:input.currency,dateFormat:input.dateFormat,days:input.days,window:input.window}
}
export function validatePortfolio(items) {
  const byId = new Map(items.map(x=>[x.id,x]))
  check(byId.size===items.length,'Duplicate record ID')
  for (const r of items) {
    check(key(r.id) && title(r.name),'Every record needs an ID and name')
    if(r.type==='Organization'){
      check(Array.isArray(r.contacts) && r.contacts.every(x=>typeof x==='string'),'Invalid contacts');continue
    }
    check(types.includes(r.type) && Array.isArray(r.parents) && Array.isArray(r.deps),'Invalid plan item')
    check(dates.every(k=>validDate(r[k])) && !(r.start && r.end && r.start>r.end),'Invalid dates')
    check(!(r.early && r.late && r.early>r.late),'Invalid date tolerance')
    for(const k of ['parents','related','orgIds'])check((r[k]??[]).every(id=>key(id)&&byId.has(id)),'Linked record no longer exists')
    check((r.orgIds??[]).every(id=>byId.get(id).type==='Organization'),'Invalid organization')
    const parentTypes={Program:[],Milestone:['Program'],Activity:['Program','Milestone'],Decision:['Program','Milestone']}
    check(r.parents.every(id=>(parentTypes[r.type]??types.slice(0,4)).includes(byId.get(id).type)),'Invalid parent type')
    for(const d of r.deps)check(d && byId.has(d.id) && ['start','finish','reached'].includes(d.to),'Invalid dependency')
    for(const f of r.files??[])check(typeof f.name==='string' && (key(f.id) && !f.url || /^data:application\/octet-stream;base64,[A-Za-z0-9+/]*={0,2}$/.test(f.url)),'Invalid attachment')
    for(const v of Object.values(r.forecasts??{}))check(validDate(v.end)&&(!v.budget||Number.isFinite(Number(v.budget))),'Invalid forecast')
  }
  for(const edges of [r=>r.parents??[],r=>(r.deps??[]).map(d=>d.id)]){
    const done=new Set(),path=new Set()
    function visit(id){
      if(done.has(id))return
      check(!path.has(id),'Cycle in hierarchy or dependencies');path.add(id)
      for(const child of edges(byId.get(id)))visit(child)
      path.delete(id);done.add(id)
    }
    for(const r of items)visit(r.id)
  }
}

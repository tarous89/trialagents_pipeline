import {riskLevel,riskExposure} from './risk.mjs'
import {randomUUID} from 'node:crypto'
import {check,types,validatePortfolio} from './rules.mjs'

// API clients see a display flag, while the database owns its provenance.
export const itemBody="CASE WHEN is_example THEN body || '{\"example\":true}'::jsonb WHEN body ? 'example' THEN body-'example' ELSE body END"

export function examplePortfolio(now=new Date()){
  const day=offset=>new Date(now.getTime()+offset*86400000).toISOString().slice(0,10)
  const ids=Object.fromEntries([...types,'Organization'].map(type=>[type,randomUUID()]))
  function record(type,name,owner,start,end,details){
    return {id:ids[type],type,name,owner,ownerId:null,start:day(start),end:day(end),
      parents:[],deps:[],members:[],orgIds:[],risk:'None',status:'Planned',...details}
  }
  const program=record('Program','Clinical development of EX-101','Program lead',-21,84,{
    asset:'EX-101',stage:'Phase 1',disease:'Atopic dermatitis',description:'A fictional program to illustrate planning for a first clinical study.',
    status:'In progress',risk:'Medium',budget:240000,spend:42000,orgIds:[ids.Organization],
    deps:[{id:ids.Milestone,to:'finish',from:'reached'}]})
  const milestone=record('Milestone','Site readiness review','Clinical operations',28,28,{
    parents:[ids.Program],risk:'Medium',deps:[{id:ids.Activity,to:'finish',from:'finish'}]})
  const activity=record('Activity','Prepare the site readiness checklist','Study manager',-7,14,{
    parents:[ids.Milestone],status:'In progress',risk:'Medium',budget:12000,spend:3600})
  const decision=record('Decision','Approve the site activation plan','Program lead',35,35,{
    parents:[ids.Program],status:'Pending',risk:'Medium',deps:[{id:ids.Milestone,to:'reached',from:'reached'}]})
  const deliverable=record('Deliverable','Draft site readiness checklist','Study manager',-1,-1,{
    parents:[ids.Activity],description:'Draft checklist circulated for the readiness review.',signoff:'Clinical operations'})
  const risk=record('Risk','Site contract review may delay activation','Clinical operations',-3,-3,{
    status:'Open',severity:'Medium',parents:[ids.Activity],description:'Reserve a review slot with the site contracting team.'})
  const change=record('Change','Allow one extra week for site review','Program lead',-2,-2,{
    parents:[ids.Milestone],description:'The review meeting moved by seven days.',forecasts:{[ids.Milestone]:{end:day(35)}}})
  const organization={id:ids.Organization,type:'Organization',name:'Example Clinical Partners',contacts:['Site coordinator']}
  const records=[program,milestone,activity,decision,deliverable,risk,change,organization]
  validatePortfolio(records)
  return records
}

const scopes={Program:[...types,'Organization'],Plan:[...types,'Organization'],
  Deliverable:['Deliverable'],Risk:['Risk'],Change:['Change']}
export async function removeExamples(q,workspace,scope){
  check(typeof scope==='string'&&Object.hasOwn(scopes,scope),'Unknown example selection')
  const rows=await q('SELECT id,'+itemBody+' AS body FROM pipeline.item WHERE workspace_id=$1',[workspace])
  const candidates=new Map(rows.filter(({body})=>body.example===true&&scopes[scope].includes(body.type)).map(({id,body})=>[id,body]))
  // Preserve references from surviving records and saved views, including indirect dependencies.
  const views=await q('SELECT filters,spec FROM pipeline.view WHERE workspace_id=$1',[workspace])
  const links=await q('SELECT from_id,to_id FROM pipeline.link WHERE workspace_id=$1',[workspace])
  const keep=new Set(),pending=links.flatMap(l=>[l.from_id,l.to_id])
  for(const {filters,spec} of views){
    const query=spec?.query
    pending.push(filters?.program,query?.program,query?.id)
    for(const c of query?.conditions??[])pending.push(c.value)
  }
  function references(r){
    pending.push(...(r.parents??[]),...(r.deps??[]).map(d=>d.id),...(r.related??[]),...(r.orgIds??[]),...Object.keys(r.forecasts??{}))
  }
  for(const {id,body} of rows)if(!candidates.has(id))references(body)
  while(pending.length){
    const id=pending.pop()
    if(!keep.has(id)&&candidates.has(id)){keep.add(id);references(candidates.get(id))}
  }
  const remove=[...candidates.keys()].filter(id=>!keep.has(id))
  if(remove.length)await q('DELETE FROM pipeline.item WHERE workspace_id=$1 AND id=ANY($2::text[])',[workspace,remove])
  if(keep.size)await q("UPDATE pipeline.item SET is_example=false WHERE workspace_id=$1 AND id=ANY($2::text[])",[workspace,[...keep]])
  if(remove.some(id=>candidates.get(id).type==='Risk')){
    const deleted=new Set(remove),records=rows.map(r=>r.body),survivors=records.filter(r=>!deleted.has(r.id))
    const before=riskExposure(records),after=riskExposure(survivors)
    const changes=survivors.filter(r=>before.get(r.id)?.some(risk=>deleted.has(risk.id)))
      .map(r=>({id:r.id,risk:riskLevel(after.get(r.id))}))
    if(changes.length)await q(`UPDATE pipeline.item AS item SET body=jsonb_set(body,'{risk}',to_jsonb(changes.risk))
      FROM jsonb_to_recordset($2::jsonb) AS changes(id text,risk text)
      WHERE item.workspace_id=$1 AND item.id=changes.id`,[workspace,JSON.stringify(changes)])
  }
  return {removed:remove,kept:[...keep]}
}

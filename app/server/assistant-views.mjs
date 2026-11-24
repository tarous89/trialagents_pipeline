import {createHash,randomUUID} from 'node:crypto'
import {activeTable,fieldsFor,viewDependencies,checkBusinessText} from './assistant-schema.mjs'
import {compileQuery,readRows} from './assistant-data.mjs'
import {check,title,uuid} from './rules.mjs'

export const link=(workspace,params={})=> 'https://pipeline.trialagents.com/?'+new URLSearchParams({workspace,...params})
const canonical=value=>Array.isArray(value)?value.map(canonical):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(k=>[k,canonical(value[k])])):value
const contentHash=(renderer,query,markup)=>digest(JSON.stringify([renderer,canonical(query),markup]))
const digest=value=>createHash('sha256').update(value).digest('hex')
const theme=accent=>'Use Inter with a system sans-serif fallback and native title and body sizes. Use #172638 for primary text and #536478 for secondary text. Fill the tab up to 1,670 px and inherit its outer gutters once. Space sections by 24 px, related blocks by 16 px, labels and controls by 8 px, and adjacent elements by 12–16 px. Use white surfaces, #F4F6FA background, '+accent+' accent and native success, warning and risk colors. Make the structure similar to the existing Pipeline tabs.'
function available(m,spec){
  if(!spec)return true
  if(!activeTable(m.catalog,spec.query.table))return false
  const ids=new Set([spec.query.table,...fieldsFor(m.catalog,spec.query.table).map(d=>d.id)])
  return [...viewDependencies(spec)].every(id=>ids.has(id))
}
export async function listViews(q,m,{offset=0,limit=20}={}){
  check(Number.isInteger(offset)&&offset>=0&&Number.isInteger(limit)&&limit>0&&limit<=100,'Invalid page')
  const rows=await q('SELECT id,title,version,spec FROM pipeline.view WHERE workspace_id=$1 ORDER BY created_at DESC,id LIMIT $2 OFFSET $3',[m.id,limit+1,offset])
  return {workspace:m.id,revision:m.revision,next:rows.length>limit?offset+limit:null,views:rows.slice(0,limit).map(({id,title,version,spec})=>({id,title,version,available:available(m,spec),url:link(m.id,{view:id})}))}
}
export async function readView(q,m,{id,content=false,offset=0}){
  check(uuid(id),'Invalid view ID')
  const [v]=await q('SELECT id,title,version,filters,chart,spec,presentation,form_state FROM pipeline.view WHERE workspace_id=$1 AND id=$2',[m.id,id])
  check(v,'View unavailable',404)
  const status={id,title:v.title,version:v.version,revision:m.revision,workspace:m.id,url:link(m.id,{view:id}),available:available(m,v.spec)}
  if(!status.available)return {...status,message:'A saved field or table has been archived.'}
  if(!v.spec){
    const f=v.filters??{},kinds=['Program','Milestone','Activity','Decision','Risk','Change','Deliverable']
    const conditions=['status','risk','owner'].filter(k=>f[k]).map(field=>({field,op:'eq',value:f[field]}))
    if(f.budget)conditions.push({field:'budget',op:f.budget==='under'?'lt':'gte',value:50000})
    if(f.from)conditions.push({field:'end',op:'gte',value:f.from})
    if(f.until)conditions.push({field:'start',op:'lte',value:f.until})
    const query={table:f.type||'Program',...!f.type&&{kinds},conditions,program:f.program,search:f.search,offset,fields:['name','status','end']}
    if(v.chart)query.group=v.chart
    return {...status,legacy:true,filters:f,chart:v.chart,renderer:v.presentation?'static':'live',...v.presentation?(content?{presentation:v.presentation}:{}):{data:await readRows(q,m,query)}}
  }
  return {...status,renderer:v.spec.renderer,query:v.spec.query,hash:v.spec.hash,asOf:v.spec.asOf,sourceRevision:v.spec.sourceRevision,
    ...content&&{presentation:v.presentation,state:v.form_state},...v.spec.renderer==='live'&&{data:await readRows(q,m,{...v.spec.query,offset})}}
}
export async function prepareView(q,m,{query,id}){
  const current=id?await readView(q,m,{id,content:true}):undefined
  query=query??current?.query??{table:'Program',fields:['name','status','end']}
  compileQuery(m,query)
  const relevant=viewDependencies({query})
  const fields=fieldsFor(m.catalog,query.table).filter(d=>relevant.has(d.id)).map(({id,label,type,kind,target,cardinality})=>({id,label,type,kind,target,cardinality}))
  return {workspace:m.id,revision:m.revision,query,fields,current,theme:theme(m.accent),procedure:'Read projected data if needed. Save a live query or an as-of static or interactive HTML/SVG presentation. Use create for a new view or update the selected ID with its version. Interactive controls support input, select and textarea; label them and give them stable IDs. Mark filterable rows data-filter-value and their search input data-filter. Use the verified receipt. Reopen its ID if display fails.'}
}
export function validateViewInput(m,input){
  const {query,renderer='live',presentation=''}=input
  check(query?.table&&['live','static','interactive'].includes(renderer)&&title(input.title),'Invalid view title, renderer or query')
  compileQuery(m,query)
  check(typeof presentation==='string'&&Buffer.byteLength(presentation)<=200000&&(renderer==='live'?!presentation:presentation.trim()),'Invalid view content')
  checkBusinessText(input.title);checkBusinessText(presentation)
  return {query,renderer,presentation}
}
export async function saveView(q,m,user,op,input){
  const {id,version}=input
  const {query,renderer,presentation}=validateViewInput(m,input)
  const hash=contentHash(renderer,query,presentation),spec={renderer,query,hash,sourceRevision:m.revision,asOf:new Date().toISOString()}
  let savedId
  if(op==='create'){
    savedId=randomUUID()
    await q("INSERT INTO pipeline.view(workspace_id,id,author,author_name,title,filters,presentation,spec) VALUES($1,$2,$3,$4,$5,'{}',$6,$7)",[m.id,savedId,user.id,[user.firstName,user.lastName].filter(Boolean).join(' ')||'Workspace member',input.title,presentation,JSON.stringify(spec)])
  }else{
    check(uuid(id)&&Number.isInteger(version),'View ID and version required')
    const rows=await q("UPDATE pipeline.view SET title=$4,presentation=$5,spec=$6,version=version+1,form_state='{}' WHERE workspace_id=$1 AND id=$2 AND version=$3 RETURNING id",[m.id,id,version,input.title,presentation,JSON.stringify(spec)])
    check(rows.length,'View changed or unavailable; reopen before editing',409);savedId=id
  }
  const [verified]=await q("SELECT version,spec,presentation FROM pipeline.view WHERE workspace_id=$1 AND id=$2",[m.id,savedId])
  check(verified.spec.hash===contentHash(verified.spec.renderer,verified.spec.query,verified.presentation),'Could not verify saved view',500)
  return {workspace:m.id,id:savedId,title:input.title,version:verified.version,hash,url:link(m.id,{view:savedId})}
}
export async function saveState(q,m,{id,version,state}){
  check(uuid(id)&&Number.isInteger(version)&&state&&typeof state==='object'&&!Array.isArray(state)&&Buffer.byteLength(JSON.stringify(state))<=24000,'Invalid control state')
  const [row]=await q("SELECT spec FROM pipeline.view WHERE workspace_id=$1 AND id=$2 AND version=$3",[m.id,id,version])
  check(row&&row.spec?.renderer==='interactive'&&available(m,row.spec),'View changed or unavailable',409)
  await q('UPDATE pipeline.view SET form_state=$3,version=version+1 WHERE workspace_id=$1 AND id=$2',[m.id,id,JSON.stringify(state)])
  return {id,version:version+1}
}

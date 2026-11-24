import {randomUUID} from 'node:crypto'
import {activeTable,builtins,fieldsFor,validateValue,checkBusinessText} from './assistant-schema.mjs'
import {check,key,title} from './rules.mjs'
import {itemBody} from './examples.mjs'

const builtin=table=>builtins.includes(table)
const ops=['eq','ne','contains','gte','lte','lt','empty']
export function compileQuery(m,input={}){
  const {table='Program',kinds,search='',id,program,programSearch,fields,conditions=[],order='name',descending=false,group,sum,limit=20,offset=0}=input
  check(activeTable(m.catalog,table),'Table unavailable',404)
  const defs=new Map(fieldsFor(m.catalog,table).map(d=>[d.id,d]))
  const selected=fields??['name','status','end'].filter(f=>defs.has(f))
  check(Array.isArray(selected)&&selected.length>0&&selected.length<=24&&selected.every(f=>defs.has(f)),'Choose available fields')
  check(typeof search==='string'&&search.length<=240&&(!id||key(id))&&(!program||key(program)),'Invalid search')
  check(Number.isInteger(limit)&&limit>0&&limit<=100&&Number.isInteger(offset)&&offset>=0&&offset<=1000000,'Invalid page')
  check(defs.has(order)&&(!group||defs.has(group))&&(!sum||['currency','number'].includes(defs.get(sum)?.type)),'Invalid sort or aggregation')
  check(Array.isArray(conditions)&&conditions.length<=12&&conditions.every(c=>c&&defs.has(c.field)&&ops.includes(c.op)),'Invalid conditions')
  const p=[m.id,table],param=v=>{p.push(v);return '$'+p.length}
  if(kinds)check(Array.isArray(kinds)&&kinds.length>0&&kinds.every(k=>builtins.includes(k)&&k!=='Organization')&&kinds.includes(table)&&[...selected,order,group,sum,...conditions.map(c=>c.field)].filter(Boolean).every(k=>defs.get(k)?.protected),'Mixed views require shared built-in fields')
  if(kinds)p[1]=kinds
  let base=builtin(table)?'pipeline.item i LEFT JOIN pipeline.data_row d ON d.workspace_id=i.workspace_id AND d.table_id=i.kind AND d.id=i.id':'pipeline.data_row i'
  const body=builtin(table)?'i.body':'i.values_json'
  const values=builtin(table)?'d.values_json':'i.values_json'
  const expressions=new Map()
  function field(id){
    if(expressions.has(id))return expressions.get(id)
    const d=defs.get(id),k=param(id)
    let expr
    if(d.kind==='relationship'){
      const forwards=d.table===table,side=forwards?'from_id':'to_id',other=forwards?'to_id':'from_id',target=forwards?d.target:d.table
      const targetRows=builtin(target)?'pipeline.item t':'pipeline.data_row t'
      const data=builtin(target)?'body':'values_json',kind=builtin(target)?'kind':'table_id'
      expr="(SELECT COALESCE(jsonb_agg(jsonb_build_object('id',t.id,'name',t."+data+"->>'name') ORDER BY t.id),'[]'::jsonb) FROM pipeline.link e JOIN "+targetRows+" ON t.workspace_id=e.workspace_id AND t."+kind+'='+param(target)+' AND t.id=e.'+other+' WHERE e.workspace_id=i.workspace_id AND e.relation_id='+k+'::uuid AND e.'+side+'=i.id)'
    }else{
      expr=(d.protected?body:values)+'->'+k+'::text'
      if(effective && ['end','start','budget'].includes(id)){
        if(id==='end')expr='COALESCE(dates.finish,'+expr+')'
        if(id==='budget')expr="COALESCE(dates.budget,"+expr+")"
        if(id==='start')expr="CASE WHEN i.kind IN ('Milestone','Decision') THEN COALESCE(dates.finish,i.body->'end') ELSE "+expr+" END"
      }
      if(d.default!=null)expr='COALESCE('+expr+','+param(JSON.stringify(d.default))+'::jsonb)'
    }
    expressions.set(id,expr);return expr
  }
  const effective=builtin(table)&&table!=='Organization'&&[...selected,order,group,sum,...conditions.map(c=>c.field)].some(f=>['start','end','budget'].includes(f))
  if(effective)base+=" LEFT JOIN effective_dates dates ON dates.id=i.id"
  const where=['i.workspace_id=$1',kinds?'i.kind=ANY($2::text[])':'i.'+(builtin(table)?'kind':'table_id')+'=$2']
  let prefix=''
  if(program||programSearch){check(builtin(table),'Program filter requires a built-in table')
    check(!programSearch||typeof programSearch==='string'&&programSearch.trim().length>1&&programSearch.length<=240,'Invalid program search')
    const match=program?'id='+param(program):"position(lower("+param(programSearch)+") in lower(concat_ws(' ',body->>'name',body->>'asset')))>0"
    prefix="WITH RECURSIVE family(id) AS (SELECT id FROM pipeline.item WHERE workspace_id=$1 AND kind='Program' AND "+match+" UNION SELECT child.id FROM pipeline.item child JOIN family ON (child.body->'parents') ? family.id WHERE child.workspace_id=$1) "
    where.push('i.id IN (SELECT id FROM family)')}
  if(id)where.push('i.id='+param(id))
  if(effective){
    const dates=`effective_dates AS (SELECT f.key AS id,
      (array_agg(f.value->'end' ORDER BY c.body->>'end' DESC,c.id DESC) FILTER(WHERE coalesce(f.value->>'end','')<>''))[1] AS finish,
      (array_agg(to_jsonb(nullif(f.value->>'budget','')::numeric) ORDER BY c.body->>'end' DESC,c.id DESC) FILTER(WHERE coalesce(f.value->>'budget','')<>''))[1] AS budget
      FROM pipeline.item c CROSS JOIN LATERAL jsonb_each(coalesce(c.body->'forecasts','{}'::jsonb)) f
      WHERE c.workspace_id=$1 AND c.kind='Change' AND (c.body->'parents') ? f.key GROUP BY f.key) `
    prefix=prefix?prefix.trimEnd()+', '+dates:'WITH '+dates
  }
  if(search)where.push("position(lower("+param(search)+") in lower("+body+"->>'name'))>0")
  for(const c of conditions){
    const f=field(c.field)
    if(c.op==='empty'){where.push("("+f+" IS NULL OR "+f+" IN ('null'::jsonb,'[]'::jsonb,'\"\"'::jsonb))");continue}
    check(c.value!=null&&['string','boolean','number'].includes(typeof c.value),'Invalid condition value')
    if(defs.get(c.field).kind==='relationship'){
      check(c.op==='eq'&&key(c.value),'Filter relationships by a related record ID')
      where.push(f+' @> '+param(JSON.stringify([{id:c.value}]))+'::jsonb')
    }else if(c.op==='contains'){
      check(typeof c.value==='string','Expected search text');where.push("position(lower("+param(c.value)+") in lower("+f+" #>> '{}'))>0")
    }else where.push('('+f+') '+({eq:'=',ne:'<>',gte:'>=',lte:'<=',lt:'<'}[c.op])+' '+param(JSON.stringify(c.value))+'::jsonb')
  }
  const from=' FROM '+base+' WHERE '+where.join(' AND ')
  if(group||sum||input.count){
    let by=group?field(group):null
    // Each linked record counts once per related group. Unlinked rows have their own bucket.
    const many=group&&defs.get(group).kind==='relationship'
    const clause=many?from.replace(' WHERE '," LEFT JOIN LATERAL jsonb_array_elements("+by+") grouped(val) ON true WHERE "):from
    if(many)by='grouped.val'
    const grouping=group?' GROUP BY 1 ORDER BY 1 NULLS LAST':''
    const sumExpr=sum?"COALESCE(sum(NULLIF(("+field(sum)+") #>> '{}','')::numeric),0)::float8 AS sum":"NULL::float8 AS sum"
    const sql=prefix+'SELECT '+(group?by:'NULL::jsonb')+' AS label,count(*)::int AS count,'+sumExpr+clause+grouping+' LIMIT '+param(limit+1)+' OFFSET '+param(offset)
    return {sql,p,selected,table,limit,offset,aggregate:true}
  }
  const project=selected.map(f=>"'"+f+"',"+field(f)).join(',')
  const sql=prefix+"SELECT i.id,"+(builtin(table)?"i.kind":"i.table_id")+" AS table,jsonb_build_object("+project+") AS values"+from+' ORDER BY '+field(order)+(descending?' DESC':' ASC')+' NULLS LAST,i.id LIMIT '+param(limit+1)+' OFFSET '+param(offset)
  return {sql,p,selected,table,limit,offset}
}
export async function readRows(q,m,query={}){
  const plan=compileQuery(m,query)
  const rows=await q(plan.sql,plan.p)
  return {workspace:m.id,revision:m.revision,table:plan.table,...query.kinds&&{kinds:query.kinds},fields:plan.selected,columns:fieldsFor(m.catalog,plan.table).filter(d=>plan.selected.includes(d.id)).map(d=>({id:d.id,label:d.kind==='relationship'&&d.target===plan.table?d.inverse:d.label})),[plan.aggregate?'groups':'records']:rows.slice(0,plan.limit),next:rows.length>plan.limit?plan.offset+plan.limit:null}
}
async function findRow(q,w,table,id){
  const rows=builtin(table)?await q('SELECT '+itemBody+' AS value FROM pipeline.item WHERE workspace_id=$1 AND kind=$2 AND id=$3',[w,table,id]):
    await q('SELECT values_json AS value FROM pipeline.data_row WHERE workspace_id=$1 AND table_id=$2 AND id=$3',[w,table,id])
  return rows[0]?.value
}
async function setEdges(q,m,table,id,relation,ids){
  check(Array.isArray(ids)&&ids.length<=100&&ids.every(key)&&new Set(ids).size===ids.length,'Expected unique linked record IDs')
  const forward=table===relation.table,target=forward?relation.target:relation.table
  const [a,b]=relation.cardinality.split('-to-'),side=forward?'from_id':'to_id',other=forward?'to_id':'from_id'
  if((forward?b:a)==='one')check(ids.length<=1,'This relationship accepts one linked record')
  await q('DELETE FROM pipeline.link WHERE workspace_id=$1 AND relation_id=$2 AND '+side+'=$3',[m.id,relation.id,id])
  for(const linked of ids){
    check(await findRow(q,m.id,target,linked),'Linked record unavailable')
    if((forward?a:b)==='one')check(!(await q('SELECT 1 FROM pipeline.link WHERE workspace_id=$1 AND relation_id=$2 AND '+other+'=$3 LIMIT 1',[m.id,relation.id,linked])).length,'Linked record already assigned',409)
    await q('INSERT INTO pipeline.link(workspace_id,relation_id,from_table,from_id,to_table,to_id) VALUES($1,$2,$3,$4,$5,$6)',[m.id,relation.id,relation.table,forward?id:linked,relation.target,forward?linked:id])
  }
}
export async function changeRow(q,m,user,source,action,{table,id,values={}},saveItems){
  check(activeTable(m.catalog,table)&&(!id||key(id)),'Invalid table or record')
  if(action==='create')id=id||randomUUID()
  check(key(id),'Record ID required')
  const old=await findRow(q,m.id,table,id)
  check(action==='create'?!old:!!old,action==='create'?'Record ID already in use':'Record unavailable',action==='create'?409:404)
  if(action==='delete'){
    if(builtin(table))await saveItems(q,m.id,user,source,{remove:[id]},m)
    else{
      await q('DELETE FROM pipeline.link WHERE workspace_id=$1 AND ((from_table=$2 AND from_id=$3) OR (to_table=$2 AND to_id=$3))',[m.id,table,id])
      await q('DELETE FROM pipeline.data_row WHERE workspace_id=$1 AND table_id=$2 AND id=$3',[m.id,table,id])
    }
    return {id}
  }
  check(values&&typeof values==='object'&&!Array.isArray(values)&&Object.keys(values).length>0,'Provide changed fields')
  const fields=fieldsFor(m.catalog,table),defs=new Map(fields.map(d=>[d.id,d])),extras={},edges=[]
  const record={...(table==='Organization'?{contacts:[]}:{parents:[],deps:[],status:'Planned',risk:'None'}),...old,id,type:table}
  for(const [k,v] of Object.entries(values)){
    const d=defs.get(k);check(d,'Field unavailable')
    if(d.kind==='relationship'){edges.push([d,v]);continue}
    check(k!=='type','The built-in record type is fixed')
    validateValue(d,v)
    if(!d.protected||k==='description')checkBusinessText(v)
    if(d.protected&&builtin(table))record[k]=v
    else extras[k]=v
  }
  if(action==='create'){
    check(title(values.name),'Name the record')
    for(const d of fields)if(d.required)check(values[d.id]!=null||d.default!=null,'A required field is missing')
  }
  if(builtin(table))await saveItems(q,m.id,user,source,{upsert:[record]},m)
  if(Object.keys(extras).length)await q('INSERT INTO pipeline.data_row VALUES($1,$2,$3,$4) ON CONFLICT(workspace_id,table_id,id) DO UPDATE SET values_json=pipeline.data_row.values_json || excluded.values_json',[m.id,table,id,JSON.stringify(extras)])
  for(const [d,v] of edges)await setEdges(q,m,table,id,d,v)
  return {id,table}
}

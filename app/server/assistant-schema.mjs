import {randomUUID} from 'node:crypto'
import {check, title, types} from './rules.mjs'

export const builtins = [...types, 'Organization']
const privateName=/\b(?:patients?|participants?'? (?:name|email|address|id)|medical record|date of birth|e-?mail|phone|home address|contact details|credentials?|password|access token)\b/i
export function checkBusinessText(value){
  if(typeof value!=='string')return
  check(!/\b(?:medical record number|patient (?:name|identifier|email|address|date of birth)|social security number)\s*[:=]|[\w.+-]+@[\w.-]+\.[a-z]{2,}/i.test(value),'Keep personal contact and patient identifiers out of shared Pipeline content')
}
const fieldTypes = ['text','number','currency','date','boolean','choice','choices']
const shared = {name:'text',type:'text',status:'text',start:'date',end:'date',owner:'text',risk:'text',budget:'number',spend:'number',description:'text',
  decisionResult:'text',signoff:'text',members:'parents',parents:'parents',deps:'dependencies',related:'parents',orgIds:'parents',asset:'text',stage:'text',disease:'text',severity:'text',early:'date',late:'date'}
export const defaultFields = ['name','status','end']
export function fieldsFor(catalog,table) {
  const core = builtins.includes(table) && table!=='Organization' ? shared : {name:'text'}
  return [
    ...Object.entries(core).map(([id,type])=>({id,label:id,type,kind:'column',table,protected:true,disclosure:['description','owner'].includes(id)?'explicit':'business'})),
    ...catalog.filter(d=>d.kind==='column' && d.table===table && !d.archived).map(d=>({...d,disclosure:'explicit'})),
    ...catalog.filter(d=>d.kind==='relationship' && !d.archived && (d.table===table||d.target===table)
      && activeTable(catalog,d.table) && activeTable(catalog,d.target))
  ]
}
export function activeTable(catalog,id) {
  return builtins.includes(id)||catalog.some(d=>d.id===id && d.kind==='table' && !d.archived)
}
export function definitions(m,table,includeArchived=false,knownRevision) {
  if(knownRevision===m.revision)return {unchanged:true,revision:m.revision,canManage:m.role==='owner'}
  const catalog=m.catalog
  const tables=[...builtins.map(id=>({id,label:id,kind:'table',protected:true})),...catalog.filter(d=>d.kind==='table'&&(includeArchived||!d.archived))]
  if(!table)return {tables:tables.map(({id,label,kind,description,archived,protected:fixed})=>({id,label,kind,description,archived:!!archived,protected:!!fixed})),canManage:m.role==='owner',revision:m.revision}
  check(tables.some(t=>t.id===table),'Table unavailable',404)
  const fields=fieldsFor(catalog,table)
  if(includeArchived)fields.push(...catalog.filter(d=>d.archived && d.kind!=='table' && (d.table===table||d.target===table)))
  return {table:tables.find(t=>t.id===table),fields:fields.map(f=>({...f,nullable:f.id!=='name'&&!f.required})).sort((a,b)=>(a.position??9999)-(b.position??9999)),revision:m.revision,canManage:m.role==='owner'}
}
export function validateValue(d,value) {
  if(value===null){check(!d.required,'A required field cannot be cleared');return}
  switch(d.type){
    case 'text':check(typeof value==='string' && value.length<=20000,'Invalid text');break
    case 'number': case 'currency':check(Number.isFinite(value),'Expected a finite number');break
    case 'boolean':check(typeof value==='boolean','Expected true or false');break
    case 'date':check(typeof value==='string' && (value===''||(/^\d{4}-\d\d-\d\d$/.test(value)&& Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0,10)===value)),'Invalid date');break
    case 'choice':check(d.options.includes(value),'Unknown choice');break
    case 'choices':check(Array.isArray(value)&&value.length<=d.options.length&&new Set(value).size===value.length&&value.every(v=>d.options.includes(v)),'Invalid choices');break
    case 'parents':check(Array.isArray(value)&&value.every(x=>typeof x==='string'),'Invalid record references');break
    case 'dependencies':check(Array.isArray(value)&&value.every(x=>x&&typeof x.id==='string'&&['start','finish','reached'].includes(x.to)),'Invalid dependencies');break
    default:check(false,'Unsupported value type')
  }
}
export function viewDependencies(spec) {
  const query=spec?.query??{}
  return new Set([query.table,...(query.fields??[]),...(query.conditions??[]).map(f=>f.field),query.order,query.group,query.sum].filter(Boolean))
}
export async function impact(q,m,id) {
  const def=m.catalog.find(d=>d.id===id);check(def,'Required Pipeline definitions are protected')
  const affected=new Set([id])
  if(def.kind==='table')for(const d of m.catalog)if(d.table===id||d.target===id)affected.add(d.id)
  const views=(await q('SELECT id,title,spec FROM pipeline.view WHERE workspace_id=$1 AND spec IS NOT NULL',[m.id]))
    .filter(v=>[...viewDependencies(v.spec)].some(k=>affected.has(k))).map(({id,title})=>({id,title}))
  return {id,views,pins:m.tabs.filter(p=>views.some(v=>v.id===p.view)).map(p=>p.label),relationships:m.catalog.filter(d=>d.kind==='relationship'&&affected.has(d.id)).map(d=>({id:d.id,label:d.label})),revision:m.revision}
}
function validateDefinition(d,catalog) {
  check(title(d.label) && (!d.description||typeof d.description==='string'&&d.description.length<=1500),'Invalid definition name or description')
  check(!privateName.test(d.label+' '+(d.inverse??'')+' '+(d.description??'')),'Use operational business fields only')
  check(d.position==null||Number.isInteger(d.position)&&d.position>=0,'Invalid field position')
  check(d.required==null||typeof d.required==='boolean','Invalid required flag')
  check(!(d.kind==='table'?builtins:[...(builtins.includes(d.table)?Object.keys(shared):['name']),'id','type']).some(x=>x.toLowerCase()===d.label.trim().toLowerCase()),'Reserved name')
  check(!catalog.some(x=>x.id!==d.id&&!x.archived&&x.table===d.table&&x.label.trim().toLowerCase()===d.label.trim().toLowerCase()),'Name already in use',409)
  if(d.kind!=='table'){
    const ends=catalog.filter(x=>x.id!==d.id&&x.kind==='relationship'&&!x.archived)
    check(!ends.some(x=>x.target===d.table&&x.inverse.toLowerCase()===d.label.toLowerCase()),'Relationship name already used',409)
  }
  if(d.kind==='table')return
  check(activeTable(catalog,d.table),'Source table unavailable')
  if(d.kind==='relationship'){
    check(activeTable(catalog,d.target)&&d.target!==d.table,'Choose two different active tables')
    check(['one-to-one','one-to-many','many-to-one','many-to-many'].includes(d.cardinality),'Invalid cardinality')
    check(title(d.inverse),'Name the inverse relationship')
    check(!fieldsFor(catalog,d.target).some(f=>f.id!==d.id&&(f.target===d.target?f.inverse:f.label)?.toLowerCase()===d.inverse.toLowerCase()),'Inverse name already used',409);return
  }
  check(fieldTypes.includes(d.type),'Invalid column type')
  if(['choice','choices'].includes(d.type))check(Array.isArray(d.options)&&d.options.length>0&&d.options.length<=200&&new Set(d.options).size===d.options.length&&d.options.every(title),'Invalid choices')
  if(d.type==='currency')check(/^[A-Z]{3}$/.test(d.unit??''),'Currency unit required')
  if(d.default!=null){validateValue(d,d.default);checkBusinessText(d.default)}
}
export async function changeDefinition(q,m,op,input) {
  const [,kind,action]=op.split('.'), catalog=structuredClone(m.catalog)
  if(action==='add'){
    const build=(k,params)=>{
      const allowed=k==='table'?['label','description','columns']:k==='column'?['label','description','table','type','options','unit','required','default','position']:['label','description','table','target','inverse','cardinality']
      check(Object.keys(params).every(key=>allowed.includes(key)),'Unknown schema property')
      const {columns,...values}=params
      const d={...values,kind:k,id:randomUUID(),archived:false};validateDefinition(d,catalog)
      catalog.push(d);return d
    }
    const d=build(kind,input)
    if(kind==='column' && d.required && d.default==null){
      const rows=builtins.includes(d.table)?await q('SELECT 1 FROM pipeline.item WHERE workspace_id=$1 AND kind=$2 LIMIT 1',[m.id,d.table]):await q('SELECT 1 FROM pipeline.data_row WHERE workspace_id=$1 AND table_id=$2 LIMIT 1',[m.id,d.table])
      check(!rows.length,'Provide a default for existing rows',409)
    }
    const added=[]
    if(kind==='table'){check(Array.isArray(input.columns??[])&&(input.columns??[]).length<=100,'Too many columns')
      for(const c of input.columns??[]){if(c.label?.toLowerCase()==='name')continue;added.push(build('column',{...c,table:d.id}))}}
    check(catalog.length<=2000,'Workspace definition limit reached')
    await q('UPDATE pipeline.workspace SET catalog=$2 WHERE id=$1',[m.id,JSON.stringify(catalog)])
    return {id:d.id,added:added.map(c=>({id:c.id,label:c.label}))}
  }
  const d=catalog.find(x=>x.id===input.id&&x.kind===kind);check(d,'Custom definition required; built-ins are protected')
  if(action==='update'){
    check(!d.archived,'Restore the definition first',409)
    const allowed=['label','description','position',...(kind==='column'?['type','options','unit','default','required']:kind==='relationship'?['inverse','cardinality','target']:[])]
    const patch=input.changes
    check(patch&&Object.keys(patch).length&&Object.keys(patch).every(k=>allowed.includes(k)),'Unsupported schema edit')
    const old={...d};Object.assign(d,patch);validateDefinition(d,catalog)
    if(kind==='column'){
      const rows=await q('SELECT values_json->$3 AS value FROM pipeline.data_row WHERE workspace_id=$1 AND table_id=$2 AND values_json ? $3',[m.id,d.table,d.id])
      if(rows.length)check((old.type===d.type||['number','currency'].includes(old.type)&&['number','currency'].includes(d.type))&&(!old.unit||old.unit===d.unit),'Migrate values to a replacement column first',409)
      for(const {value} of rows)validateValue(d,value)
      if(d.required&&!old.required)check(d.default!=null,'Provide a default for existing rows',409)
    }
    if(kind==='relationship'&&(old.target!==d.target||old.cardinality!==d.cardinality)){
      const links=await q('SELECT 1 FROM pipeline.link WHERE workspace_id=$1 AND relation_id=$2 LIMIT 1',[m.id,d.id]);check(!links.length,'Migrate linked values before changing cardinality or target',409)
    }
  }else if(action==='archive'){
    const effects=await impact(q,m,d.id);check((!effects.views.length&&!effects.relationships.some(r=>r.id!==d.id))||input.keep_unavailable===true,'Review dependent views and explicitly keep them marked unavailable',409)
    d.archived=true
  }else if(action==='restore'){validateDefinition(d,catalog);d.archived=false}
  else check(false,'Unknown schema operation')
  await q('UPDATE pipeline.workspace SET catalog=$2 WHERE id=$1',[m.id,JSON.stringify(catalog)])
  return {id:d.id,archived:d.archived}
}

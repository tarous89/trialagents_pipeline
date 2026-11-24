import {workspaceOperations} from './workspace-operations.mjs'
import {createHash,randomBytes,randomUUID} from 'node:crypto'
import {isDeepStrictEqual} from 'node:util'
import {examplePortfolio,removeExamples,itemBody} from './examples.mjs'
import {check,uuid,key,title,filters,settings,validatePortfolio,noticeKeys} from './rules.mjs'

import {definitions,changeDefinition,impact} from './assistant-schema.mjs'
import {readRows,changeRow} from './assistant-data.mjs'
import {riskLevel,riskExposure} from './risk.mjs'
import {link,listViews,prepareView,readView,saveView,saveState,validateViewInput} from './assistant-views.mjs'

const schemaOps=new Set(['table','column','relationship'].flatMap(kind=>['add','update','archive','restore'].map(action=>'schema.'+kind+'.'+action)))
const assistantReads=new Set(['assistant.open','assistant.read','assistant.workspaces','assistant.design','assistant.schema','assistant.impact','assistant.views','assistant.view','assistant.prepare'])
const assistantWrites=new Set(['assistant.row.create','assistant.row.update','assistant.row.delete','assistant.view.create','assistant.view.update','assistant.state',...schemaOps])
const canonical = value => Array.isArray(value)?value.map(canonical):value && typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(k=>[k,canonical(value[k])])):value
const hash = value => createHash('sha256').update(value).digest('hex')
const json = JSON.stringify
const paid = row => !row.suspended && row.paid_until && new Date(row.paid_until)>new Date()
const person = u => [u.firstName,u.lastName].filter(Boolean).join(' ') || u.email
const assistantTitle=(row,user)=>row.title===person(user)+' workspace'||/\S+@\S+/.test(row.title)?'My workspace':row.title
const visible = m => ({id:m.id,title:m.title,role:m.role,team:Boolean(paid(m))})
const sqlMember = `SELECT w.*,m.role,m.preferences FROM pipeline.workspace w JOIN pipeline.member m ON m.workspace_id=w.id WHERE w.id=$1 AND m.user_id=$2`
const one = async (q,s,p) => (await q(s,p))[0]
const safeItem = x => x && Object.fromEntries(Object.entries(x).filter(([k])=>!['files','approved'].includes(k)))
async function audit(q,w,u,source,action,target,details={}){
  await q('INSERT INTO pipeline.audit(workspace_id,actor,actor_name,source,action,target,details) VALUES($1,$2,$3,$4,$5,$6,$7)',[w,u.id,person(u),source,action,target,json(details)])
}
async function membership(q,w,u,lock=false){
  check(uuid(w),'Invalid workspace')
  const m=await one(q,sqlMember+(lock?' FOR UPDATE OF w':''),[w,u.id])
  check(m && (m.role==='owner'||paid(m)),'Workspace access unavailable',403)
  m.tabs=m.tabs.filter(t=>!['Updates','Digest'].includes(t.builtin))
  return m
}
async function ensureHome(q,u){
  const inserted=await one(q,'INSERT INTO pipeline.workspace(id,owner_id,title) VALUES($1,$2,$3) ON CONFLICT(owner_id) DO NOTHING RETURNING id',[randomUUID(),u.id,person(u)+' workspace'])
  if(inserted){
    await q("INSERT INTO pipeline.member(workspace_id,user_id,email,display_name,role) VALUES($1,$2,$3,$4,'owner')",[inserted.id,u.id,u.email.toLowerCase(),person(u)])
    const examples=examplePortfolio()
    await q(`INSERT INTO pipeline.item(workspace_id,id,kind,body,is_example)
      SELECT $1,body->>'id',body->>'type',body,true FROM jsonb_array_elements($2::jsonb) AS items(body)`,[inserted.id,json(examples)])
    await audit(q,inserted.id,u,'web','workspace.created',inserted.id,{exampleRecords:examples.length})
  }
  return inserted?.id??(await one(q,'SELECT id FROM pipeline.workspace WHERE owner_id=$1',[u.id])).id
}
async function viewList(q,w){
  return q(`SELECT id,title,version,filters || CASE WHEN spec->'query'->>'program' IS NULL THEN '{}'::jsonb
    ELSE jsonb_build_object('program',spec->'query'->>'program') END AS filters,chart,
    (length(presentation)>0 OR spec IS NOT NULL) AS rich,(spec IS NOT NULL) AS bound,author,author_name,created_at
    FROM pipeline.view WHERE workspace_id=$1 ORDER BY created_at DESC,id`,[w])
}
const writeOps=new Set(['examples.remove','items.save','settings.save','preferences.save','view.save','view.remove','design.save','team.invite','team.revoke','team.member'])
const ownerOps=new Set(['settings.save','design.save','team.invite','team.revoke','team.member','team.list','billing.checkout','billing.portal'])
const memberOps=new Set(['bootstrap','records.read','view.read','logs','attachment.get','preferences.save','view.list'])
const defaultSettings={currency:'EUR',dateFormat:'short',window:90,days:7}
export function pipeline(db,{origin='https://pipeline.trialagents.com',billing}={}){
  return async function execute(user,request,source='web'){
    check(user?.id&&user.email,'Sign in to Pipeline',401)
    check(request && typeof request.op==='string','Invalid request')
    const fromWorkspace=source==='ChatGPT workspace'
    if(fromWorkspace){
      check(workspaceOperations.includes(request.op),'Unavailable workspace action',403)
      check(uuid(request.workspace),'Choose a workspace')
      source='ChatGPT'
    }
    if(['assistant.view.create','assistant.view.update','assistant.view.retry'].includes(request.op)){
      check(source==='ChatGPT','Author shared views through the connected assistant',403)
      const retry=request.op==='assistant.view.retry'
      const payload=await db.transaction(async q=>{
        const m=await membership(q,request.workspace,user,true)
        check(m.role!=='reader','Read-only workspace access',403)
        check(uuid(request.requestId),'A write request ID is required')
        const key=[m.id,user.id,request.requestId]
        if(!retry){
          check(Buffer.byteLength(json(request.input??{}))<240000,'View draft too large')
          // A completed/retried operation can outlive a schema rename or archive.
          const prior=await one(q,'SELECT digest FROM pipeline.view_draft WHERE workspace_id=$1 AND actor=$2 AND id=$3 AND expires>now()',key)
          if(!prior)validateViewInput(m,request.input??{})
          const digest=hash(json(canonical([request.op,request.input,request.revision])))
          await q('DELETE FROM pipeline.view_draft WHERE expires<now() AND workspace_id=$1',[m.id])
          const [d]=await q('INSERT INTO pipeline.view_draft(workspace_id,actor,id,payload,digest) VALUES($1,$2,$3,$4,$5) ON CONFLICT(workspace_id,actor,id) DO UPDATE SET digest=pipeline.view_draft.digest RETURNING digest',[...key,json(request),digest])
          check(d.digest===digest,'Request ID already used',409)
        }
        const [row]=await q('SELECT payload FROM pipeline.view_draft WHERE workspace_id=$1 AND actor=$2 AND id=$3 AND expires>now()',key)
        check(row,'Saved draft unavailable',404)
        return row.payload
      })
      request=payload
    }
    const {op,input={}}=request
    return db.transaction(async q=>{
      if(op==='home.ensure'&&source==='consent')return {workspace:await ensureHome(q,user)}
      if(fromWorkspace&&op==='frame.connect'){
        await membership(q,request.workspace,user)
        check(/^[a-f0-9]{64}$/.test(input.challenge)&&/^[a-f0-9]{64}$/.test(user.accessDigest),'Connect Pipeline',401)
        const [grant]=await q(`INSERT INTO pipeline.frame_access(challenge,user_id,workspace_id,access_digest,expires_at)
          VALUES($1,$2,$3,$4,now()+interval '10 minutes') ON CONFLICT(challenge) DO UPDATE SET
          access_digest=excluded.access_digest,expires_at=excluded.expires_at WHERE
          pipeline.frame_access.user_id=excluded.user_id AND pipeline.frame_access.workspace_id=excluded.workspace_id RETURNING workspace_id`,
          [input.challenge,user.id,request.workspace,user.accessDigest])
        check(grant,'Open the workspace again',409)
        return {workspace:request.workspace}
      }
      if(source==='ChatGPT'&&!fromWorkspace)check(assistantReads.has(op)||assistantWrites.has(op)||['team.invite','design.save'].includes(op),'Unavailable in Pipeline for ChatGPT',403)
      if(op==='team.accept')return accept(q,user,input,source)
      const home=(!request.workspace&&assistantReads.has(op))?await one(q,'SELECT id FROM pipeline.workspace WHERE owner_id=$1',[user.id]):null
      if(!request.workspace&&assistantReads.has(op))check(home,'Reconnect to initialize your personal workspace',409)
      const w=request.workspace || home?.id || (['bootstrap','records.read'].includes(op) && await ensureHome(q,user))
      const write=writeOps.has(op)||assistantWrites.has(op)
      const m=await membership(q,w,user,write||op.startsWith('billing.'))
      if(op==='team.invite'&&source==='ChatGPT')check(m.role==='owner'&&paid(m),'Invitations are unavailable in this workspace',403)
      if(ownerOps.has(op)||schemaOps.has(op)||op==='assistant.impact')check(m.role==='owner','Workspace owner required',403)
      else if(!memberOps.has(op)&&!assistantReads.has(op))check(m.role!=='reader','Read-only workspace access',403)
      if(!write){
        switch(op){
          case 'assistant.workspaces':return {workspace:w,workspaces:(await q('SELECT w.id,w.title,w.owner_id,m.role,w.paid_until,w.suspended FROM pipeline.workspace w JOIN pipeline.member m ON m.workspace_id=w.id WHERE m.user_id=$1 ORDER BY w.id',[user.id])).filter(row=>row.role==='owner'||paid(row)).map(row=>({id:row.id,title:assistantTitle(row,user),role:row.role}))}
          case 'assistant.read':return readRows(q,m,input)
          case 'assistant.schema':return definitions(m,input.table,input.archived,input.knownRevision)
          case 'assistant.impact':return impact(q,m,input.id)
          case 'assistant.views':return listViews(q,m,input)
          case 'assistant.view':return readView(q,m,input)
          case 'assistant.prepare':return prepareView(q,m,input)
          case 'assistant.design':return {workspace:w,title:assistantTitle(m,user),tabs:m.tabs,accent:m.accent,revision:m.revision}
          case 'assistant.open':{
            const tab=['Updates','Digest'].includes(input.tab)?'Overview':input.tab||'Overview'
            const base={workspace:w,role:m.role,revision:m.revision,tab,accent:m.accent,canInvite:m.role==='owner'&&Boolean(paid(m)),title:assistantTitle(m,user),tabs:m.tabs}
            if(input.view)return {...base,url:link(w,{view:input.view}),view:await readView(q,m,{id:input.view,content:true})}
            if(tab==='Custom views')return {...base,url:link(w,{tab}),...await listViews(q,m,input)}
            const plans=['Program','Milestone','Activity','Decision']
            const defaults={Timeline:{table:'Activity',kinds:plans,fields:['name','start','end','status'],order:'start'},Milestones:{table:'Milestone',kinds:plans,fields:['name','end','status','risk'],order:'end'}}
            const query=input.query??defaults[tab]??{table:({Milestones:'Milestone',Timeline:'Activity',Deliverables:'Deliverable',Risks:'Risk',Changes:'Change'})[tab]||'Program'}
            return {...base,url:link(w,{tab,...input.query?.table&&{table:query.table},...query.id&&{record:query.id}}),data:await readRows(q,m,query)}
          }
          case 'bootstrap': {
            const rows=await q('SELECT '+itemBody+' AS body FROM pipeline.item WHERE workspace_id=$1 ORDER BY id',[w])
            const memberships=await q('SELECT w.id,w.title,m.role,w.paid_until,w.suspended FROM pipeline.workspace w JOIN pipeline.member m ON w.id=m.workspace_id WHERE m.user_id=$1 ORDER BY w.title,w.id',[user.id])
            return {...visible(m),revision:m.revision,workspace:w,workspaces:memberships.filter(x=>x.role==='owner'||paid(x)).map(visible),
              user:{id:user.id,name:person(user),email:user.email,...fromWorkspace&&{firstName:user.firstName||'',lastName:user.lastName||'',organization:user.organization||''}},settings:{...defaultSettings,...m.settings},preferences:m.preferences,
              billing:m.role==='owner'?{customer:Boolean(m.customer),paidThrough:m.paid_until}:undefined,items:rows.map(x=>x.body),tabs:m.tabs,accent:m.accent,views:await viewList(q,w)}
          }
          case 'records.read': {
            const term=String(input.search??'').trim().slice(0,240),kind=String(input.type??'');
            const id=String(input.id??''),offset=Number(input.offset??0),limit=Number(input.limit??25);
            check(Number.isSafeInteger(offset)&&offset>=0&&Number.isInteger(limit)&&limit>0&&limit<=100,'Invalid page')
            const where="workspace_id=$1 AND ($2::text='' OR id=$2) AND ($3::text='' OR kind=$3) AND ($4::text='' OR position(lower($4) in lower(body->>'name'))>0)"
            const params=[w,id,kind,term]
            const total=await one(q,'SELECT count(*)::int AS n FROM pipeline.item WHERE '+where,params)
            const rows=await q('SELECT '+itemBody+' AS body FROM pipeline.item WHERE '+where+' ORDER BY id LIMIT $5 OFFSET $6',[...params,limit,offset])
            const fields=['id','type','name','status','risk','start','end','owner','budget','parents','deps','example']
            const memberships=await q('SELECT w.id,w.title,m.role,w.paid_until,w.suspended FROM pipeline.workspace w JOIN pipeline.member m ON w.id=m.workspace_id WHERE m.user_id=$1 ORDER BY w.title,w.id',[user.id])
            return {workspace:w,revision:m.revision,role:m.role,title:m.title,tabs:m.tabs,accent:m.accent,
              total:total.n,views:await viewList(q,w),workspaces:memberships.filter(x=>x.role==='owner'||paid(x)).map(visible),
              records:rows.map(({body})=>id?body:Object.fromEntries(fields.filter(k=>k in body).map(k=>[k,body[k]])))}
          }
          case 'view.read': {
            check(uuid(input.id),'Invalid view')
            const view=await one(q,'SELECT id,title,filters,chart,presentation FROM pipeline.view WHERE workspace_id=$1 AND id=$2',[w,input.id])
            check(view,'View unavailable',404);return view
          }
          case 'view.list':return input.knownRevision===m.revision?{revision:m.revision}:{revision:m.revision,views:await viewList(q,w)}
          case 'logs':{
            const before=String(input.before||'9223372036854775807');const query=String(input.search??'').trim().slice(0,200)
            check(/^\d{1,19}$/.test(before),'Invalid cursor')
            return {entries:await q("SELECT id::text AS id,actor_name,source,action,target,details,happened_at FROM pipeline.audit WHERE workspace_id=$1 AND id<$2::bigint AND ($3::text='' OR position(lower($3) in lower(concat_ws(' ',actor_name,source,action,target,details->>'title',details->'after'->>'name',details->'before'->>'name')))>0) ORDER BY pipeline.audit.id DESC LIMIT 50",[w,before,query])}
          }
          case 'attachment.get':{
            check(key(input.item)&&key(input.id),'Invalid attachment')
            const file=await one(q,'SELECT content FROM pipeline.file WHERE workspace_id=$1 AND item_id=$2 AND id=$3',[w,input.item,input.id]);check(file,'File unavailable',404);return file
          }
          case 'team.list':return {members:await q('SELECT user_id,email,display_name,role FROM pipeline.member WHERE workspace_id=$1 ORDER BY email',[w]),invitations:await q('SELECT id,email,role,expires FROM pipeline.invitation WHERE workspace_id=$1 AND expires>now() ORDER BY email',[w])}
          case 'billing.checkout':case 'billing.portal':check(billing,'Billing unavailable',503);return billing(q,m,user,op)
          default:check(false,'Unknown operation')
        }
      }
      check(uuid(request.requestId),'A write request ID is required')
      const fingerprint=hash(json([op,input,request.revision]))
      const previous=await one(q,'SELECT digest,result FROM pipeline.receipt WHERE workspace_id=$1 AND actor=$2 AND key=$3',[w,user.id,request.requestId])
      if(previous){check(previous.digest===fingerprint,'Request ID already used',409);return previous.result}
      const versioned=assistantWrites.has(op)||['examples.remove','items.save','design.save','settings.save','view.save','view.remove'].includes(op)
      const viewScoped=op==='view.remove'&&input.version!==undefined
      if(versioned&&!viewScoped)check(request.revision===m.revision,'Workspace changed. Reload before saving.',409)
      let result={}
      if(assistantWrites.has(op)){
        if(schemaOps.has(op))result=await changeDefinition(q,m,op,input)
        else if(op.startsWith('assistant.row.'))result=await changeRow(q,m,user,source,op.split('.').at(-1),input,saveItems)
        else if(op==='assistant.state')result=await saveState(q,m,input)
        else result=await saveView(q,m,user,op.split('.').at(-1),input)
        await audit(q,w,user,source,op,result.id,{table:input.table,changed:Object.keys(input.changes??input.values??{})})
      }else switch(op){
        case 'examples.remove':{
          const {removed,kept}=await removeExamples(q,w,input.scope)
          await audit(q,w,user,source,op,w,{scope:input.scope,removed,kept})
          result={removed:removed.length,kept:kept.length};break
        }
        case 'items.save':await saveItems(q,w,user,source,input,m);break
        case 'preferences.save':{
          check(Object.entries(input).every(([k,v])=>noticeKeys.includes(k)&&typeof v==='boolean'),'Invalid notification preference')
          await q('UPDATE pipeline.member SET preferences=$3 WHERE workspace_id=$1 AND user_id=$2',[w,user.id,json(input)]);break
        }
        case 'settings.save':{
          const value=settings(input)
          await q('UPDATE pipeline.workspace SET settings=$2 WHERE id=$1',[w,json(value)])
          await audit(q,w,user,source,op,w,{before:m.settings,after:value});break
        }
        case 'view.save':{
          check(source==='ChatGPT'||source==='Claude','Create and edit custom views in ChatGPT or Claude',403)
          check(title(input.title),'Name the view');const id=input.id||randomUUID();check(uuid(id),'Invalid view ID')
          const old=await one(q,'SELECT * FROM pipeline.view WHERE workspace_id=$1 AND id=$2',[w,id])
          check(!old||old.author===user.id||m.role==='owner','Only the author or owner can edit this view',403)
          const value=filters(input.filters);const chart=input.chart||'';check(['','status','type','owner'].includes(chart),'Invalid chart grouping')
          const presentation=input.presentation??old?.presentation??''
          check(typeof presentation==='string'&&Buffer.byteLength(presentation)<=200_000,'Custom view exceeds 200 KB')
          await q('INSERT INTO pipeline.view(workspace_id,id,author,author_name,title,filters,chart,presentation) VALUES($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT(workspace_id,id) DO UPDATE SET title=excluded.title, filters=excluded.filters, chart=excluded.chart,presentation=excluded.presentation,version=pipeline.view.version+1',[w,id,user.id,person(user),input.title,json(value),chart,presentation])
          await audit(q,w,user,source,op,id,{title:input.title,filters:value});result={id};break
        }
        case 'view.remove':{
          check(uuid(input.id),'Invalid view')
          const view=await one(q,'SELECT title,version,author FROM pipeline.view WHERE workspace_id=$1 AND id=$2 FOR UPDATE',[w,input.id])
          check(view,'This view has already been removed.',404)
          check(view.author===user.id||m.role==='owner','Only the author or workspace owner can remove this view.',403)
          if(viewScoped)check(Number.isSafeInteger(input.version)&&view.version===input.version,'This view changed. Review its latest version before removing it.',409)
          const pins=m.tabs.filter(t=>t.view===input.id)
          if(pins.length){
            check(m.role==='owner'&&input.removePins===true,'This view is pinned. The workspace owner must confirm removal of its navigation tab.',409)
            await q('UPDATE pipeline.workspace SET tabs=$2 WHERE id=$1',[w,json(m.tabs.filter(t=>t.view!==input.id))])
          }
          await q('DELETE FROM pipeline.view WHERE workspace_id=$1 AND id=$2',[w,input.id])
          await audit(q,w,user,source,op,input.id,{title:view.title,pins:pins.map(t=>t.id)});break
        }
        case 'design.save':{
          check(title(input.title)&&/^#[0-9a-f]{6}$/i.test(input.accent)&&Array.isArray(input.tabs),'Invalid design')
          const views=await viewList(q,w),ids=new Set()
          for(const t of input.tabs){
            const id=t.builtin||t.id
            const valid=t.builtin?['Overview','Milestones','Timeline','Deliverables','Risks','Changes','Custom views'].includes(t.builtin):uuid(t.id)&&views.some(v=>v.id===t.view)
            check(valid&&!ids.has(id)&&title(t.label),'Invalid tab');ids.add(id)
          }
          await q('UPDATE pipeline.workspace SET title=$2,accent=$3,tabs=$4 WHERE id=$1',[w,input.title,input.accent,json(input.tabs)])
          await audit(q,w,user,source,op,w,{before:{title:m.title,accent:m.accent,tabs:m.tabs},after:input});break
        }
        case 'team.invite':{
          check(paid(m),source==='ChatGPT'?'Invitations are unavailable in this workspace':'Pipeline Team subscription required',source==='ChatGPT'?403:402)
          const email=String(input.email??'').trim().toLowerCase()
          check(email.length<=254&&/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)&&['editor','reader'].includes(input.role),'Enter an email and role')
          check(!(await one(q,'SELECT 1 FROM pipeline.member WHERE workspace_id=$1 AND email=$2',[w,email])),'Already a member',409)
          await q('DELETE FROM pipeline.invitation WHERE workspace_id=$1 AND email=$2',[w,email])
          const token=randomBytes(32).toString('base64url'),id=randomUUID()
          await q("INSERT INTO pipeline.invitation VALUES($1,$2,$3,$4,$5,now()+interval '7 days')",[id,w,email,input.role,hash(token)])
          await q('INSERT INTO pipeline.mail(id,workspace_id,recipient,subject,message,dedupe,invitation_id) VALUES($1,$2,$3,$4,$5,$6,$7)',[randomUUID(),w,email,'Join '+m.title,person(user)+' invited you to Pipeline. Open '+origin+'/?invite='+token+' to accept within seven days.',id,id])
          await audit(q,w,user,source,op,id,{email,role:input.role});break
        }
        case 'team.revoke':{
          check(uuid(input.id),'Invalid invitation')
          await q('DELETE FROM pipeline.invitation WHERE workspace_id=$1 AND id=$2',[w,input.id]);await audit(q,w,user,source,op,input.id);break
        }
        case 'team.member':{
          check(['editor','reader','remove'].includes(input.role),'Invalid role')
          const target=await one(q,'SELECT role FROM pipeline.member WHERE workspace_id=$1 AND user_id=$2',[w,input.user])
          check(target&&target.role!=='owner','Select an invited member')
          if(input.role==='remove')await q('DELETE FROM pipeline.member WHERE workspace_id=$1 AND user_id=$2',[w,input.user])
          else await q('UPDATE pipeline.member SET role=$3 WHERE workspace_id=$1 AND user_id=$2',[w,input.user,input.role])
          await audit(q,w,user,source,op,input.user,{before:target.role,after:input.role});break
        }
      }
      if(versioned){await q('UPDATE pipeline.workspace SET revision=revision+1 WHERE id=$1',[w]);result.revision=m.revision+1}
      await q('INSERT INTO pipeline.receipt VALUES($1,$2,$3,$4,$5)',[w,user.id,request.requestId,fingerprint,json(result)])
      return result
    })
  }
}
async function accept(q,u,input,source){
  check(typeof input.token==='string' && /^[\w-]{43}$/.test(input.token),'Invalid invitation')
  const lookup=await one(q,'SELECT workspace_id FROM pipeline.invitation WHERE digest=$1',[hash(input.token)])
  if(!lookup){
    const receipt=await one(q,'SELECT workspace_id FROM pipeline.accepted_invitation WHERE digest=$1 AND user_id=$2 AND expires>now()',[hash(input.token),u.id])
    check(receipt,'Invitation expired or revoked',410)
    await membership(q,receipt.workspace_id,u);return {workspace:receipt.workspace_id}
  }
  const w=lookup.workspace_id,m=await one(q,'SELECT * FROM pipeline.workspace WHERE id=$1 FOR UPDATE',[w])
  check(paid(m),'Team subscription required',402)
  const inv=await one(q,'DELETE FROM pipeline.invitation WHERE digest=$1 AND lower(email)=lower($2) AND expires>now() RETURNING *',[hash(input.token),u.email])
  check(inv,'Sign in with the invited email or request a fresh invitation',403)
  await q('INSERT INTO pipeline.member(workspace_id,user_id,email,display_name,role) VALUES($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING',[w,u.id,u.email.toLowerCase(),person(u),inv.role])
  await q('INSERT INTO pipeline.accepted_invitation VALUES($1,$2,$3,$4)',[hash(input.token),w,u.id,inv.expires])
  await audit(q,w,u,source,'team.join',u.id,{role:inv.role});return {workspace:w}
}
async function saveItems(q,w,u,source,input,m){
  const {upsert=[],remove=[]}=structuredClone(input)
  check(Array.isArray(upsert)&&Array.isArray(remove)&&upsert.length+remove.length<=1000&&remove.every(key),'Invalid change set')
  const old=new Map((await q('SELECT id,'+itemBody+' AS body FROM pipeline.item WHERE workspace_id=$1',[w])).map(x=>[x.id,x.body]))
  const next=new Map(old), touched=new Set()
  for(const id of remove){check(old.has(id),'Record no longer exists',409);next.delete(id);touched.add(id)}
  for(const r of upsert){
    check(r && key(r.id)&&!touched.has(r.id),'Duplicate or invalid record');touched.add(r.id)
    const was=old.get(r.id);check(!was||r.type===was.type,'Record type cannot change')
    if(r.type!=='Organization'){
      if(was?.ownerId && was.owner===r.owner)r.ownerId=was.ownerId
      else if(r.owner){const matched=await q('SELECT user_id FROM pipeline.member WHERE workspace_id=$1 AND (display_name=$2 OR lower(email)=lower($2))',[w,r.owner]);r.ownerId=matched.length===1?matched[0].user_id:null}
      else r.ownerId=null
    }
    if(r.type!=='Organization' && r.status==='Completed' && was?.status!=='Completed'){
      check(r.ownerId===u.id && (!was?.ownerId || was.ownerId===u.id) && [undefined,u.id].includes(r.approved?.userId),'The assigned record owner must approve completion',403)
      r.approved={by:person(u),userId:u.id,date:new Date().toISOString()}
    }else if(was?.approved && r.status==='Completed')r.approved=was.approved
    else delete r.approved
    delete r.example
    if(was?.example){
      // Derived risk changes can accompany an unrelated edit in the planner.
      const original={...was};delete original.example
      if(!['Risk','Change','Deliverable','Organization'].includes(r.type))original.risk=r.risk
      if(isDeepStrictEqual(original,r))r.example=true
    }
    next.set(r.id,r)
  }
  validatePortfolio([...next.values()])
  if(source==='ChatGPT'){
    const all=[...next.values()],exposure=riskExposure(all)
    const deliverables=new Set(all.filter(r=>r.type==='Deliverable').flatMap(r=>r.parents))
    for(const record of all){
      if(!['Activity','Program','Milestone','Decision'].includes(record.type))continue
      const risk=riskLevel(exposure.get(record.id))
      let status=record.status
      if(deliverables.has(record.id)&&!['Completed','Cancelled','On hold'].includes(status)){
        const missing=record.deps.filter(d=>{const other=next.get(d.id);return other?.status!=='Completed'||other.type==='Decision'&&(other.decisionResult||'Approved')!==(d.outcome==='Complete'?'Approved':d.outcome||'Approved')})
        status=missing.length&&missing.every(d=>next.get(d.id)?.type==='Decision')?'Pending':missing.some(d=>d.to==='start')?'Planned':'In progress'
      }
      if(record.risk===risk&&record.status===status)continue
      const changed={...record,risk,status};next.set(record.id,changed);touched.add(record.id)
    }
  }
  for(const r of upsert){
    if(r.status==='Completed'&&old.get(r.id)?.status!=='Completed')check(r.deps.every(d=>next.get(d.id)?.status==='Completed'&&(next.get(d.id)?.type!=='Decision'||(next.get(d.id)?.decisionResult||'Approved')===(d.outcome||'Approved'))),'Resolve required dependencies before approval')
  }
  for(const id of touched){
    const r=next.get(id),was=old.get(id)
    if(r){
      const files=[]
      for(const file of r.files??[]){
        if(file.url){const id=hash(file.url);files.push({id,name:file.name,content:file.url})}
        else {check(was?.files?.some(f=>f.id===file.id),'Unknown attachment');files.push({id:file.id,name:file.name})}
      }
      if(r.files)r.files=files.map(({id,name})=>({id,name}))
      const {example,...body}=r
      await q('INSERT INTO pipeline.item(workspace_id,id,kind,body,is_example) VALUES($1,$2,$3,$4,$5) ON CONFLICT(workspace_id,id) DO UPDATE SET body=excluded.body,is_example=excluded.is_example',[w,id,r.type,json(body),example===true])
      for(const f of files)if(f.content)await q('INSERT INTO pipeline.file VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING',[w,id,f.id,f.content])
      for(const f of was?.files??[])if(!files.some(v=>v.id===f.id))await q('DELETE FROM pipeline.file WHERE workspace_id=$1 AND item_id=$2 AND id=$3',[w,id,f.id])
    }else await q('DELETE FROM pipeline.item WHERE workspace_id=$1 AND id=$2',[w,id])
    await audit(q,w,u,source,r?(was?'record.updated':'record.created'):'record.deleted',id,{before:safeItem(was),after:safeItem(r),attachments:r?.files?.map(f=>f.name),approval:r?.approved})
    if(!r?.example&&(source!=='ChatGPT'||!r||upsert.some(changed=>changed.id===id)))await scheduleMail(q,w,m,r,was,next)
  }
}
async function scheduleMail(q,w,m,r,was,items){
  const prefix='deadline:'+w+':'+(r?.id??was.id)+':'
  await q('DELETE FROM pipeline.mail WHERE left(dedupe,length($1))=$1 AND sent_at IS NULL',[prefix])
  if(!r)return
  const queue=async(category,owner,dedupe,due)=>{
    if(!owner)return
    const rows=await q('SELECT email,preferences,role FROM pipeline.member WHERE workspace_id=$1 AND (email=$2 OR display_name=$2)',[w,owner])
    if(rows.length!==1 || rows[0].preferences[category]===false)return
    await q('INSERT INTO pipeline.mail(id,workspace_id,recipient,subject,message,dedupe,category,due_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT(dedupe) DO NOTHING',[randomUUID(),w,rows[0].email,'Pipeline · '+category,r.name+' in '+m.title,dedupe,category,due??new Date()])
  }
  if(r.owner!==was?.owner)await queue('assignment',r.owner,randomUUID())
  if(r.end && !['Completed','Cancelled'].includes(r.status))await queue('deadline',r.owner,prefix+r.end+':'+r.owner,new Date(Date.parse(r.end)-86400000*(m.settings.days??7)))
  const category={Deliverable:'deliverable',Risk:'risk',Change:'change'}[r.type]
  if(category)for(const id of r.parents??[]){
    const target=items.get(id);await queue(category,target?.owner,randomUUID())
    if(category==='deliverable' && target?.deps?.every(d=>items.get(d.id)?.status==='Completed'))await queue('review',target.owner,randomUUID())
  }
}

import {createHash,randomBytes,randomUUID} from 'node:crypto'
import {check,uuid,key,title,filters,settings,validatePortfolio,noticeKeys} from './rules.mjs'

const hash = value => createHash('sha256').update(value).digest('hex')
const json = JSON.stringify
const paid = row => !row.suspended && row.paid_until && new Date(row.paid_until)>new Date()
const person = u => [u.firstName,u.lastName].filter(Boolean).join(' ') || u.email
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
  return m
}
async function ensureHome(q,u){
  const inserted=await one(q,'INSERT INTO pipeline.workspace(id,owner_id,title) VALUES($1,$2,$3) ON CONFLICT(owner_id) DO NOTHING RETURNING id',[randomUUID(),u.id,person(u)+' workspace'])
  if(inserted){
    await q("INSERT INTO pipeline.member(workspace_id,user_id,email,display_name,role) VALUES($1,$2,$3,$4,'owner')",[inserted.id,u.id,u.email.toLowerCase(),person(u)])
    await audit(q,inserted.id,u,'web','workspace.created',inserted.id)
  }
  return inserted?.id??(await one(q,'SELECT id FROM pipeline.workspace WHERE owner_id=$1',[u.id])).id
}
async function viewList(q,w){
  return q('SELECT id,title,filters,chart,author,author_name,created_at FROM pipeline.view WHERE workspace_id=$1 ORDER BY created_at DESC,id',[w])
}
const writeOps=new Set(['items.save','settings.save','preferences.save','view.save','view.remove','design.save','team.invite','team.revoke','team.member'])
const ownerOps=new Set(['settings.save','design.save','team.invite','team.revoke','team.member','team.list','billing.checkout','billing.portal'])
const memberOps=new Set(['bootstrap','logs','attachment.get','preferences.save','view.list'])
const defaultSettings={currency:'EUR',dateFormat:'short',window:90,days:7}
export function pipeline(db,{origin='https://pipeline.trialagents.com',billing}={}){
  return async function execute(user,request,source='web'){
    check(user?.id&&user.email,'Sign in to Pipeline',401)
    check(request && typeof request.op==='string','Invalid request')
    const {op,input={}}=request
    return db.transaction(async q=>{
      if(op==='team.accept')return accept(q,user,input,source)
      const w=request.workspace || (op==='bootstrap' && await ensureHome(q,user))
      const write=writeOps.has(op)
      const m=await membership(q,w,user,write||op.startsWith('billing.'))
      if(ownerOps.has(op))check(m.role==='owner','Workspace owner required',403)
      else if(!memberOps.has(op))check(m.role!=='reader','Read-only workspace access',403)
      if(!write){
        switch(op){
          case 'bootstrap': {
            const rows=await q('SELECT body FROM pipeline.item WHERE workspace_id=$1 ORDER BY id',[w])
            const memberships=await q('SELECT w.id,w.title,m.role,w.paid_until,w.suspended FROM pipeline.workspace w JOIN pipeline.member m ON w.id=m.workspace_id WHERE m.user_id=$1 ORDER BY w.title,w.id',[user.id])
            return {...visible(m),revision:m.revision,workspace:w,workspaces:memberships.filter(x=>x.role==='owner'||paid(x)).map(visible),
              user:{id:user.id,name:person(user),email:user.email},settings:{...defaultSettings,...m.settings},preferences:m.preferences,
              items:rows.map(x=>x.body),tabs:m.tabs,accent:m.accent,views:await viewList(q,w)}
          }
          case 'view.list':return {views:await viewList(q,w)}
          case 'logs':{
            const before=String(input.before||'9223372036854775807')
            check(/^\d{1,19}$/.test(before),'Invalid cursor')
            return {entries:await q('SELECT id::text AS id,actor_name,source,action,target,details,happened_at FROM pipeline.audit WHERE workspace_id=$1 AND id<$2::bigint ORDER BY pipeline.audit.id DESC LIMIT 50',[w,before])}
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
      const versioned=['items.save','design.save','settings.save','view.save','view.remove'].includes(op)
      if(versioned)check(request.revision===m.revision,'Workspace changed. Reload before saving.',409)
      let result={}
      switch(op){
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
          check(title(input.title),'Name the view');const id=input.id||randomUUID();check(uuid(id),'Invalid view ID')
          const old=await one(q,'SELECT * FROM pipeline.view WHERE workspace_id=$1 AND id=$2',[w,id])
          check(!old||old.author===user.id||m.role==='owner','Only the author or owner can edit this view',403)
          const value=filters(input.filters);const chart=input.chart||'';check(['','status','type','owner'].includes(chart),'Invalid chart grouping')
          await q('INSERT INTO pipeline.view(workspace_id,id,author,author_name,title,filters,chart) VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(workspace_id,id) DO UPDATE SET title=excluded.title, filters=excluded.filters, chart=excluded.chart',[w,id,user.id,person(user),input.title,json(value),chart])
          await audit(q,w,user,source,op,id,{title:input.title,filters:value});result={id};break
        }
        case 'view.remove':{
          check(uuid(input.id),'Invalid view');check(!m.tabs.some(t=>t.view===input.id),'Remove this navigation tab first',409)
          const old=await one(q,"DELETE FROM pipeline.view WHERE workspace_id=$1 AND id=$2 AND (author=$3 OR $4='owner') RETURNING title",[w,input.id,user.id,m.role])
          check(old,'View unavailable',403);await audit(q,w,user,source,op,input.id,old);break
        }
        case 'design.save':{
          check(title(input.title)&&/^#[0-9a-f]{6}$/i.test(input.accent)&&Array.isArray(input.tabs),'Invalid design')
          const views=await viewList(q,w),ids=new Set()
          for(const t of input.tabs){
            const id=t.builtin||t.id
            const valid=t.builtin?['Overview','Milestones','Timeline','Deliverables','Risks','Changes','Updates','Custom views'].includes(t.builtin):uuid(t.id)&&views.some(v=>v.id===t.view)
            check(valid&&!ids.has(id)&&title(t.label),'Invalid tab');ids.add(id)
          }
          await q('UPDATE pipeline.workspace SET title=$2,accent=$3,tabs=$4 WHERE id=$1',[w,input.title,input.accent,json(input.tabs)])
          await audit(q,w,user,source,op,w,{before:{title:m.title,accent:m.accent,tabs:m.tabs},after:input});break
        }
        case 'team.invite':{
          check(paid(m),'Pipeline Team subscription required',402)
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
  check(lookup,'Invitation expired or already accepted',410)
  const w=lookup.workspace_id,m=await one(q,'SELECT * FROM pipeline.workspace WHERE id=$1 FOR UPDATE',[w])
  check(paid(m),'Team subscription required',402)
  const inv=await one(q,'DELETE FROM pipeline.invitation WHERE digest=$1 AND lower(email)=lower($2) AND expires>now() RETURNING *',[hash(input.token),u.email])
  check(inv,'Sign in with the invited email or request a fresh invitation',403)
  await q('INSERT INTO pipeline.member(workspace_id,user_id,email,display_name,role) VALUES($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING',[w,u.id,u.email.toLowerCase(),person(u),inv.role])
  await audit(q,w,u,source,'team.join',u.id,{role:inv.role});return {workspace:w}
}
async function saveItems(q,w,u,source,input,m){
  const {upsert=[],remove=[]}=input
  check(Array.isArray(upsert)&&Array.isArray(remove)&&upsert.length+remove.length<=1000&&remove.every(key),'Invalid change set')
  const old=new Map((await q('SELECT id,body FROM pipeline.item WHERE workspace_id=$1',[w])).map(x=>[x.id,x.body]))
  const next=new Map(old), touched=new Set()
  for(const id of remove){check(old.has(id),'Record no longer exists',409);next.delete(id);touched.add(id)}
  for(const r of upsert){
    check(r && key(r.id)&&!touched.has(r.id),'Duplicate or invalid record');touched.add(r.id)
    const was=old.get(r.id);check(!was||r.type===was.type,'Record type cannot change')
    if(r.type!=='Organization' && r.status==='Completed' && was?.status!=='Completed'){
      check(r.owner && [u.email,person(u)].includes(r.owner) && [undefined,u.id].includes(r.approved?.userId),'The assigned record owner must approve completion',403)
      r.approved={by:person(u),userId:u.id,date:new Date().toISOString()}
    }else if(was?.approved && r.status==='Completed')r.approved=was.approved
    else delete r.approved
    next.set(r.id,r)
  }
  validatePortfolio([...next.values()])
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
      await q('INSERT INTO pipeline.item VALUES($1,$2,$3,$4) ON CONFLICT(workspace_id,id) DO UPDATE SET body=excluded.body',[w,id,r.type,json(r)])
      for(const f of files)if(f.content)await q('INSERT INTO pipeline.file VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING',[w,id,f.id,f.content])
      for(const f of was?.files??[])if(!files.some(v=>v.id===f.id))await q('DELETE FROM pipeline.file WHERE workspace_id=$1 AND item_id=$2 AND id=$3',[w,id,f.id])
    }else await q('DELETE FROM pipeline.item WHERE workspace_id=$1 AND id=$2',[w,id])
    await audit(q,w,u,source,r?(was?'record.updated':'record.created'):'record.deleted',id,{before:safeItem(was),after:safeItem(r),attachments:r?.files?.map(f=>f.name),approval:r?.approved})
    await scheduleMail(q,w,m,r,was,next)
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

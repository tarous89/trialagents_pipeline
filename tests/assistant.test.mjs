import test from 'node:test'
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {randomUUID} from 'node:crypto'
import {gzipSync} from 'node:zlib'
import {PGlite} from '@electric-sql/pglite'
import {pipeline} from '../app/server/store.mjs'

test('ChatGPT scoped reads, database roles, linked queries, save recovery and reversible archive',async t=>{
 const pg=new PGlite();t.after(()=>pg.close());await pg.exec(await readFile('app/server/schema.sql','utf8'))
 const run=pipeline({transaction:fn=>pg.transaction(tx=>fn(async(s,p)=>(await tx.query(s,p)).rows))})
 const user={id:'primary',email:'private@example.invalid'},editor={id:'editor',email:'editor@example.invalid'},reader={id:'reader',email:'reader@example.invalid'}
 let workspace,revision=0
 const req=(op,input={},id=randomUUID())=>({workspace,revision,op,input,requestId:id})
 const act=(op,input={},u=user)=>run(u,req(op,input),'ChatGPT')
 const write=async(op,input,u)=>{const r=await act(op,input,u);revision=r.revision;return r}
 await assert.rejects(act('assistant.open'),{status:409})
 assert.equal((await pg.query('SELECT count(*) AS n FROM pipeline.workspace')).rows[0].n,0)
 workspace=(await run(user,{op:'home.ensure'},'consent')).workspace
 const counts=async()=>(await pg.query('SELECT (SELECT count(*) FROM pipeline.item) AS records,(SELECT count(*) FROM pipeline.audit) AS events,(SELECT count(*) FROM pipeline.mail) AS mail')).rows[0]
 const before=await counts()
 const first=await act('assistant.open',{query:{table:'Milestone',programSearch:'EX-101',fields:['name','end'],order:'end',limit:1}});await act('assistant.open')
 assert.equal(first.data.records[0].values.name,'Site readiness review')
 const changed=await pg.query("SELECT body->'forecasts'->$2->>'end' AS finish FROM pipeline.item WHERE workspace_id=$1 AND kind='Change'",[workspace,first.data.records[0].id])
 assert.equal(first.data.records[0].values.end,changed.rows[0].finish)
 assert.deepEqual(Object.keys(first.data.records[0].values).sort(),['end','name'])
 assert.doesNotMatch(JSON.stringify(first),/@|contacts|Site coordinator|billing|Example Clinical Partners|subscription|Site contract review/)
 assert.deepEqual(await counts(),before)
 for(const op of ['bootstrap','team.list','billing.checkout','items.save','home.ensure'])await assert.rejects(act(op),{status:403})
 await assert.rejects(act('team.invite',{email:editor.email,role:'editor'}),{status:403})
 await assert.rejects(act('schema.table.add',{label:'Patient identifiers'}),{status:400})
 const foreign=(await run({id:'foreign',email:'foreign@example.invalid'},{op:'home.ensure'},'consent')).workspace
 await assert.rejects(run(user,{...req('assistant.read'),workspace:foreign},'ChatGPT'),{status:403})
 await pg.query("UPDATE pipeline.workspace SET paid_until=now()+interval '1 month' WHERE id=$1",[workspace])
 for(const [u,role] of [[editor,'editor'],[reader,'reader']])await pg.query('INSERT INTO pipeline.member(workspace_id,user_id,email,display_name,role) VALUES($1,$2,$3,$2,$4)',[workspace,u.id,u.email,role])
 const definition=req('schema.table.add',{label:'Committees',columns:[{label:'Legacy code',type:'text'}]})
 const table=await run(user,definition,'ChatGPT');revision=table.revision
 assert.deepEqual(await run(user,definition,'ChatGPT'),table)
 await assert.rejects(run(editor,definition,'ChatGPT'),{status:403})
 await assert.rejects(act('assistant.row.create',{table:table.id,values:{name:'No'}},reader),{status:403})
 const code=table.added[0].id
 const committee=await write('assistant.row.create',{table:table.id,values:{name:'Review board',[code]:'Z17'}},editor)
 const rel=await write('schema.relationship.add',{table:'Decision',target:table.id,label:'Committee',inverse:'Decisions',cardinality:'many-to-one'})
 const decision=(await act('assistant.read',{table:'Decision',fields:['name']})).records[0]
 await write('assistant.row.update',{table:'Decision',id:decision.id,values:{[rel.id]:[committee.id]}},editor)
 const linked=await act('assistant.read',{table:table.id,fields:['name',rel.id]})
 assert.equal(linked.records[0].values[rel.id][0].id,decision.id)
 assert.equal((await act('assistant.read',{table:'Decision',group:rel.id})).groups[0].count,1)
 const query={table:table.id,fields:['name',code,rel.id]}
 const request=req('assistant.view.create',{title:'Decisions by committee',query,renderer:'live'})
 const receipt=await run(editor,request,'ChatGPT');revision=receipt.revision
 const recovered=await run(editor,{...request,op:'assistant.view.retry',input:{}},'ChatGPT')
 assert.deepEqual(receipt,recovered)
 const view=await act('assistant.view',{id:receipt.id,content:true},reader)
 assert.equal(view.hash,receipt.hash);assert.equal(view.data.records[0].values[code],'Z17')
 await assert.rejects(act('schema.column.archive',{id:'name'}),{status:400})
 assert.equal((await act('assistant.impact',{id:code})).views[0].id,receipt.id)
 await assert.rejects(act('schema.column.archive',{id:code}),{status:409})
 await write('schema.column.archive',{id:code,keep_unavailable:true})
 assert.equal((await act('assistant.view',{id:receipt.id})).available,false)
 await assert.rejects(act('assistant.row.update',{table:table.id,id:committee.id,values:{[code]:'Z18'}}),{status:400})
 await write('schema.column.restore',{id:code})
 assert.equal((await act('assistant.view',{id:receipt.id})).data.records[0].values[code],'Z17')
 const invalid=req('assistant.view.update',{id:view.id,version:99,title:'Wrong version',query,renderer:'live'})
 await assert.rejects(run(editor,invalid,'ChatGPT'),{status:409})
 const interactive=await write('assistant.view.update',{id:view.id,version:1,title:'Review filter',query,renderer:'interactive',presentation:'<input id="committee" data-filter>'},editor)
 assert.equal(interactive.version,2)
 await write('assistant.state',{id:view.id,version:2,state:{committee:'Review'}},editor)
 assert.deepEqual((await act('assistant.view',{id:view.id,content:true})).state,{committee:'Review'})
 await pg.query('DELETE FROM pipeline.member WHERE workspace_id=$1 AND user_id=$2',[workspace,editor.id])
 await assert.rejects(run(editor,request,'ChatGPT'),{status:403})
 for(const size of [100,10000]){
   await pg.query("INSERT INTO pipeline.item(workspace_id,id,kind,body) SELECT $1,'perf-'||n,'Program',jsonb_build_object('name','Fictional program '||n,'status','Planned') FROM generate_series(1,$2::int) AS n ON CONFLICT DO NOTHING",[workspace,size])
   const rows=await act('assistant.open');assert.equal(rows.data.records.length,20);assert.equal(rows.data.next,20);assert.ok(gzipSync(JSON.stringify(rows)).length<50000)
 }
})

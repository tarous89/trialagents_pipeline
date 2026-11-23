import {readFile} from 'node:fs/promises'
import postgres from 'postgres'
import {deliverMail} from '../app/lib/pipeline/mail.mjs'
const sql=postgres(process.env.DATABASE_URL,{max:1})
const db={transaction:fn=>sql.begin(tx=>fn((s,p)=>tx.unsafe(s,p)))}
try{
 await sql.begin(async tx=>{
   await tx`SELECT pg_advisory_xact_lock(hashtext('pipeline.schema.v1'))`
   await tx.unsafe(await readFile(new URL('../app/lib/pipeline/schema.sql',import.meta.url),'utf8')).simple()
 })
}catch(e){console.error('Pipeline schema unavailable');await sql.end();process.exit(1)}
while(true){
 try{await deliverMail(db,async job=>{
   const res=await fetch('https://api.resend.com/emails',{method:'POST',headers:{Authorization:'Bearer '+process.env.RESEND_API_KEY,'Content-Type':'application/json','Idempotency-Key':'pipeline/'+job.id},body:JSON.stringify({from:process.env.AUTH_FROM_EMAIL,to:[job.recipient],subject:job.subject,text:job.message}),signal:AbortSignal.timeout(10000)})
   if(!res.ok)throw Error('Mail unavailable')
 })}catch{console.error('Pipeline mail retry scheduled')}
 await new Promise(r=>setTimeout(r,15000))
}

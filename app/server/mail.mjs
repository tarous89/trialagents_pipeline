// The provider idempotency key ties an accepted email to its durable outbox row.
export async function deliverMail(db,send,limit=25){
  for(let i=0;i<limit;i++){
    const found=await db.transaction(async q=>{
      const [job]=await q(`SELECT j.*,w.paid_until,w.suspended FROM pipeline.mail j JOIN pipeline.workspace w ON w.id=j.workspace_id
        WHERE j.sent_at IS NULL AND j.due_at<=now() ORDER BY j.due_at,j.id LIMIT 1 FOR UPDATE OF j SKIP LOCKED`,[])
      if(!job)return false
      const team=!job.suspended && new Date(job.paid_until)>new Date()
      const [member]=await q('SELECT role,preferences FROM pipeline.member WHERE workspace_id=$1 AND email=$2',[job.workspace_id,job.recipient])
      let allowed=member&&(member.role==='owner'||team)&&member.preferences[job.category]!==false
      if(job.invitation_id){
        const inv=await q('SELECT 1 FROM pipeline.invitation WHERE id=$1 AND expires>now()',[job.invitation_id])
        allowed=team&&inv.length>0
      }
      if(!allowed){await q('DELETE FROM pipeline.mail WHERE id=$1',[job.id]);return true}
      try{
        await send(job)
        await q("UPDATE pipeline.mail SET sent_at=now(),message='' WHERE id=$1",[job.id])
      }catch{
        await q("UPDATE pipeline.mail SET attempts=attempts+1,due_at=now()+least(3600,30*(attempts+1))*interval '1 second' WHERE id=$1",[job.id])
      }
      return true
    })
    if(!found)break
  }
}

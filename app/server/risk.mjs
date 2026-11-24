// A risk affects downstream dependencies. Their parent milestones and programs inherit the risk.
export const riskLevels=['None','Low','Medium','High']
export function riskExposure(records){
  const plans=new Map(),dependents=new Map()
  for(const r of records){
    if(!['Program','Activity','Milestone','Decision'].includes(r.type))continue
    plans.set(r.id,r)
    for(const d of r.deps??[]){
      if(!dependents.has(d.id))dependents.set(d.id,[])
      dependents.get(d.id).push(r.id)
    }
  }
  const byItem=new Map()
  for(const risk of records){
    if(risk.type!=='Risk'||risk.status==='Closed')continue
    const affected=new Set(risk.parents)
    for(const id of affected)for(const next of dependents.get(id)??[])affected.add(next)
    for(const id of affected)for(const parent of plans.get(id)?.parents??[])affected.add(parent)
    for(const id of affected){
      if(!byItem.has(id))byItem.set(id,[])
      byItem.get(id).push(risk)
    }
  }
  return byItem
}
export function riskLevel(risks){
  return riskLevels[(risks??[]).reduce((level,r)=>Math.max(level,riskLevels.indexOf(r.severity)),0)]
}

import {check} from './rules.mjs'
const origin='https://pipeline.trialagents.com'
export function stripeBilling({stripeRequest,stripeMode,priceId}){
  async function api(path,form,idempotency){
    const headers=form?{'Content-Type':'application/x-www-form-urlencoded'}:{}
    if(idempotency)headers['Idempotency-Key']=idempotency
    const response=await stripeRequest(path,{method:form?'POST':'GET',headers,body:form?new URLSearchParams(form):undefined})
    check(response.ok,'Billing provider unavailable',503);return response.json()
  }
  async function checkout(q,w,u,op){
    const mode=stripeMode(),price=priceId(mode)
    check(['test','live'].includes(mode)&&price,'Pipeline billing is unavailable',503)
    check(!w.stripe_mode||w.stripe_mode===mode,'Billing environment mismatch',409)
    if(op==='billing.portal'){
      check(w.customer,'No billing account yet',409)
      return {url:(await api('/billing_portal/sessions',{customer:w.customer,return_url:origin+'/?section=Billing&workspace='+w.id})).url}
    }
    check(!w.subscription||w.suspended||new Date(w.paid_until)<new Date(),'Team is already active',409)
    const p=await api('/prices/'+encodeURIComponent(price))
    check(p.active&&p.currency==='usd'&&p.unit_amount===4900&&p.recurring?.interval==='month'&&p.recurring?.interval_count===1,'Pipeline Team price must be USD 49 monthly',503)
    let customer=w.customer
    if(!customer){
      customer=(await api('/customers',{email:u.email,'metadata[pipeline_workspace]':w.id},'pipeline-customer-'+mode+'-'+w.id)).id
      await q('UPDATE pipeline.workspace SET customer=$2,stripe_mode=$3 WHERE id=$1',[w.id,customer,mode])
    }
    if(w.checkout){
      const current=await api('/checkout/sessions/'+encodeURIComponent(w.checkout))
      if(current.status==='open')return {url:current.url}
      if(current.status==='complete'&&!w.subscription)check(false,'Payment is being confirmed. Refresh Billing shortly.',409)
    }
    const existing=await api('/subscriptions?customer='+encodeURIComponent(customer)+'&status=all&limit=100')
    check(!existing.data.some(s=>s.metadata?.pipeline_workspace===w.id&&!['canceled','incomplete_expired'].includes(s.status)),'Manage the existing subscription in Billing',409)
    const session=await api('/checkout/sessions',{mode:'subscription',customer,'line_items[0][price]':price,'line_items[0][quantity]':'1',
      'metadata[pipeline_workspace]':w.id,'subscription_data[metadata][pipeline_workspace]':w.id,
      success_url:origin+'/?section=Team&workspace='+w.id,cancel_url:origin+'/?section=Billing&workspace='+w.id},
      'pipeline-checkout-'+mode+'-'+w.id+'-'+(w.checkout??'first'))
    await q('UPDATE pipeline.workspace SET checkout=$2 WHERE id=$1',[w.id,session.id])
    return {url:session.url}
  }
  // Called only after the Intel route verifies the raw Stripe signature.
  async function webhook(db,event){
    const object=event.data?.object,w=object?.metadata?.pipeline_workspace
    if(!w)return false
    const mode=event.livemode?'live':'test'
    if(mode!==stripeMode())return true
    if(!['customer.subscription.created','customer.subscription.updated','customer.subscription.deleted','checkout.session.completed'].includes(event.type))return true
    await db.transaction(async q=>{
      const [row]=await q('SELECT * FROM pipeline.workspace WHERE id=$1 FOR UPDATE',[w])
      check(row&&row.customer===object.customer&&row.stripe_mode===mode,'Billing mapping unavailable',503)
      const seen=await q('INSERT INTO pipeline.stripe_event VALUES($1,$2) ON CONFLICT DO NOTHING RETURNING id',[mode,event.id])
      if(!seen.length)return
      const price=priceId(mode)
      const list=await api('/subscriptions?customer='+encodeURIComponent(row.customer)+'&status=all&limit=100')
      const match=list.data.filter(s=>s.metadata?.pipeline_workspace===w && s.items?.data?.some(i=>i.price?.id===price&&i.quantity===1))
      const current=match.find(s=>s.status==='active')??match[0]
      const expiry=current?.items.data.find(i=>i.price.id===price)?.current_period_end??current?.current_period_end
      const active=current?.status==='active' && expiry>Date.now()/1000
      await q('UPDATE pipeline.workspace SET subscription=$2,paid_until=$3,suspended=$4 WHERE id=$1',[w,current?.id??null,expiry?new Date(expiry*1000):null,!active])
      await q("INSERT INTO pipeline.audit(workspace_id,actor,actor_name,source,action,details) VALUES($1,'stripe','Stripe','system','billing.updated',$2)",[w,JSON.stringify({active:Boolean(active),status:current?.status??'inactive'})])
    })
    return true
  }
  return {checkout,webhook}
}

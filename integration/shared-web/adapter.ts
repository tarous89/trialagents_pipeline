import {getSql} from '@/db';
import {stripeRequest,stripeMode} from '@/app/lib/stripe';
import {pipeline} from './store.mjs';
import {stripeBilling} from './billing.mjs';
import {selectionRelay} from './selection.mjs';
import type {Listen} from './events.mjs';
export const listenWorkspace:Listen=async(channel,notify,ready)=>{
 const sql=getSql();
 const [trigger]=await sql`SELECT 1 FROM pg_trigger WHERE tgrelid='pipeline.workspace'::regclass
   AND tgname='pipeline_workspace_change' AND tgenabled IN ('O','A')`;
 if(!trigger)throw Object.assign(Error('Workspace updates are starting'),{status:503});
 const sub=await sql.listen(channel,notify,ready);
 return {unlisten:async()=>{await sub.unlisten()}};
};
export const selection=selectionRelay({
 listen:async(channel,listener)=>{
   const sub=await getSql().listen(channel,listener);
   return {unlisten:async()=>{await sub.unlisten()}};
 },
 publish:async(channel,message)=>getSql().notify(channel,message)
});
export const db={transaction:async <T>(fn:(q:(s:string,p:unknown[])=>Promise<unknown>)=>Promise<T>)=>getSql().begin(async t=>fn((s,p)=>t.unsafe(s,p as never[])))};
const billing=stripeBilling({stripeRequest,stripeMode,priceId:(mode:string)=>mode==='test'?process.env.PIPELINE_TEAM_PRICE_TEST:process.env.PIPELINE_TEAM_PRICE_LIVE});
export const runPipeline=pipeline(db,{billing:billing.checkout});
export const pipelineWebhook=(event:unknown)=>billing.webhook(db,event);

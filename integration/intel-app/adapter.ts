import {getSql} from '@/db';
import {stripeRequest,stripeMode} from '@/app/lib/stripe';
import {pipeline} from './store.mjs';
import {stripeBilling} from './billing.mjs';
export const db={transaction:async <T>(fn:(q:(s:string,p:unknown[])=>Promise<unknown>)=>Promise<T>)=>getSql().begin(async t=>fn((s,p)=>t.unsafe(s,p as never[])))};
const billing=stripeBilling({stripeRequest,stripeMode,priceId:(mode:string)=>mode==='test'?process.env.PIPELINE_TEAM_PRICE_TEST:process.env.PIPELINE_TEAM_PRICE_LIVE});
export const runPipeline=pipeline(db,{billing:billing.checkout});
export const pipelineWebhook=(event:unknown)=>billing.webhook(db,event);

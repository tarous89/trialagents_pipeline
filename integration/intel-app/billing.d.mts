import type {PipelineDb} from './types.mjs';
export function stripeBilling(options:{stripeRequest:Function;stripeMode:Function;priceId:Function}):{checkout:Function;webhook:(db:PipelineDb,event:unknown)=>Promise<boolean>};

import type {PipelineDb} from './types.mjs';
export function pipeline(db:PipelineDb,options:{billing:Function}):(user:unknown,request:unknown,source:string)=>Promise<unknown>;

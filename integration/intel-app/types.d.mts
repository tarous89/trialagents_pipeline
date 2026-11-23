export type PipelineDb={transaction:<T>(fn:(q:(sql:string,params:unknown[])=>Promise<unknown>)=>Promise<T>)=>Promise<unknown>};

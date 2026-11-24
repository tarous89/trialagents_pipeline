export function protectedResource(issuer:string,audience:string):Response;
export function pipelineHttp(config:{audience:string;readWidget:()=>Promise<string>;authorize:(token:string,audience:string)=>Promise<unknown>;run:(user:unknown,request:unknown,source:string)=>Promise<unknown>}):(request:Request)=>Promise<Response>;

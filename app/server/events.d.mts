export type Listen=(channel:string,notify:(message:string)=>void,ready:()=>void)=>Promise<{unlisten:()=>Promise<unknown>}>
export function workspaceEvents(workspace:string,signal:AbortSignal,listen:Listen,authorize:()=>Promise<unknown>):Promise<Response>

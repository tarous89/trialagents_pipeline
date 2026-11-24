export function selectionRelay(bus:{listen:(channel:string,listener:(message:string)=>void)=>Promise<{unlisten:()=>Promise<unknown>}>;publish:(channel:string,message:string)=>Promise<unknown>}):{
 wait:(scope:string[],signal?:AbortSignal)=>Promise<unknown>;answer:(scope:string[],id:string,selection:unknown)=>Promise<unknown>;ask:(scope:string[])=>Promise<unknown>
}

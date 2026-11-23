import SettingsWorkspace from '@/app/components/AccountSettings';
export default async function PipelineAccount({searchParams}:{searchParams:Promise<{tab?:string}>}){
  const {tab}=await searchParams;
  return <div className="intel-app"><SettingsWorkspace embedded pipelineSection={tab==='support'?'support':'account'}/></div>;
}

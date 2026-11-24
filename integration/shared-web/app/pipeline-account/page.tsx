import SettingsWorkspace from '@/app/components/AccountSettings';
import './settings.css';
export default async function PipelineAccount({searchParams}:{searchParams:Promise<{tab?:string}>}){
  const {tab}=await searchParams;
  return <div className="intel-app pipeline-account"><SettingsWorkspace embedded pipelineSection={tab==='support'?'support':'account'}/></div>;
}

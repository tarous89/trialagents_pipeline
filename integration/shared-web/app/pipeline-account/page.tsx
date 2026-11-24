import SettingsWorkspace from '@/app/components/AccountSettings';
import './settings.css';
export default async function PipelineAccount({searchParams}:{searchParams:Promise<{tab?:string;surface?:string}>}){
  const {tab,surface}=await searchParams;
  return <div className="intel-app pipeline-account"><SettingsWorkspace embedded pipelineFrame={surface==='chatgpt'} pipelineSection={tab==='support'?'support':'account'}/></div>;
}

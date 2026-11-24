window.pipelineLink=async url=>{
 const parsed=new URL(url);if(parsed.protocol!=='https:'||!['pipeline.trialagents.com','checkout.stripe.com','billing.stripe.com'].includes(parsed.hostname))throw Error('Invalid destination');
 location.assign(url);
};
window.pipelineTransport=async (request,signal)=>{
 const res=await fetch('/api/pipeline',{method:'POST',signal,headers:{'Content-Type':'application/json'},credentials:'same-origin',cache:'no-store',body:JSON.stringify(request)});
 if(request.op==='workspace.events')return res
 const body=await res.json();
 if(!res.ok){const e=new Error(body.error||'Request failed');e.status=res.status;throw e}
 return body;
};
(async()=>{
 const saved=sessionStorage.getItem('pipeline-return-query');
 if(saved&&!location.search){history.replaceState(null,'','/'+saved);sessionStorage.removeItem('pipeline-return-query')}
 const params=new URLSearchParams(location.search);
 const token=params.get('invite')||sessionStorage.getItem('pipeline-pending-invite');
 let workspace=params.get('workspace')||undefined;
 try{
  if(token){
    sessionStorage.setItem('pipeline-pending-invite',token);
    history.replaceState(null,'','/');
    const accepted=await window.pipelineTransport({op:'team.accept',input:{token}});
    workspace=accepted.workspace;sessionStorage.removeItem('pipeline-pending-invite');history.replaceState(null,'','/?workspace='+workspace);
  }
  await window.pipelineMount(await window.pipelineTransport({op:'bootstrap',workspace}));
 }catch(e){
  if(e.status===401){if(params.has('workspace')||params.has('section'))sessionStorage.setItem('pipeline-return-query','?'+params.toString());location.replace('/auth?mode=login&pipeline=1');return}
  const main=document.querySelector('#app');main.replaceChildren();
  const p=document.createElement('p');p.textContent=e.message;main.append(p);
  const a=document.createElement('a');a.href='/';a.textContent='Open my workspace';a.onclick=()=>sessionStorage.removeItem('pipeline-pending-invite');main.append(a);
 }
})();

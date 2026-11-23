'use client';
import {useEffect,useMemo,useRef,useState} from 'react';

/** Opaque-origin sandbox. Messages can propose local state, never authorize a write. */
export function InteractiveVisualization({html,title,state,onChange}:{html:string;title:string;state:any;onChange:(state:any)=>void}){
 const frame=useRef<HTMLIFrameElement>(null),callback=useRef(onChange);callback.current=onChange;
 const [height,setHeight]=useState(600);
 const token=useMemo(()=>crypto.randomUUID(),[html,state]);
 const source=useMemo(()=>{
  const initial=JSON.stringify(state??{}).replace(/</g,'\\u003c');
  const bridge=`<script>(()=>{let state=${initial};const send=(type,data)=>parent.postMessage({channel:'trialagents-visualization',token:'${token}',type,...data},'*');
   window.TrialAgents={getState:()=>structuredClone(state),setState:next=>{if(!next||typeof next!=='object'||Array.isArray(next))return;const raw=JSON.stringify(next);if(raw.length>200000)return;state=JSON.parse(raw);send('state',{state});}};
   document.addEventListener('submit',e=>e.preventDefault(),true);
   document.addEventListener('DOMContentLoaded',()=>{
    for(const el of document.querySelectorAll('input,select,textarea')){const key=el.id||el.name;if(!key)continue;const value=state.form?.[key];if(value!==undefined){if(el.type==='checkbox'||el.type==='radio')el.checked=!!value;else el.value=String(value);}}
    document.addEventListener('input',e=>{const el=e.target,key=el.id||el.name;if(!key||!el.matches('input,select,textarea'))return;window.TrialAgents.setState({...state,form:{...state.form,[key]:el.type==='checkbox'||el.type==='radio'?el.checked:el.value}});});
    let pending=false;const measure=()=>{if(pending)return;pending=true;requestAnimationFrame(()=>{pending=false;send('height',{height:Math.ceil(document.body.getBoundingClientRect().height)+48});});};new ResizeObserver(measure).observe(document.body);measure();
   });})();</script>`;
  return html.replace('</head>',bridge+'</head>');
 },[html,state,token]);
 useEffect(()=>{const listener=(event:MessageEvent)=>{
  if(event.source!==frame.current?.contentWindow)return;const d=event.data;
  if(!d||d.channel!=='trialagents-visualization'||d.token!==token)return;
  if(d.type==='height'&&Number.isFinite(d.height))setHeight(Math.min(16000,Math.max(240,d.height)));
  if(d.type==='state'&&d.state&&typeof d.state==='object'&&!Array.isArray(d.state)){
   try{if(JSON.stringify(d.state).length<=200000)callback.current(d.state);}catch{/* Ignore malformed sandbox messages. */}
  }
 };window.addEventListener('message',listener);return()=>window.removeEventListener('message',listener);},[token]);
 return <iframe ref={frame} title={title} sandbox="allow-scripts" referrerPolicy="no-referrer" srcDoc={source} style={{height,minHeight:240}}/>;
}

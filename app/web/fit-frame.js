// Measure content rather than the frame viewport so shrinking forms also resize.
export function fitFrame(frame,selector) {
  const content=frame.contentDocument?.querySelector(selector)
  if(!content)return
  const resize=()=>{frame.style.height=Math.ceil(content.getBoundingClientRect().height)+'px'}
  const observer=new ResizeObserver(resize)
  observer.observe(content)
  resize()
  frame.contentWindow.addEventListener('pagehide',()=>observer.disconnect(),{once:true})
}

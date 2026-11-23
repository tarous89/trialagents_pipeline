import DOMPurify from 'dompurify';
// The planner builds editable forms from workspace records. Keep each HTML
// insertion behind one sanitizer; account frames are created by DOM APIs.
export function into(element){
 return {set html(markup){
   element.replaceChildren(DOMPurify.sanitize(markup,{
     RETURN_DOM_FRAGMENT:true,USE_PROFILES:{html:true,svg:true},FORBID_TAGS:['style','iframe','object','embed','foreignObject'],
     FORBID_ATTR:['srcdoc','action','formaction','target'],ALLOW_DATA_ATTR:true
   }))
 }};
}

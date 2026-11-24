import chatgpt from './marks/chatgpt.svg'
import claude from './marks/claude.svg'

const marks = {ChatGPT: chatgpt, Claude: claude}
export function assistantMark(name) {
  return marks[name].replace('<svg role="img"', '<svg class="assistant-mark" aria-hidden="true" fill="currentColor" width="18" height="18"')
}

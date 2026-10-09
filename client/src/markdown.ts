import { marked } from 'marked'
import DOMPurify from 'dompurify'

marked.setOptions({ gfm: true, breaks: true })

// Links open in a new tab, safely
DOMPurify.addHook('afterSanitizeAttributes', (node) => {
  if (node.tagName === 'A') {
    node.setAttribute('target', '_blank')
    node.setAttribute('rel', 'noopener noreferrer')
  }
})

// Markdown -> sanitized HTML. Checklist items (- [ ] / - [x]) come out as checkboxes, enabled so they can be ticked.
export function renderMarkdown(src: string): string {
  const html = marked.parse(src, { async: false }) as string
  const clean = DOMPurify.sanitize(html, { ADD_ATTR: ['target'] })
  return clean.replace(/<input([^>]*?)\sdisabled(?:="[^"]*")?/g, '<input$1')
}

const TASK = /^(\s*(?:>\s*)*(?:[-*+]|\d+[.)])\s+)\[( |x|X)\](\s|$)/

// Flip the nth checklist item in the markdown source (items inside fenced code blocks don't count)
export function toggleTask(src: string, index: number): string {
  const lines = src.split('\n')
  let fenced = false
  let n = -1
  for (let i = 0; i < lines.length; i++) {
    if (/^\s*(```|~~~)/.test(lines[i])) { fenced = !fenced; continue }
    if (fenced) continue
    const m = lines[i].match(TASK)
    if (!m) continue
    n++
    if (n === index) {
      lines[i] = lines[i].replace(/\[( |x|X)\]/, m[2] === ' ' ? '[x]' : '[ ]')
      break
    }
  }
  return lines.join('\n')
}

export function taskCounts(src: string): { done: number; total: number } {
  let done = 0
  let total = 0
  let fenced = false
  for (const line of src.split('\n')) {
    if (/^\s*(```|~~~)/.test(line)) { fenced = !fenced; continue }
    if (fenced) continue
    const m = line.match(TASK)
    if (m) { total++; if (m[2] !== ' ') done++ }
  }
  return { done, total }
}

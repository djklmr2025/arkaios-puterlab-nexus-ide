// md.js — minimal, safe-ish markdown renderer for chat bubbles
function esc(s){ return s.replace(/[&<>]/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c])); }

export function renderMarkdown(src) {
  if (!src) return '';
  const blocks = [];
  // extract fenced code blocks first
  src = src.replace(/```(\w+)?\n([\s\S]*?)```/g, (m, lang, code) => {
    const i = blocks.length;
    blocks.push(`<pre><code>${esc(code.replace(/\n$/,''))}</code></pre>`);
    return `\u0000B${i}\u0000`;
  });

  let html = esc(src);
  // restore html we already built? blocks were pushed pre-escaped for code
  // inline code
  html = html.replace(/`([^`]+)`/g, (m,c)=>`<code>${c}</code>`);
  // bold / italic
  html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/(^|[^*])\*([^*]+)\*/g, '$1<em>$2</em>');
  // links
  html = html.replace(/\[([^\]]+)\]\((https?:[^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
  // headings
  html = html.replace(/^### (.*)$/gm, '<div class="font-semibold mt-1">$1</div>');
  html = html.replace(/^## (.*)$/gm, '<div class="font-semibold text-[15px] mt-1">$1</div>');
  html = html.replace(/^# (.*)$/gm, '<div class="font-bold text-[15px] mt-1">$1</div>');
  // lists
  html = html.replace(/^(?:[-*] .*(?:\n|$))+/gm, (m) => {
    const items = m.trim().split('\n').map(l => `<li>${l.replace(/^[-*]\s/,'')}</li>`).join('');
    return `<ul class="list-disc pl-5 my-1 space-y-0.5">${items}</ul>`;
  });
  html = html.replace(/^(?:\d+\. .*(?:\n|$))+/gm, (m) => {
    const items = m.trim().split('\n').map(l => `<li>${l.replace(/^\d+\.\s/,'')}</li>`).join('');
    return `<ol class="list-decimal pl-5 my-1 space-y-0.5">${items}</ol>`;
  });
  // paragraphs / line breaks
  html = html.replace(/\n{2,}/g, '<br><br>').replace(/\n/g, '<br>');
  // restore code blocks
  html = html.replace(/\u0000B(\d+)\u0000/g, (m,i)=>blocks[+i]);
  // the file-chip spans inserted upstream were escaped; unescape them
  html = html.replace(/&lt;span class="file-chip"&gt;([\s\S]*?)&lt;\/span&gt;/g, '<span class="file-chip">$1</span>');
  return html;
}

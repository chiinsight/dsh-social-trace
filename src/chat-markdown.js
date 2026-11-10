import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkCjkFriendly from 'remark-cjk-friendly';

// Repair only the growing tail for display; stored and completed text stays intact.
export function streamingMarkdown(text) {
  let fence = null;
  for (const line of text.split('\n')) {
    const match = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(line);
    if (!match) continue;
    if (!fence) fence = match[1];
    else if (match[1][0] === fence[0] && match[1].length >= fence.length && !match[2].trim()) fence = null;
  }
  if (fence) return text + '\n' + fence;
  const tail = text.slice(text.lastIndexOf('\n') + 1);
  if (tail.includes('`') || tail.includes('***')) return text;
  const markers = [...tail.matchAll(/(?<![\\*])\*\*(?!\*)/g)];
  const last = markers.at(-1);
  if (markers.length % 2 && last && /^\S/.test(tail.slice(last.index + 2))) return text + '**';
  return text;
}

// DSH supplies the React instance. This module is bundled with React external.
export function createChatMarkdown(React) {
  const h = React.createElement;
  const safeURL = value => /^https?:\/\//i.test(value) ? value : '';
  function citations(sources) {
    return () => tree => {
      const walk = node => {
        if (!node.children || ['link', 'code', 'inlineCode'].includes(node.type)) return;
        node.children = node.children.flatMap(child => {
          if (child.type !== 'text') { walk(child); return [child]; }
          const parts = []; let start = 0;
          for (const match of child.value.matchAll(/\[(S\d+)\]/g)) {
            const source = sources.find(item => item.sourceId === match[1]);
            if (!source || !safeURL(source.url)) continue;
            if (match.index > start) parts.push({ type: 'text', value: child.value.slice(start, match.index) });
            parts.push({ type: 'link', url: source.url, title: source.author, data: { hProperties: { className: 'st-chat-citation' } }, children: [{ type: 'text', value: match[0] }] });
            start = match.index + match[0].length;
          }
          if (start < child.value.length) parts.push({ type: 'text', value: child.value.slice(start) });
          return parts;
        });
      };
      walk(tree);
    };
  }
  const components = {
    a: ({ href, children, title, className }) => href ? h('a', { href, title, className, target: '_blank', rel: 'noreferrer' }, children) : h('span', null, children),
    img: ({ src, alt }) => src ? h('a', { href: src, target: '_blank', rel: 'noreferrer' }, alt || '查看图片') : null,
    table: ({ children }) => h('div', { className: 'st-chat-table' }, h('table', null, children)),
  };
  return React.memo(function ChatMarkdown({ text, sources, streaming }) {
    const plugins = React.useMemo(() => [[remarkGfm, { singleTilde: false }], remarkCjkFriendly, citations(sources)], [sources]);
    return h('div', { className: 'st-chat-answer' }, h(Markdown, { remarkPlugins: plugins, skipHtml: true, urlTransform: safeURL, components }, streaming ? streamingMarkdown(text) : text));
  }, (before, after) => before.text === after.text && before.streaming === after.streaming && JSON.stringify(before.sources) === JSON.stringify(after.sources));
}

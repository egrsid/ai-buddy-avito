import { Fragment, type ReactNode } from 'react';

// Deliberately limited Markdown: React escapes all text. No HTML, images or
// external URLs. Only server-validated citation URLs become document links.
export function FormattedText({ text, documents = [], onDocument }: {
  text: string;
  documents?: { document_id: string; url: string }[];
  onDocument?: (id: string) => void;
}) {
  const inline = (value: string): ReactNode => value.split(/(\[[^\]\n]+\]\([^)\n]+\)|\*\*[^*\n]+\*\*|`[^`\n]+`)/g).map((part, i) => {
    const link = part.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
    if (link) {
      const doc = documents.find(d => d.url === link[2] && d.url === `/api/v2/knowledge/${d.document_id}`);
      return doc && onDocument
        ? <a key={i} href={doc.url} className="font-medium text-primary underline underline-offset-4" onClick={e => { e.preventDefault(); onDocument(doc.document_id); }}>{link[1]}</a>
        : <Fragment key={i}>{link[1]}</Fragment>;
    }
    if (part.startsWith('**') && part.endsWith('**')) return <strong key={i}>{part.slice(2, -2)}</strong>;
    if (part.startsWith('`') && part.endsWith('`')) return <code key={i} className="rounded bg-primary-light px-1 py-0.5 text-[0.9em]">{part.slice(1, -1)}</code>;
    return <Fragment key={i}>{part}</Fragment>;
  });
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  const blocks: ReactNode[] = [];
  for (let i = 0; i < lines.length;) {
    const line = lines[i];
    if (!line.trim()) { i++; continue; }
    if (/^```/.test(line)) {
      const code = [];
      i++;
      while (i < lines.length && !/^```/.test(lines[i])) code.push(lines[i++]);
      i++;
      blocks.push(<pre key={blocks.length} className="overflow-x-auto rounded-xl bg-surface-muted p-4 text-xs"><code>{code.join('\n')}</code></pre>);
      continue;
    }
    const heading = line.match(/^#{1,6}\s+(.+)$/);
    if (heading) {
      blocks.push(<h3 key={blocks.length} className="pt-2 text-base font-semibold leading-7">{inline(heading[1])}</h3>);
      i++;
      continue;
    }
    if (/^\s*(?:[-*]|\d+[.)])\s+/.test(line)) {
      const ordered = /^\s*\d+[.)]\s+/.test(line);
      const pattern = ordered ? /^\s*\d+[.)]\s+/ : /^\s*[-*]\s+/;
      const items: ReactNode[] = [];
      while (i < lines.length && pattern.test(lines[i])) {
        let item = lines[i++].replace(pattern, '');
        while (i < lines.length && /^\s+\S/.test(lines[i]) && !/^\s*(?:[-*]|\d+[.)])\s+/.test(lines[i])) item += ' ' + lines[i++].trim();
        items.push(<li key={i} className="pl-1">{inline(item)}</li>);
        let next = i;
        while (next < lines.length && !lines[next].trim()) next++;
        if (next < lines.length && pattern.test(lines[next])) i = next;
      }
      const List = ordered ? 'ol' : 'ul';
      blocks.push(<List key={blocks.length} className={`space-y-2 pl-5 ${ordered ? 'list-decimal' : 'list-disc'}`}>{items}</List>);
      continue;
    }
    const paragraph = [line];
    i++;
    while (i < lines.length && lines[i].trim() && !/^(?:#{1,6}\s|```|\s*(?:[-*]|\d+[.)])\s)/.test(lines[i])) paragraph.push(lines[i++]);
    blocks.push(<p key={blocks.length} >{inline(paragraph.join(' '))}</p>);
  }
  return <div className="space-y-4 break-words text-sm leading-7">{blocks}</div>;
}

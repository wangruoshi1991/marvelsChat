export type MessageTextBlock =
  | { kind: 'paragraph' | 'code' | 'literal'; text: string }
  | { kind: 'heading'; text: string; level: number }
  | { kind: 'list'; text: string; marker: string; indent: number }
  | { kind: 'quote'; blocks: MessageTextBlock[] }
  | { kind: 'table'; rows: string[][]; align: ('left' | 'center' | 'right')[] };

export type MessageTextInline =
  | { kind: 'text' | 'code'; text: string }
  | { kind: 'strong' | 'emphasis'; children: MessageTextInline[] }
  | {
      kind: 'link';
      children: MessageTextInline[];
      destination: string;
      href: string | null;
    };

const punctuation = /[!"#$%&'()*+,\-./:;<=>?@[\\\]^_`{|}~]/;
const unescape = (text: string) =>
  text.replace(/\\([!"#$%&'()*+,\-./:;<=>?@[\]\\^_`{|}~])/g, '$1');

export function safeMessageLink(destination: string): string | null {
  const address = destination.match(/^(https?):\/\/([^/?#]+)/i);
  if (
    !address ||
    address[2].includes('@') ||
    // eslint-disable-next-line no-control-regex -- Control characters cannot enter a navigable URL.
    /[\s\\\u0000-\u001f\u007f]/.test(destination)
  )
    return null;
  try {
    // React Native's URL implementation needs a lower-case scheme and does not
    // reliably distinguish credentials from an @ character inside the path.
    const url = new URL(
      destination.replace(/^https?/i, scheme => scheme.toLowerCase()),
    );
    return /^(https?:)$/.test(url.protocol) && url.hostname
      ? destination
      : null;
  } catch {
    return null;
  }
}

// Pipes inside escaped text or code spans belong to their cell.
function tableCells(line: string): string[] | null {
  const cells: string[] = [];
  let cell = '';
  let ticks = '';
  for (let i = 0; i < line.length; i += 1) {
    if (line[i] === '\\' && i + 1 < line.length) {
      cell += line.slice(i, i + 2);
      i += 1;
    } else if (line[i] === '`') {
      const run = line.slice(i).match(/^`+/)![0];
      if (!ticks) ticks = run;
      else if (ticks === run) ticks = '';
      cell += run;
      i += run.length - 1;
    } else if (line[i] === '|' && !ticks) {
      cells.push(cell.trim());
      cell = '';
    } else cell += line[i];
  }
  if (!cells.length) return null;
  cells.push(cell.trim());
  if (!cells[0]) cells.shift();
  if (!cells[cells.length - 1]) cells.pop();
  return cells;
}

function parseBlocks(content: string, depth = 0): MessageTextBlock[] {
  // Preserve the text at pathological nesting depths instead of exhausting the stack.
  if (depth >= 32) return [{ kind: 'literal', text: content }];
  const lines = content.split(/\r?\n/);
  const result: MessageTextBlock[] = [];
  let paragraph: string[] = [];
  const flush = () => {
    if (paragraph.length)
      result.push({ kind: 'paragraph', text: paragraph.join('\n') });
    paragraph = [];
  };
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const fence = line.match(/^ {0,3}(`{3,}|~{3,})([^`]*)$/);
    const quote = line.match(/^ {0,3}> ?(.*)$/);
    const header = tableCells(line);
    const divider = i + 1 < lines.length ? tableCells(lines[i + 1]) : null;
    if (fence) {
      flush();
      let end = i + 1;
      const closing = new RegExp(
        `^ {0,3}${fence[1][0]}{${fence[1].length},}\\s*$`,
      );
      while (end < lines.length && !closing.test(lines[end])) end += 1;
      result.push({
        kind: 'code',
        text: lines.slice(end === lines.length ? i : i + 1, end).join('\n'),
      });
      i = end;
    } else if (quote) {
      flush();
      const quoted = [quote[1]];
      while (i + 1 < lines.length) {
        const next = lines[i + 1].match(/^ {0,3}> ?(.*)$/);
        if (!next) break;
        quoted.push(next[1]);
        i += 1;
      }
      result.push({
        kind: 'quote',
        blocks: parseBlocks(quoted.join('\n'), depth + 1),
      });
    } else if (
      header?.length &&
      divider?.length === header.length &&
      divider.every(cell => /^:?-{3,}:?$/.test(cell))
    ) {
      flush();
      const rows = [header];
      i += 1;
      while (i + 1 < lines.length) {
        const row = tableCells(lines[i + 1]);
        if (!row?.length) break;
        rows.push(row);
        i += 1;
      }
      result.push({
        kind: 'table',
        rows,
        align: divider.map(cell =>
          cell.endsWith(':')
            ? cell.startsWith(':')
              ? 'center'
              : 'right'
            : 'left',
        ),
      });
    } else if (!line.trim()) flush();
    else {
      const heading = line.match(/^ {0,3}(#{1,6})[ \t]+(.+)$/);
      const list = line.match(/^(\s*)(?:([-+*])|(\d+[.)]))[ \t]+(.+)$/);
      if (heading) {
        flush();
        result.push({
          kind: 'heading',
          level: heading[1].length,
          text: heading[2].replace(/[ \t]+#+[ \t]*$/, ''),
        });
      } else if (list) {
        flush();
        result.push({
          kind: 'list',
          marker: list[3] || '•',
          indent: list[1].replace(/\t/g, '    ').length,
          text: list[4],
        });
      } else paragraph.push(line);
    }
  }
  flush();
  return result;
}

export function messageTextBlocks(content: string): MessageTextBlock[] {
  // Unknown structured content is literal, never interpreted as UI or HTML.
  try {
    JSON.parse(content);
    return [{ kind: 'literal', text: content }];
  } catch {
    return parseBlocks(content);
  }
}

function closingDelimiter(content: string, start: number, marker: string) {
  for (let i = start; i < content.length; i += 1) {
    if (content[i] === '\\') {
      i += 1;
      continue;
    }
    if (marker[0] !== '`' && content[i] === '`') {
      const ticks = content.slice(i).match(/^`+/)![0];
      const end = closingDelimiter(content, i + ticks.length, ticks);
      if (end >= 0) {
        i = end + ticks.length - 1;
        continue;
      }
    }
    if (content[i] !== marker[0]) continue;
    const run = content
      .slice(i)
      .match(
        marker[0] === '`' ? /^`+/ : marker[0] === '*' ? /^\*+/ : /^_+/,
      )![0];
    if (
      marker[0] === '`'
        ? run.length === marker.length
        : run.length >= marker.length &&
          !(marker.length === 1 && run.length === 2) &&
          !/\s/.test(content[i - 1])
    )
      return i + run.length - marker.length;
    i += run.length - 1;
  }
  return -1;
}

function bracketEnd(
  content: string,
  start: number,
  opening: string,
  closing: string,
) {
  let depth = 1;
  for (let i = start + 1; i < content.length; i += 1) {
    if (content[i] === '\\') i += 1;
    else if (content[i] === opening) depth += 1;
    else if (content[i] === closing && --depth === 0) return i;
  }
  return -1;
}

// Deliberately supports prose formatting, not HTML, embeds or executable markup.
export function messageTextInline(
  content: string,
  depth = 0,
  links = true,
): MessageTextInline[] {
  if (depth >= 32) return [{ kind: 'text', text: content }];
  const result: MessageTextInline[] = [];
  let text = '';
  const push = (part: MessageTextInline) => {
    if (text) result.push({ kind: 'text', text });
    text = '';
    result.push(part);
  };
  for (let i = 0; i < content.length; ) {
    if (content[i] === '\\' && punctuation.test(content[i + 1] || '')) {
      text += content[i + 1];
      i += 2;
      continue;
    }
    const image = content[i] === '!' && content[i + 1] === '[';
    if (links && (content[i] === '[' || image)) {
      const start = image ? i + 1 : i;
      const labelEnd = bracketEnd(content, start, '[', ']');
      const end =
        content[labelEnd + 1] === '('
          ? bracketEnd(content, labelEnd + 1, '(', ')')
          : -1;
      if (labelEnd >= 0 && end >= 0) {
        const destination = content.slice(labelEnd + 2, end).trim();
        const target = destination.match(
          /^(<[^<>]*>|[^\s]+)(?:\s+(?:"[^"]*"|'[^']*'))?$/,
        );
        const href = unescape(target?.[1].replace(/^<|>$/g, '') || destination);
        push({
          kind: 'link',
          children: messageTextInline(
            content.slice(start + 1, labelEnd) || href,
            depth + 1,
            false,
          ),
          destination: href,
          href: safeMessageLink(href),
        });
        i = end + 1;
        continue;
      }
    }
    if (links && content[i] === '<') {
      const end = content.indexOf('>', i + 1);
      const href = end >= 0 ? safeMessageLink(content.slice(i + 1, end)) : null;
      if (href) {
        push({
          kind: 'link',
          children: [{ kind: 'text', text: href }],
          destination: href,
          href,
        });
        i = end + 1;
        continue;
      }
      if (end >= 0) {
        text += content.slice(i, end + 1);
        i = end + 1;
        continue;
      }
    }
    if (
      links &&
      /[hH]/.test(content[i]) &&
      !/[\w@]/.test(content[i - 1] || '')
    ) {
      const raw = content
        .slice(i)
        .match(/^https?:\/\/[^\s<>"'，。！？；：“”‘’（）]+/i)?.[0];
      if (raw) {
        let destination = raw.replace(/[.,!?;:，。！？；：]+$/, '');
        while (
          destination.endsWith(')') &&
          (destination.match(/\)/g)?.length || 0) >
            (destination.match(/\(/g)?.length || 0)
        )
          destination = destination.slice(0, -1);
        const href = safeMessageLink(destination);
        if (href) {
          push({
            kind: 'link',
            children: [{ kind: 'text', text: destination }],
            destination,
            href,
          });
          i += destination.length;
          continue;
        }
      }
    }
    if (content[i] === '`' || content[i] === '*' || content[i] === '_') {
      const run = content
        .slice(i)
        .match(
          content[i] === '`' ? /^`+/ : content[i] === '*' ? /^\*+/ : /^_+/,
        )![0];
      const marker = run[0] === '`' ? run : run.slice(0, 3);
      const end = closingDelimiter(content, i + marker.length, marker);
      if (
        end > i + marker.length &&
        (marker[0] === '`' || !/\s/.test(content[i + marker.length])) &&
        !(marker[0] === '_' && /\w/.test(content[i - 1] || ''))
      ) {
        const inner = content.slice(i + marker.length, end);
        if (marker[0] === '`') push({ kind: 'code', text: inner });
        else {
          const children = messageTextInline(inner, depth + 1, links);
          push({
            kind: marker.length >= 2 ? 'strong' : 'emphasis',
            children:
              marker.length === 3 ? [{ kind: 'emphasis', children }] : children,
          });
        }
        i = end + marker.length;
        continue;
      }
    }
    text += content[i];
    i += 1;
  }
  if (text) result.push({ kind: 'text', text });
  return result;
}

function inlineText(parts: MessageTextInline[]): string {
  return parts
    .map(part =>
      'text' in part
        ? part.text
        : inlineText(part.children) +
          (part.kind === 'link' && !part.href ? ` (${part.destination})` : ''),
    )
    .join('');
}

export function messageTextPreview(content: string): string {
  const blocks = messageTextBlocks(content);
  if (blocks[0]?.kind === 'literal') return content;
  const preview = (items: MessageTextBlock[]): string =>
    items
      .map(block => {
        if (block.kind === 'quote') return preview(block.blocks);
        if (block.kind === 'table')
          return block.rows
            .map(row =>
              row.map(cell => inlineText(messageTextInline(cell))).join(' · '),
            )
            .join(' / ');
        if (block.kind === 'code' || block.kind === 'literal')
          return block.text;
        const text = inlineText(messageTextInline(block.text));
        return block.kind === 'list' ? `${block.marker} ${text}` : text;
      })
      .join(' ');
  return preview(blocks).replace(/\s+/g, ' ').trim();
}

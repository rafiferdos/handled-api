import { sha256 } from '../../common/database/json.js';
export function chunkText(text: string) {
  const chars = Array.from(text.trim());
  const chunks: Array<{
    content: string;
    contentHash: string;
    chunkIndex: number;
  }> = [];
  for (let start = 0; start < chars.length;) {
    let end = start,
      size = 0;
    while (end < chars.length && size + chars[end].length <= 3200)
      size += chars[end++].length;
    const content = chars.slice(start, end).join('').trim();
    if (content)
      chunks.push({
        content,
        contentHash: sha256(content),
        chunkIndex: chunks.length,
      });
    if (end >= chars.length) break;
    const previous = start;
    start = end;
    let overlap = 0;
    while (start > previous && overlap + chars[start - 1].length <= 480)
      overlap += chars[--start].length;
  }
  return chunks;
}

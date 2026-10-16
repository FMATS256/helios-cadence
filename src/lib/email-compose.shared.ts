/** Remove only identifiable IMT staff signatures; retain client HTML and imagery. */
export function withoutStaffSignature(html: string): string {
  let body = html.replace(/<!--\s*imt-sig\s*-->[\s\S]*?<!--\s*\/imt-sig\s*-->/gi, "")
    .replace(/<style\b[^>]*>[\s\S]*?\.imt-signature[\s\S]*?<\/style>/gi, "");
  const signature = /<table\b[^>]*\bclass\s*=\s*["'][^"']*\bimt-signature\b[^"']*["'][^>]*>/i;
  let match = signature.exec(body);
  while (match) {
    const start = match.index;
    const tags = /<\/?table\b[^>]*>/gi;
    tags.lastIndex = start;
    let depth = 0;
    let end = start;
    let tag = tags.exec(body);
    while (tag) {
      depth += /^<\//.test(tag[0]) ? -1 : 1;
      if (depth === 0) { end = tags.lastIndex; break; }
      tag = tags.exec(body);
    }
    if (end === start) break;
    body = body.slice(0, start) + body.slice(end);
    match = signature.exec(body);
  }
  return body;
}
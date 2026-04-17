/** Generate a URL-friendly slug from a term string. */
export function slug(term: string): string {
  return term
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[()/]/g, '')
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80) || 'term';
}

/** Generate a unique ID, appending a counter suffix if the slug already exists in `seen`. */
export function uniqueId(term: string, seen: Set<string>): string {
  let id = slug(term);
  let counter = 0;
  while (seen.has(id)) {
    counter++;
    id = `${slug(term)}-${counter}`;
  }
  seen.add(id);
  return id;
}

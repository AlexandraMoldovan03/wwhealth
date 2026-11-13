/** Case-insensitive filter over the given string fields of each item. */
export function filterByQuery<T>(items: readonly T[], query: string, fields: readonly (keyof T)[]): T[] {
  const q = query.trim().toLowerCase();
  if (!q) return [...items];
  return items.filter((item) =>
    fields.some((field) => {
      const value = item[field];
      return typeof value === 'string' && value.toLowerCase().includes(q);
    }),
  );
}

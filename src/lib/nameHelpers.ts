/**
 * Name normalization and deduplication helper functions for
 * Sales Reps, Employees, Cash Funds, and Customer Lists.
 */

export const normalizeEntityName = (name?: string | null): string => {
  if (!name) return '';
  return name
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();
};

/**
 * Checks if a name already exists in an entity collection (ignoring whitespace and case).
 * Optionally excludes an entity by ID (useful when updating an existing record).
 */
export const hasDuplicateName = <T extends { id?: string; name: string }>(
  items: T[],
  nameToCheck: string,
  excludeId?: string
): boolean => {
  const target = normalizeEntityName(nameToCheck);
  if (!target) return false;

  return items.some((item) => {
    if (excludeId && item.id && item.id === excludeId) {
      return false;
    }
    return normalizeEntityName(item.name) === target;
  });
};

/**
 * Filters an array of entities to keep only the first occurrence of each unique normalized name.
 */
export const deduplicateEntitiesByName = <T extends { id?: string; name: string }>(
  items: T[]
): T[] => {
  const seen = new Set<string>();
  const result: T[] = [];

  for (const item of items) {
    const norm = normalizeEntityName(item.name);
    if (!norm) {
      result.push(item);
      continue;
    }
    if (!seen.has(norm)) {
      seen.add(norm);
      result.push(item);
    }
  }

  return result;
};

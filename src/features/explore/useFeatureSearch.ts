import { useMemo, useState } from 'react';

import type { Feature, FeatureCategory } from '@/types';
import { filterByQuery } from '@/utils/search';

export const CATEGORY_OPTIONS = ['All', 'AI', 'Vision', 'Data', 'Integration'] as const satisfies readonly (
  | 'All'
  | FeatureCategory
)[];
export type CategoryOption = (typeof CATEGORY_OPTIONS)[number];

/** Search + category filtering logic for Explore, kept out of the screen. */
export function useFeatureSearch(features: Feature[]) {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<CategoryOption>('All');

  const results = useMemo(() => {
    const byCategory = category === 'All' ? features : features.filter((f) => f.category === category);
    return filterByQuery(byCategory, query, ['title', 'description']);
  }, [features, query, category]);

  return { query, setQuery, category, setCategory, results };
}

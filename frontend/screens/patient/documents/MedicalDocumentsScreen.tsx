import { router } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { RefreshControl, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { AppButton, AppInput, AppText, ErrorState, LoadingState, ScreenContainer, SegmentedControl } from '@/design-system';
import { CategoryFilter } from '@/design-system/components/CategoryFilter';
import { spacing } from '@/design-system/theme';
import { useTheme } from '@/design-system/useTheme';
import { useAsync } from '@/hooks/useAsync';
import { DocumentList } from '@/screens/shared/components/DocumentList';
import { ALL_DOCUMENT_TYPES } from '@/screens/shared/components/documentMeta';
import { ApiError } from '@/services/api/ApiError';
import { api } from '@/services/backend';
import type { DocumentType, LibraryPage, LibraryQuery, LibrarySort } from '@/types';

const ALL = '__all__';
const CATEGORIES: readonly string[] = [ALL, ...ALL_DOCUMENT_TYPES.map((d) => d.value)];
const PERIODS = ['all', '3m', '1y', 'older'] as const;
const SORTS: readonly LibrarySort[] = ['date', 'title', 'uploaded'];
type Period = (typeof PERIODS)[number];

function periodRange(p: Period): { from: string | null; to: string | null } {
  if (p === 'all') return { from: null, to: null };
  const d = new Date();
  d.setMonth(d.getMonth() - (p === '3m' ? 3 : 12));
  const iso = d.toISOString().slice(0, 10);
  return p === 'older' ? { from: null, to: iso } : { from: iso, to: null };
}

/** "Documentele mele": search, filters (category / specialty / institution / period), sort. Opening it never calls AI. */
export function MedicalDocumentsScreen() {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const [search, setSearch] = useState('');
  const [q, setQ] = useState('');
  const [category, setCategory] = useState<string>(ALL);
  const [specialty, setSpecialty] = useState<string>(ALL);
  const [institution, setInstitution] = useState<string>(ALL);
  const [period, setPeriod] = useState<Period>('all');
  const [range, setRange] = useState(() => periodRange('all'));
  const [sort, setSort] = useState<LibrarySort>('date');
  const [order, setOrder] = useState<'asc' | 'desc'>('desc');

  useEffect(() => {
    const id = setTimeout(() => setQ(search.trim()), 300);
    return () => clearTimeout(id);
  }, [search]);

  const query = useMemo<LibraryQuery>(() => ({
    q: q || undefined, category: category === ALL ? null : (category as DocumentType),
    specialty: specialty === ALL ? null : specialty, institution: institution === ALL ? null : institution,
    from: range.from, to: range.to, sort, order,
  }), [q, category, specialty, institution, range, sort, order]);

  const load = useCallback(async (): Promise<LibraryPage> => {
    try {
      return await api.getLibrary(query);
    } catch (err) {
      // Library not set up yet (migration not applied) → plain document list, no filters.
      if (err instanceof ApiError && err.status === 503) {
        return { documents: (await api.getMyPatient()).documents, institutions: [], specialties: [] };
      }
      throw err;
    }
  }, [query]);
  const { data, isLoading, error, reload } = useAsync(load, { refetchOnFocus: true });
  const filtered = !!(q || category !== ALL || specialty !== ALL || institution !== ALL || period !== 'all');

  return (
    <ScreenContainer help="documents" edges={['bottom']}
      refreshControl={<RefreshControl refreshing={isLoading && !!data} onRefresh={reload} tintColor={colors.primary} />}>
      <AppButton title={t('smart.importButton')} icon="sparkles-outline" fullWidth onPress={() => router.push('/patient/upload-document')} />
      <AppInput icon="search-outline" placeholder={t('smart.library.search')} value={search} onChangeText={setSearch}
        onClear={search ? () => setSearch('') : undefined} autoCapitalize="none" returnKeyType="search" />
      <CategoryFilter options={CATEGORIES} value={category} onChange={setCategory}
        getLabel={(v) => (v === ALL ? t('smart.library.all') : t(`documentTypes.${v}`))} />
      {!!data?.specialties.length && (
        <CategoryFilter options={[ALL, ...data.specialties]} value={specialty} onChange={setSpecialty}
          getLabel={(v) => (v === ALL ? t('smart.library.allSpecialties') : v)} />
      )}
      {!!data?.institutions.length && (
        <CategoryFilter options={[ALL, ...data.institutions]} value={institution} onChange={setInstitution}
          getLabel={(v) => (v === ALL ? t('smart.library.allInstitutions') : v)} />
      )}
      <CategoryFilter options={PERIODS} value={period} onChange={(p) => { setPeriod(p); setRange(periodRange(p)); }}
        getLabel={(p) => t(`smart.library.period.${p}`)} />
      <View style={styles.sortRow}>
        <View style={styles.flex}>
          <SegmentedControl options={SORTS} value={sort} onChange={setSort} getLabel={(s) => t(`smart.library.sort.${s}`)} />
        </View>
        <AppButton title={t(order === 'desc' ? 'smart.library.desc' : 'smart.library.asc')}
          icon={order === 'desc' ? 'arrow-down-outline' : 'arrow-up-outline'} variant="outline" size="sm"
          onPress={() => setOrder((o) => (o === 'desc' ? 'asc' : 'desc'))} />
      </View>
      {isLoading && !data && <LoadingState />}
      {error && !data && <ErrorState message={error} onRetry={reload} />}
      {data && filtered && data.documents.length === 0 ? (
        <AppText variant="caption" color="textMuted">{t('smart.library.noResults')}</AppText>
      ) : data && (
        <DocumentList documents={data.documents}
          onSelect={(doc) => router.push({ pathname: '/patient/document/[id]', params: { id: doc.id } })} />
      )}
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  sortRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  flex: { flex: 1 },
});

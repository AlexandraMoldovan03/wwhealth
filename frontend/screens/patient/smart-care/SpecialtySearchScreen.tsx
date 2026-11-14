import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { AppInput, AppText, EmptyState, ErrorState, ListRow, LoadingState, ScreenContainer } from '@/design-system';
import { spacing } from '@/design-system/theme';
import { useTheme } from '@/design-system/useTheme';
import { useLanguage } from '@/hooks/useLanguage';
import { api } from '@/services/backend';
import type { Specialty } from '@/types';
import { getErrorMessage } from '@/utils/errors';
import { useTranslation } from 'react-i18next';

/** Manual search in the backend specialty catalog — no AI involved. */
export function SpecialtySearchScreen() {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const language = useLanguage();
  const [query, setQuery] = useState('');
  const [items, setItems] = useState<Specialty[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setError(null);
    const timer = setTimeout(() => {
      api
        .listSpecialties(query.trim(), language)
        .then((res) => alive && setItems(res))
        .catch((err) => alive && setError(getErrorMessage(err)));
    }, 250);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [query, language]);

  return (
    <ScreenContainer edges={['bottom']} help="smartCare">
      <AppText color="textMuted">{t('care.search.intro')}</AppText>
      <AppInput
        icon="search-outline"
        placeholder={t('care.search.placeholder')}
        autoCorrect={false}
        value={query}
        onChangeText={setQuery}
        onClear={() => setQuery('')}
      />
      {error ? (
        <ErrorState compact message={error} />
      ) : items === null ? (
        <LoadingState count={3} />
      ) : items.length === 0 ? (
        <EmptyState icon="search-outline" title={t('care.search.none')} message={t('care.search.noneHint')} />
      ) : (
        <View style={styles.list}>
          {items.map((s) => (
            <ListRow
              key={s.id}
              icon="medkit-outline"
              iconColor={colors.primary}
              title={s.name}
              onPress={() => router.push({ pathname: '/patient/specialty/[id]', params: { id: s.id, name: s.name } })}
            />
          ))}
        </View>
      )}
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({ list: { gap: spacing.sm } });

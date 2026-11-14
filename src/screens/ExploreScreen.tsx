import { router } from 'expo-router';
import { useMemo } from 'react';
import { Alert, StyleSheet, View } from 'react-native';

import { AppInput, AppText, EmptyState, ScreenContainer } from '@/components/ui';
import { spacing } from '@/constants/theme';
import { FEATURES } from '@/data/features';
import { CategoryFilter } from '@/features/explore/components/CategoryFilter';
import { FeatureCard } from '@/features/explore/components/FeatureCard';
import { CATEGORY_OPTIONS, useFeatureSearch } from '@/features/explore/useFeatureSearch';
import { useRole } from '@/features/auth/useCurrentUser';
import type { Feature } from '@/types';
import { useTranslation } from 'react-i18next';

export function ExploreScreen() {
  const { t } = useTranslation();
  const role = useRole();
  // Each role sees its own modules (+ AI tools). Translated copies, so search also works on the visible (translated) text.
  const features = useMemo(
    () =>
      FEATURES.filter((f) => f.category === 'AI' || f.category === (role === 'doctor' ? 'Doctor' : 'Patient')).map((f) => ({
        ...f,
        title: t(`explore.features.${f.id}.title`, { defaultValue: f.title }),
        description: t(`explore.features.${f.id}.description`, { defaultValue: f.description }),
      })),
    [t, role],
  );
  const { query, setQuery, category, setCategory, results } = useFeatureSearch(features);

  const openFeature = (feature: Feature) => {
    if (feature.route) {
      router.navigate(feature.route);
    } else {
      Alert.alert(feature.title, t('explore.comingSoon'));
    }
  };

  return (
    <ScreenContainer>
      <View style={styles.header}>
        <AppText variant="title">{t('explore.title')}</AppText>
        <AppText color="textMuted">{t('explore.subtitle')}</AppText>
      </View>

      <AppInput
        icon="search"
        placeholder={t('explore.search')}
        value={query}
        onChangeText={setQuery}
        onClear={() => setQuery('')}
        autoCorrect={false}
        returnKeyType="search"
      />
      <CategoryFilter
        options={CATEGORY_OPTIONS}
        value={category}
        onChange={setCategory}
        getLabel={(c) => t(`explore.categories.${c}`)}
      />

      <View style={styles.list}>
        {results.length === 0 ? (
          <EmptyState
            icon="search-outline"
            title={t('explore.noResults')}
            message={t('explore.noResultsHint')}
            actionLabel={t('explore.clearFilters')}
            onAction={() => {
              setQuery('');
              setCategory('All');
            }}
          />
        ) : (
          results.map((feature) => (
            <FeatureCard key={feature.id} feature={feature} onPress={() => openFeature(feature)} />
          ))
        )}
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  header: { gap: spacing.xs },
  list: { gap: spacing.md },
});

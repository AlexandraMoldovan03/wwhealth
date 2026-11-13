import { router } from 'expo-router';
import { Alert, StyleSheet, View } from 'react-native';

import { AppInput, AppText, EmptyState, ScreenContainer } from '@/components/ui';
import { spacing } from '@/constants/theme';
import { FEATURES } from '@/data/features';
import { CategoryFilter } from '@/features/explore/components/CategoryFilter';
import { FeatureCard } from '@/features/explore/components/FeatureCard';
import { CATEGORY_OPTIONS, useFeatureSearch } from '@/features/explore/useFeatureSearch';
import type { Feature } from '@/types';

export function ExploreScreen() {
  const { query, setQuery, category, setCategory, results } = useFeatureSearch(FEATURES);

  const openFeature = (feature: Feature) => {
    if (feature.route) {
      router.navigate(feature.route);
    } else {
      Alert.alert(feature.title, 'Coming soon — this is a placeholder for your hackathon feature.');
    }
  };

  return (
    <ScreenContainer>
      <View style={styles.header}>
        <AppText variant="title">Explore</AppText>
        <AppText color="textMuted">Features available now and ideas to build next.</AppText>
      </View>

      <AppInput
        icon="search"
        placeholder="Search features…"
        value={query}
        onChangeText={setQuery}
        onClear={() => setQuery('')}
        autoCorrect={false}
        returnKeyType="search"
      />
      <CategoryFilter options={CATEGORY_OPTIONS} value={category} onChange={setCategory} />

      <View style={styles.list}>
        {results.length === 0 ? (
          <EmptyState
            icon="search-outline"
            title="No features found"
            message="Try another search term or category."
            actionLabel="Clear filters"
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

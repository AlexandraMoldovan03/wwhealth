import { useNavigation } from 'expo-router';
import { type PropsWithChildren, type ReactElement, useLayoutEffect } from 'react';
import { type RefreshControlProps, ScrollView, StyleSheet, View } from 'react-native';
import { type Edge, SafeAreaView } from 'react-native-safe-area-context';

import { sizes, spacing } from '@/design-system/theme';
import { useTheme } from '@/design-system/useTheme';

import { HelpButton } from '@/help/HelpButton';
import type { HelpTopic } from '@/help/helpRegistry';

import { AppBackground } from './AppBackground';
import { BrandLogo } from './BrandLogo';

export interface ScreenContainerProps extends PropsWithChildren {
  /** Wrap content in a ScrollView (default true). Use false for FlatList screens. */
  scroll?: boolean;
  /** Safe-area edges to respect. Tabs handle the bottom edge, so default is top only. */
  edges?: Edge[];
  padded?: boolean;
  showBackgroundLungs?: boolean;
  refreshControl?: ReactElement<RefreshControlProps>;
  /** WWHealth logo at the top of the content. Default: on screens without a navigation header (top edge). */
  brand?: boolean;
  /** Contextual help (?) for this screen: top-right on tab screens, in the navigation header elsewhere. */
  help?: HelpTopic;
}

/** Every screen starts with this: brand background, safe area, padding, max width. */
export function ScreenContainer({
  children,
  scroll = true,
  edges = ['top'],
  padded = true,
  showBackgroundLungs = true,
  refreshControl,
  brand = edges.includes('top'),
  help,
}: ScreenContainerProps) {
  const { colors } = useTheme();
  const navigation = useNavigation();
  const inHeader = !!help && !brand;

  useLayoutEffect(() => {
    if (inHeader) navigation.setOptions({ headerRight: () => <HelpButton topic={help} /> });
  }, [inHeader, help, navigation]);

  const inner = [styles.inner, padded && styles.padded];

  const brandHeader = brand ? (
    <View style={styles.brandHeader}>
      <BrandLogo />
      {help && <HelpButton topic={help} />}
    </View>
  ) : null;

  return (
    <View style={[styles.safe, { backgroundColor: colors.background }]}>
      <AppBackground showLungs={showBackgroundLungs} />
      <SafeAreaView edges={edges} style={styles.safe}>
        {scroll ? (
          <ScrollView
            contentContainerStyle={inner}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            refreshControl={refreshControl}
          >
            {brandHeader}
            {children}
          </ScrollView>
        ) : (
          <View style={[inner, styles.flex]}>
            {brandHeader}
            {children}
          </View>
        )}
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  flex: { flex: 1 },
  inner: { width: '100%', maxWidth: sizes.maxContentWidth, alignSelf: 'center', gap: spacing.lg },
  brandHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', minHeight: 44 },
  padded: { paddingHorizontal: spacing.lg - 4, paddingTop: spacing.md, paddingBottom: spacing.xl },
});

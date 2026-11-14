import { useNavigation } from 'expo-router';
import { type PropsWithChildren, type ReactElement, useLayoutEffect } from 'react';
import { type RefreshControlProps, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { type Edge, SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { sizes, spacing } from '@/design-system/theme';
import { useTheme } from '@/design-system/useTheme';

import { HelpButton } from '@/help/HelpButton';
import type { HelpTopic } from '@/help/helpRegistry';

import { AppBackground, BrandWordmark, useBrandLogoSize } from './AppBackground';

export interface ScreenContainerProps extends PropsWithChildren {
  /** Wrap content in a ScrollView (default true). Use false for FlatList screens. */
  scroll?: boolean;
  /** Safe-area edges to respect. Tabs handle the bottom edge, so default is top only. */
  edges?: Edge[];
  padded?: boolean;
  refreshControl?: ReactElement<RefreshControlProps>;
  /** WWHealth logo at the top of the background. Default: on screens without a navigation header (top edge). */
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
  refreshControl,
  brand = edges.includes('top'),
  help,
}: ScreenContainerProps) {
  const { colors } = useTheme();
  const logo = useBrandLogoSize();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const navigation = useNavigation();
  const inHeader = !!help && !brand;

  useLayoutEffect(() => {
    if (inHeader) navigation.setOptions({ headerRight: () => <HelpButton topic={help} /> });
  }, [inHeader, help, navigation]);

  const inner = [styles.inner, padded && styles.padded, brand && { paddingTop: spacing.md + logo.height + spacing.sm }];

  return (
    <View style={[styles.safe, { backgroundColor: colors.background }]}>
      <AppBackground />
      <SafeAreaView edges={edges} style={styles.safe}>
        {scroll ? (
          <ScrollView
            contentContainerStyle={inner}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            refreshControl={refreshControl}
          >
            {children}
          </ScrollView>
        ) : (
          <View style={[inner, styles.flex]}>{children}</View>
        )}
      </SafeAreaView>
      {brand && <BrandWordmark />}
      {help && brand && (
        <View
          style={[
            styles.help,
            { top: insets.top + spacing.sm + (logo.height - 36) / 2, right: Math.max(0, (width - sizes.maxContentWidth) / 2) + spacing.lg - 4 },
          ]}
        >
          <HelpButton topic={help} />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  flex: { flex: 1 },
  inner: { width: '100%', maxWidth: sizes.maxContentWidth, alignSelf: 'center', gap: spacing.lg },
  help: { position: 'absolute' },
  padded: { paddingHorizontal: spacing.lg - 4, paddingTop: spacing.md, paddingBottom: spacing.xl },
});

import type { PropsWithChildren, ReactElement } from 'react';
import { type RefreshControlProps, ScrollView, StyleSheet, View } from 'react-native';
import { type Edge, SafeAreaView } from 'react-native-safe-area-context';

import { sizes, spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/useTheme';

export interface ScreenContainerProps extends PropsWithChildren {
  /** Wrap content in a ScrollView (default true). Use false for FlatList screens. */
  scroll?: boolean;
  /** Safe-area edges to respect. Tabs handle the bottom edge, so default is top only. */
  edges?: Edge[];
  padded?: boolean;
  refreshControl?: ReactElement<RefreshControlProps>;
}

/** Every screen starts with this: background colour, safe area, padding, max width. */
export function ScreenContainer({
  children,
  scroll = true,
  edges = ['top'],
  padded = true,
  refreshControl,
}: ScreenContainerProps) {
  const { colors } = useTheme();
  const inner = [styles.inner, padded && styles.padded];

  return (
    <SafeAreaView edges={edges} style={[styles.safe, { backgroundColor: colors.background }]}>
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
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  flex: { flex: 1 },
  inner: { width: '100%', maxWidth: sizes.maxContentWidth, alignSelf: 'center', gap: spacing.lg },
  padded: { paddingHorizontal: spacing.md, paddingVertical: spacing.md },
});

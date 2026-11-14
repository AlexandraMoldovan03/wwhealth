import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import type { PropsWithChildren } from 'react';

import { AppText } from '@/design-system';
import { radius, sizes, spacing } from '@/design-system/theme';
import { useTheme } from '@/design-system/useTheme';

export function CareSheet({ title, onClose, children }: PropsWithChildren<{ title: string; onClose: () => void }>) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.root}>
        <Pressable accessible={false} style={[StyleSheet.absoluteFill, { backgroundColor: colors.overlay }]} onPress={onClose} />
        <View accessibilityViewIsModal style={[styles.sheet, { backgroundColor: colors.surface, paddingBottom: Math.max(insets.bottom, spacing.md) }]}>
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
            <View style={styles.header}>
              <AppText variant="heading" accessibilityRole="header" style={styles.title}>{title}</AppText>
              <Pressable accessibilityRole="button" onPress={onClose} style={styles.close}>
                <AppText color="primary">{t('common.close')}</AppText>
              </Pressable>
            </View>
            {children}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: 'flex-end' },
  sheet: { width: '100%', maxWidth: sizes.maxContentWidth, alignSelf: 'center', maxHeight: '88%', borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl },
  content: { padding: spacing.lg, gap: spacing.md },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  title: { flex: 1 },
  close: { minHeight: 44, justifyContent: 'center' },
});

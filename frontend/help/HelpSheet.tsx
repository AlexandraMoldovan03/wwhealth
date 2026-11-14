import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '@/design-system/components/AppText';
import { radius, sizes, spacing } from '@/design-system/theme';
import { useTheme } from '@/design-system/useTheme';
import { useTranslation } from 'react-i18next';

import { HELP_LINKS, type HelpTopic } from './helpRegistry';

interface Faq {
  q: string;
  a: string;
}

const asList = <T,>(value: unknown): T[] => (Array.isArray(value) ? (value as T[]) : []);

/** Bottom sheet: what this screen is, what you can do, step by step, FAQ, related features. */
export function HelpSheet({ topic, onClose }: { topic: HelpTopic | null; onClose: () => void }) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const key = `help.topics.${topic ?? 'home'}`;
  const can = asList<string>(t(`${key}.can`, { returnObjects: true }));
  const steps = asList<string>(t(`${key}.steps`, { returnObjects: true }));
  const faq = asList<Faq>(t(`${key}.faq`, { returnObjects: true }));
  const links = topic ? HELP_LINKS[topic] : [];

  return (
    <Modal visible={!!topic} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <View style={styles.root}>
        <Pressable style={[StyleSheet.absoluteFill, { backgroundColor: colors.overlay }]} onPress={onClose} accessibilityLabel={t('common.close')} />
        <View
          accessibilityViewIsModal
          style={[styles.sheet, { backgroundColor: colors.surface, borderColor: colors.border, paddingBottom: Math.max(insets.bottom, spacing.md) }]}
        >
          <View style={[styles.grabber, { backgroundColor: colors.border }]} />
          <View style={styles.header}>
            <View style={[styles.headerIcon, { backgroundColor: colors.primaryMuted }]}>
              <Ionicons name="help-buoy-outline" size={20} color={colors.primary} />
            </View>
            <AppText variant="heading" style={styles.flex} accessibilityRole="header">
              {t(`${key}.title`)}
            </AppText>
            <Pressable onPress={onClose} hitSlop={10} accessibilityRole="button" accessibilityLabel={t('common.close')}>
              <Ionicons name="close" size={24} color={colors.textMuted} />
            </Pressable>
          </View>

          <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
            <AppText color="textMuted">{t(`${key}.intro`)}</AppText>

            {can.length > 0 && (
              <View style={styles.block}>
                <AppText variant="label" color="textMuted">{t('help.canDo').toUpperCase()}</AppText>
                {can.map((item) => (
                  <View key={item} style={styles.bullet}>
                    <Ionicons name="checkmark-circle-outline" size={18} color={colors.primary} />
                    <AppText style={styles.flex}>{item}</AppText>
                  </View>
                ))}
              </View>
            )}

            {steps.length > 0 && (
              <View style={styles.block}>
                <AppText variant="label" color="textMuted">{t('help.steps').toUpperCase()}</AppText>
                {steps.map((step, i) => (
                  <View key={step} style={styles.bullet}>
                    <View style={[styles.stepNo, { backgroundColor: colors.primaryMuted }]}>
                      <AppText variant="caption" color="primary">{i + 1}</AppText>
                    </View>
                    <AppText style={styles.flex}>{step}</AppText>
                  </View>
                ))}
              </View>
            )}

            {faq.length > 0 && (
              <View style={styles.block}>
                <AppText variant="label" color="textMuted">{t('help.faq').toUpperCase()}</AppText>
                {faq.map((item) => (
                  <View key={item.q} style={[styles.faq, { backgroundColor: colors.surfaceAlt }]}>
                    <AppText variant="subheading">{item.q}</AppText>
                    <AppText color="textMuted">{item.a}</AppText>
                  </View>
                ))}
              </View>
            )}

            {links.length > 0 && (
              <View style={styles.block}>
                <AppText variant="label" color="textMuted">{t('help.related').toUpperCase()}</AppText>
                {links.map((link) => (
                  <Pressable
                    key={link.id}
                    accessibilityRole="link"
                    onPress={() => {
                      onClose();
                      router.navigate(link.route);
                    }}
                    style={({ pressed }) => [styles.link, { borderColor: colors.border, opacity: pressed ? 0.7 : 1 }]}
                  >
                    <Ionicons name={link.icon} size={18} color={colors.primary} />
                    <AppText variant="subheading" style={styles.flex}>{t(`help.links.${link.id}`)}</AppText>
                    <Ionicons name="chevron-forward" size={18} color={colors.textSubtle} />
                  </Pressable>
                ))}
              </View>
            )}
            <AppText variant="caption" color="textSubtle">{t('help.offline')}</AppText>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: 'flex-end' },
  sheet: {
    width: '100%',
    maxWidth: sizes.maxContentWidth,
    alignSelf: 'center',
    maxHeight: '88%',
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: spacing.lg - 4,
    paddingTop: spacing.sm,
  },
  grabber: { alignSelf: 'center', width: 40, height: 5, borderRadius: radius.pill, marginBottom: spacing.sm },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingBottom: spacing.sm },
  headerIcon: { width: 36, height: 36, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  content: { gap: spacing.lg, paddingBottom: spacing.md },
  block: { gap: spacing.sm },
  bullet: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  stepNo: { width: 22, height: 22, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', marginTop: 1 },
  faq: { gap: spacing.xs, padding: spacing.md, borderRadius: radius.md },
  link: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.sm + 2, borderBottomWidth: StyleSheet.hairlineWidth },
  flex: { flex: 1 },
});

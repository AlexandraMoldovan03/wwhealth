import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router, type Href } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppButton, AppText, ScreenContainer, tapFeedback } from '@/design-system';
import { spacing } from '@/design-system/theme';
import { useTheme } from '@/design-system/useTheme';

const folders = [
  { title: 'documents', icon: 'documents-outline', href: '/patient/documents' },
  { title: 'symptoms', icon: 'mic-outline', href: '/patient/intake' },
  { title: 'history', icon: 'time-outline', href: '/history' },
  { title: 'smartRecord', icon: 'albums-outline', href: '/patient/record' },
  { title: 'treatments', icon: 'medkit-outline', href: '/patient/treatments' },
] as const satisfies readonly {
  title: string;
  icon: keyof typeof Ionicons.glyphMap;
  href: Href;
}[];

export function RecordsHubScreen() {
  const { colors, isDark } = useTheme();
  const { t } = useTranslation();
  const back = isDark ? '#9BC9D32C' : '#9DC9CF38';
  const face = isDark ? ['#B4E4EC44', '#41687438', '#9ED5D515'] as const : ['#FFFFFFA8', '#E6F8F44A', '#84BFC43D'] as const;
  const edge = isDark ? '#CFEFFF55' : '#7EABB566';

  return (
    <ScreenContainer help="records">
      <View style={styles.header}>
        <AppText variant="display" accessibilityRole="header">{t('hubs.records.title')}</AppText>
        <AppText color="textMuted">{t('hubs.records.subtitle')}</AppText>
      </View>

      <View style={styles.grid}>
        {folders.map(({ title, icon, href }) => {
          const featured = title === 'documents';
          const label = t(`hubs.records.folders.${title}`);
          return (
            <Pressable
              key={title}
              accessibilityRole="button"
              accessibilityLabel={label}
              onPress={() => { tapFeedback(); router.navigate(href); }}
              style={({ pressed }) => [styles.folder, featured && styles.featured, pressed && styles.pressed]}
            >
              <View pointerEvents="none" style={[styles.tab, { backgroundColor: back, borderColor: edge }]} />
              <View pointerEvents="none" style={[styles.back, { backgroundColor: back, borderColor: edge }]} />
              <LinearGradient colors={face} start={{ x: 0, y: 0 }} end={{ x: .92, y: 1 }} style={[styles.front, featured && styles.featuredFront, { borderColor: edge }]}>
                {!isDark && (
                  <View pointerEvents="none" style={styles.reflection}>
                    <LinearGradient
                      colors={['#FFFFFFD9', '#FFFFFF00']}
                      style={StyleSheet.absoluteFill}
                    />
                  </View>
                )}
                <Ionicons name={icon} size={featured ? 32 : 25} color={colors.primary} />
                <AppText variant={featured ? 'heading' : 'subheading'} align="center" style={styles.label}>{label}</AppText>
              </LinearGradient>
            </Pressable>
          );
        })}
      </View>

      <AppButton title={t('hubs.records.upload')} icon="cloud-upload-outline" variant="primary" size="lg" fullWidth
        onPress={() => router.push('/patient/upload-document')} />
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  header: { gap: spacing.xs },
  grid: { width: '100%', maxWidth: 435, alignSelf: 'center', flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: spacing.md },
  folder: { width: '48%', aspectRatio: 1, minHeight: 118, paddingTop: 17 },
  featured: { width: '100%', aspectRatio: 2.45, minHeight: 130 },
  featuredFront: { flexDirection: 'row', gap: spacing.md },
  pressed: { opacity: .83, transform: [{ scale: .97 }] },
  tab: { position: 'absolute', top: 0, left: 3, width: '43%', height: 30, borderWidth: 1, borderRadius: 6 },
  back: { position: 'absolute', top: 9, bottom: 4, left: 3, right: 5, borderWidth: 1, borderRadius: 7 },
  reflection: {
    position: 'absolute',
    top: 1,
    left: 1,
    right: 1,
    height: 36,
    borderTopLeftRadius: 6,
    borderTopRightRadius: 6,
    overflow: 'hidden',
  },
  label: { flexShrink: 1 },
  front: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: spacing.xs,
    borderWidth: 1,
    borderRadius: 7,
    paddingHorizontal: spacing.xs,
    paddingVertical: spacing.sm,
  },
});

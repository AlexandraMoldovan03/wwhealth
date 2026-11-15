import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { Platform, StyleSheet, useWindowDimensions, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import Svg, { Defs, Image, LinearGradient, Mask, RadialGradient, Rect, Stop } from 'react-native-svg';

import Animated, { Easing, Keyframe, ReduceMotion } from 'react-native-reanimated';

import { AppButton, AppText, ErrorState, LoadingState, ScreenContainer } from '@/design-system';
import { radius, spacing } from '@/design-system/theme';
import { useTheme } from '@/design-system/useTheme';
import { useAsync } from '@/hooks/useAsync';
import { ProfileSections } from '@/screens/shared/components/ProfileSections';
import { api } from '@/services/backend';

const passportEntry = new Keyframe({
  0: { opacity: 0, transform: [{ scale: 0.94 }] },
  100: { opacity: 1, transform: [{ scale: 1 }], easing: Easing.out(Easing.cubic) },
}).duration(460).reduceMotion(ReduceMotion.System);

const lungs = require('../../../../assets/images/background/profile-lungs.png');

export function MedicalProfileScreen() {
  const { from } = useLocalSearchParams<{ from?: string }>();
  const { width } = useWindowDimensions();
  const { colors, isDark } = useTheme();
  const { t } = useTranslation();
  const { data, isLoading, error, reload } = useAsync(api.getMyPatient, { refetchOnFocus: true });

  return (
    <Animated.View entering={from === 'passport' ? passportEntry : undefined} style={styles.page}>
      <ScreenContainer help="medicalProfile" showBackgroundLungs={false} edges={['bottom']}>
        {isLoading && !data && <LoadingState />}
        {error && <ErrorState message={error} onRetry={reload} />}
        {data && (
          <View style={styles.content}>
            <View pointerEvents="none" style={styles.art}>
              <Svg width="100%" height="100%" viewBox="0 0 100 100" {...(Platform.OS === 'web' ? { 'aria-hidden': true } : { accessible: false })}>
                <Defs>
                  <LinearGradient id="profileLungsFade" x1="0%" y1="0%" x2="65%" y2="45%">
                    <Stop offset="0" stopColor="white" stopOpacity={0} />
                    <Stop offset="0.48" stopColor="white" stopOpacity={0.05} />
                    <Stop offset="0.78" stopColor="white" stopOpacity={0.52} />
                    <Stop offset="1" stopColor="white" />
                  </LinearGradient>
                  <Mask id="profileLungsMask" maskType="alpha">
                    <Rect width={100} height={100} fill="url(#profileLungsFade)" />
                  </Mask>
                </Defs>
                <Image
                  href={lungs}
                  width={100}
                  height={100}
                  opacity={isDark ? 0.39 : 0.32}
                  mask="url(#profileLungsMask)"
                />
              </Svg>
            </View>
            <View style={styles.overview}>
              <View style={styles.identity}>
                <AppText variant="caption" color="textMuted">{t('home.snapshot')}</AppText>
                <AppText variant="heading" accessibilityRole="header">{data.fullName}</AppText>
              </View>
              <View style={styles.bloodType}>
                <View pointerEvents="none" style={StyleSheet.absoluteFill}>
                  <Svg width="100%" height="100%" viewBox="0 0 240 52" preserveAspectRatio="none">
                    <Defs>
                      <RadialGradient id="blood-type-aura" cx="50%" cy="50%" rx="50%" ry="50%">
                        <Stop offset="0" stopColor={colors.coral} stopOpacity={isDark ? 0.40 : 0.62} />
                        <Stop offset="0.64" stopColor={colors.coral} stopOpacity={isDark ? 0.27 : 0.43} />
                        <Stop offset="1" stopColor={colors.coral} stopOpacity={0} />
                      </RadialGradient>
                    </Defs>
                    <Rect width={240} height={52} fill="url(#blood-type-aura)" />
                  </Svg>
                </View>
                <Ionicons name="water-outline" size={22} color={colors.danger} />
                <AppText variant="body">{t('profile.bloodType')}</AppText>
                <AppText variant="subheading">{data.bloodType || '—'}</AppText>
              </View>
            </View>
            <View style={styles.details}>
              <ProfileSections profile={data} wide={width >= 640} />
              <AppButton title={t('profile.edit')} icon="create-outline" variant="secondary" fullWidth onPress={() => router.push('/patient/edit-profile')} />
            </View>
          </View>
        )}
      </ScreenContainer>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1 },
  content: { gap: spacing.md },
  overview: { gap: spacing.md, paddingVertical: spacing.lg },
  details: { gap: spacing.md },
  identity: { gap: spacing.xxs, paddingRight: spacing.sm },
  art: { position: 'absolute', top: 96, right: '-22%', width: '82%', maxWidth: 430, aspectRatio: 1 },
  bloodType: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderRadius: radius.lg,
    padding: spacing.sm,
  },
});

import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { useTranslation } from 'react-i18next';

import { AppText } from '@/design-system';
import { spacing } from '@/design-system/theme';
import { HtmlScene } from '@/design-system/HtmlScene';
import { isSceneMessage } from '@/design-system/HtmlScene.types';
import passport from '@/design-system/html/medical-passport-button';

export function PassportButton() {
  const { t } = useTranslation();
  const [focused, setFocused] = useState(false);

  useFocusEffect(useCallback(() => {
    setFocused(true);
    return () => setFocused(false);
  }, []));

  if (!focused) return null;

  return (
    <View style={styles.card}>
      <HtmlScene html={passport} height={244} title={t('navigation.patient/passport', { defaultValue: 'Medical passport' })} onMessage={(message) => {
        if (isSceneMessage(message) && message.type === 'openPassport') router.push('/patient/profile');
      }} />
      <View style={styles.details}>
        <AppText variant="heading">{t('home.actions.profile.title')}</AppText>
        <AppText color="textMuted">{t('home.passportTap')}</AppText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { gap: spacing.sm, alignItems: 'center' },
  details: { gap: spacing.xxs, alignItems: 'center' },
});

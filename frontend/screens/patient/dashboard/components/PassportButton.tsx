import { router, useIsFocused } from 'expo-router';
import { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/design-system';
import { HtmlScene } from '@/design-system/HtmlScene';
import { isSceneMessage } from '@/design-system/HtmlScene.types';
import { renderPassport } from '@/design-system/html/medical-passport-button';
import { spacing } from '@/design-system/theme';
import type { PatientProfile } from '@/types';

type PassportProps = { fullName: string; patient?: PatientProfile | null };

export function PassportButton({ fullName, patient }: PassportProps) {
  return useIsFocused() ? <PassportScene fullName={fullName} patient={patient} /> : null;
}

function PassportScene({ fullName, patient }: PassportProps) {
  const { t } = useTranslation();
  const opened = useRef(false);
  const title = t('home.actions.profile.title');
  const hint = t('home.passportTap');

  function openProfile() {
    if (opened.current) return;
    opened.current = true;
    router.push({ pathname: '/patient/profile', params: { from: 'passport' } });
  }

  return (
    <View style={styles.card}>
      <HtmlScene
        html={renderPassport(fullName, patient)}
        height={244}
        title={title}
        onMessage={(message) => {
          if (isSceneMessage(message) && message.type === 'openPassport') openProfile();
        }}
      />
      <Pressable style={styles.details} accessibilityRole="button" accessibilityLabel={title} onPress={openProfile}>
        <AppText variant="heading" align="center">{title}</AppText>
        <AppText color="textMuted" align="center">{hint}</AppText>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { width: '100%', gap: spacing.xxs },
  details: { alignItems: 'center', justifyContent: 'center', minHeight: 48, gap: spacing.xxs },
});

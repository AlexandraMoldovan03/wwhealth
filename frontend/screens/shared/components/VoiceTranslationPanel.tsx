import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { AppCard, AppText } from '@/design-system';
import { spacing } from '@/design-system/theme';
import { useTheme } from '@/design-system/useTheme';
import type { VoiceTranslation } from '@/types';

/** Language name in the app language ("es" → "spaniolă" / "Spanish"); the raw code when the device cannot name it. */
export function languageName(code: string, locale: string): string {
  try {
    return new Intl.DisplayNames([locale], { type: 'language' }).of(code) ?? code.toUpperCase();
  } catch {
    return code.toUpperCase();
  }
}

/**
 * Detected spoken language + translation into the app language, kept apart from the original transcript.
 * Uncertain / impossible translations are shown as such — never silently replaced.
 */
export function VoiceTranslationPanel({ language, translation, children }: {
  language: string | null;
  translation?: VoiceTranslation | null;
  children?: ReactNode;
}) {
  const { t, i18n } = useTranslation();
  const { colors } = useTheme();
  const status = translation?.status;
  const warning = status === 'uncertain' ? t('voiceTranslation.uncertain')
    : status === 'unknown_language' ? t('voiceTranslation.unknownLanguage')
    : status === 'unavailable' ? t('voiceTranslation.unavailable') : null;

  return (
    <View style={styles.wrap}>
      <AppText variant="caption" color="textMuted">
        {language ? t('voiceTranslation.detected', { language: languageName(language, i18n.language) }) : t('voiceTranslation.notDetected')}
      </AppText>
      {warning && (
        <AppCard style={[styles.card, { borderColor: colors.warning }]}>
          <AppText variant="caption" color="warning" accessibilityRole="alert">{warning}</AppText>
          {translation && translation.uncertainParts.length > 0 && (
            <AppText variant="caption" color="textMuted">
              {t('voiceTranslation.check', { parts: translation.uncertainParts.join(' · ') })}
            </AppText>
          )}
        </AppCard>
      )}
      {!!translation?.text && (
        <AppCard style={styles.card}>
          <AppText variant="label" color="textMuted">
            {t('voiceTranslation.title', { language: languageName(translation.targetLanguage, i18n.language) })}
          </AppText>
          <AppText selectable>{translation.text}</AppText>
          <AppText variant="caption" color="textMuted">{t('voiceTranslation.originalKept')}</AppText>
        </AppCard>
      )}
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.xs },
  card: { gap: spacing.xs, borderWidth: StyleSheet.hairlineWidth },
});

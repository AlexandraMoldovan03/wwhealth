import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { AppButton, AppText } from '@/design-system';
import { spacing } from '@/design-system/theme';
import type { NerTerm } from '@/types/smartImport';

const kinds = ['Disease', 'Chemical'] as const;

export function MedicalTerms({ terms }: { terms?: NerTerm[] }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  if (!terms?.length) return null;

  return (
    <View style={styles.group}>
      <AppButton title={t('smart.ner.title')} variant="outline" size="sm"
        accessibilityState={{ expanded: open }} onPress={() => setOpen(!open)} />
      {open && (
        <ScrollView style={styles.list} contentContainerStyle={styles.group} nestedScrollEnabled>
          <AppText variant="caption" color="textMuted">{t('smart.ner.notice')}</AppText>
          {kinds.map((kind) => {
            const group = terms.filter((term) => term.kind === kind);
            if (!group.length) return null;
            return (
              <View key={kind} style={styles.group}>
                <AppText variant="subheading">{t(`smart.ner.${kind}`)}</AppText>
                {group.map((term) => (
                  <View key={`${term.start}:${term.end}`}>
                    <AppText>{term.text}{term.page ? ` · ${t('smart.page', { page: term.page })}` : ''}</AppText>
                    <AppText variant="caption" color="textMuted">{term.context}</AppText>
                  </View>
                ))}
              </View>
            );
          })}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  group: { gap: spacing.sm },
  list: { maxHeight: 220 },
});

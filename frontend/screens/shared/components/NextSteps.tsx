import type { Href } from 'expo-router';
import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { ListRow, SectionHeader } from '@/design-system';
import { spacing } from '@/design-system/theme';
import { useTheme } from '@/design-system/useTheme';
import type { IconName } from '@/types';
import { useTranslation } from 'react-i18next';

export interface NextStepLink {
  /** `nextSteps.<id>.title / .text` in i18n. */
  id: string;
  icon: IconName;
  route: Href;
}

/** After a success: what makes sense to do next. */
export function NextSteps({ steps }: { steps: NextStepLink[] }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  if (steps.length === 0) return null;
  return (
    <View style={styles.wrap}>
      <SectionHeader title={t('nextSteps.title')} />
      {steps.map((s, i) => (
        <ListRow
          key={s.id}
          icon={s.icon}
          iconColor={colors.primary}
          title={t(`nextSteps.${s.id}.title`)}
          subtitle={t(`nextSteps.${s.id}.text`)}
          enterIndex={i + 1}
          onPress={() => router.navigate(s.route)}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({ wrap: { gap: spacing.md } });

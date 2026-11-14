import type { Href } from 'expo-router';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { ListRow, SectionHeader } from '@/design-system';
import { spacing } from '@/design-system/theme';
import { useTheme } from '@/design-system/useTheme';
import type { IconName } from '@/types';
import { useTranslation } from 'react-i18next';

import { markJourneyStepOpened, wasJourneyStepOpened } from '../progressStorage';

const STEPS: { id: 'collect' | 'understand' | 'control' | 'connect'; icon: IconName; route: Href }[] = [
  { id: 'collect', icon: 'folder-open-outline', route: '/records' },
  { id: 'understand', icon: 'sparkles-outline', route: '/insights' },
  { id: 'control', icon: 'key-outline', route: '/patient/doctor-access' },
  { id: 'connect', icon: 'swap-horizontal-outline', route: '/transfer' },
];

/** COLLECT → UNDERSTAND → CONTROL → CONNECT: what each section is good for, one tap away. */
export function JourneyCards({ userId, startIndex = 0 }: { userId: string; startIndex?: number }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const [opened, setOpened] = useState<boolean[] | null>(null);

  useEffect(() => {
    let active = true;
    void Promise.all(STEPS.map((step) => wasJourneyStepOpened(userId, step.id))).then((flags) => {
      if (active) setOpened(flags);
    });
    return () => { active = false; };
  }, [userId]);

  if (!opened || opened.every(Boolean)) return null;

  return (
    <View style={styles.section}>
      <SectionHeader title={t('journey.title')} subtitle={t('journey.subtitle')} />
      {STEPS.map((s, i) => !opened[i] && (
        <ListRow
          key={s.id}
          icon={s.icon}
          iconColor={colors.primary}
          title={`${i + 1}. ${t(`journey.${s.id}.title`)}`}
          subtitle={t(`journey.${s.id}.text`)}
          enterIndex={startIndex + i}
          onPress={async () => {
            setOpened((current) => current?.map((seen, index) => seen || index === i) ?? null);
            await markJourneyStepOpened(userId, s.id);
            router.navigate(s.route);
          }}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({ section: { gap: spacing.md } });

import type { Href } from 'expo-router';
import { router } from 'expo-router';

import { ListRow } from '@/design-system';
import { useTheme } from '@/design-system/useTheme';
import type { IconName } from '@/types';
import { useTranslation } from 'react-i18next';

const STEPS: { id: 'collect' | 'understand' | 'control' | 'connect'; icon: IconName; route: Href }[] = [
  { id: 'collect', icon: 'folder-open-outline', route: '/records' },
  { id: 'understand', icon: 'sparkles-outline', route: '/insights' },
  { id: 'control', icon: 'key-outline', route: '/patient/doctor-access' },
  { id: 'connect', icon: 'swap-horizontal-outline', route: '/transfer' },
];

/** COLLECT → UNDERSTAND → CONTROL → CONNECT: what each section is good for, one tap away. */
export function JourneyCards({ startIndex = 0 }: { startIndex?: number }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  return (
    <>
      {STEPS.map((s, i) => (
        <ListRow
          key={s.id}
          icon={s.icon}
          iconColor={colors.primary}
          title={`${i + 1}. ${t(`journey.${s.id}.title`)}`}
          subtitle={t(`journey.${s.id}.text`)}
          enterIndex={startIndex + i}
          onPress={() => router.navigate(s.route)}
        />
      ))}
    </>
  );
}

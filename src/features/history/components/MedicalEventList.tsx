import { View } from 'react-native';

import { Badge, EmptyState, ListRow } from '@/components/ui';
import { spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/useTheme';
import type { MedicalEvent } from '@/types';
import { formatDateTime } from '@/utils/format';

import { getEventStyle } from '../eventStyle';

/** Medical history timeline. Used by patient (tab) and doctor (summary). */
export function MedicalEventList({ events, onSelect }: { events: MedicalEvent[]; onSelect?: (e: MedicalEvent) => void }) {
  const { colors } = useTheme();
  if (events.length === 0) return <EmptyState icon="time-outline" title="No history yet" />;
  return (
    <View style={{ gap: spacing.md }}>
      {events.map((event) => {
        const style = getEventStyle(event.type, colors);
        return (
          <ListRow
            key={event.id}
            icon={style.icon}
            iconColor={style.color}
            title={event.title}
            subtitle={formatDateTime(event.date)}
            right={<Badge label={style.label} color={style.color} />}
            onPress={onSelect ? () => onSelect(event) : undefined}
          />
        );
      })}
    </View>
  );
}

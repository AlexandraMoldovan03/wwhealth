import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui';
import { iconSize, radius, spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/useTheme';
import type { IconName, UserRole } from '@/types';

const OPTIONS: { value: UserRole; label: string; icon: IconName }[] = [
  { value: 'patient', label: 'Patient', icon: 'person-outline' },
  { value: 'doctor', label: 'Doctor', icon: 'medkit-outline' },
];

export function RoleSelector({ value, onChange }: { value: UserRole; onChange: (role: UserRole) => void }) {
  const { colors } = useTheme();
  return (
    <View style={styles.wrap}>
      <AppText variant="label" color="textMuted">
        I am a
      </AppText>
      <View style={styles.row}>
        {OPTIONS.map((o) => {
          const active = o.value === value;
          return (
            <Pressable
              key={o.value}
              accessibilityRole="radio"
              accessibilityState={{ selected: active }}
              onPress={() => onChange(o.value)}
              style={[
                styles.option,
                { borderColor: active ? colors.primary : colors.border, backgroundColor: active ? colors.primaryMuted : colors.surface },
              ]}
            >
              <Ionicons name={o.icon} size={iconSize.md} color={active ? colors.primary : colors.textMuted} />
              <AppText variant="subheading" color={active ? 'primary' : 'text'}>
                {o.label}
              </AppText>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.xs },
  row: { flexDirection: 'row', gap: spacing.sm },
  option: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm, paddingVertical: spacing.md, borderRadius: radius.md, borderWidth: 1 },
});

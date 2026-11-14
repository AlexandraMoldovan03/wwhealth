import { StyleSheet, View } from 'react-native';

import { Badge } from '@/design-system';
import { spacing } from '@/design-system/theme';
import { useTheme } from '@/design-system/useTheme';
import type { DoctorScope, GrantStatus } from '@/types';
import { useTranslation } from 'react-i18next';

/** The shared sections of a grant (profile / documents / labs). Used by patient and doctor screens. */
export function ScopeBadges({ scopes }: { scopes: DoctorScope[] }) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  return (
    <View style={styles.row}>
      {scopes.map((s) => (
        <Badge key={s} label={t(`consent.scopes.${s}`)} color={colors.primary} />
      ))}
    </View>
  );
}

export function GrantStatusBadge({ status }: { status: GrantStatus }) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const color = { active: colors.success, expired: colors.textMuted, revoked: colors.danger }[status];
  return <Badge label={t(`consent.status.${status}`)} color={color} />;
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
});

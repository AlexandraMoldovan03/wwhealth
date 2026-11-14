import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated from 'react-native-reanimated';
import QRCode from 'react-native-qrcode-svg';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';

import { AppButton, AppCard, AppText, Avatar, fadeIn } from '@/design-system';
import { radius, spacing } from '@/design-system/theme';
import { useTheme } from '@/design-system/useTheme';
import {
  formatCountdown,
  useCountdown,
} from '@/screens/patient/emergency-passport/useCountdown';
import type { FamilyMember } from '@/types';

interface FamilyMemberCardProps {
  member: FamilyMember;
  enterIndex: number;
  onGenerate: (memberId: string) => void;
  onRemove: (memberId: string) => void;
  onExpire: (memberId: string) => void;
}

/** One family member: their QR, the 5-minute countdown and the button that (re)creates it. */
export function FamilyMemberCard({ member, enterIndex, onGenerate, onRemove, onExpire }: FamilyMemberCardProps) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const [confirmRemove, setConfirmRemove] = useState(false);
  const secondsLeft = useCountdown(member.qr?.expiresAt ?? null);
  const active = !!member.qr && secondsLeft > 0;

  // The moment the 5 minutes run out, drop the code from the saved list.
  useEffect(() => {
    if (member.qr && secondsLeft <= 0) onExpire(member.id);
  }, [member.qr, member.id, secondsLeft, onExpire]);

  return (
    <AppCard style={styles.card} enterIndex={enterIndex}>
      <View style={styles.header}>
        <Avatar name={member.name} size={44} />
        <View style={styles.headerText}>
          <AppText variant="heading" numberOfLines={1}>
            {member.name}
          </AppText>
          {!!member.relationship && (
            <AppText variant="caption" color="textMuted" numberOfLines={1}>
              {member.relationship}
            </AppText>
          )}
          {!!member.email && (
            <AppText variant="caption" color="textMuted" numberOfLines={1}>
              {member.email}
            </AppText>
          )}
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('family.remove', { name: member.name })}
          hitSlop={10}
          onPress={() => setConfirmRemove((open) => !open)}
          style={styles.iconButton}
        >
          <Ionicons name="trash-outline" size={20} color={confirmRemove ? colors.danger : colors.textSubtle} />
        </Pressable>
      </View>

      {active && member.qr ? (
        <Animated.View key={member.qr.token} entering={fadeIn()} style={styles.qrSection}>
          {/* White quiet zone so scanners work in dark mode too. */}
          <View style={styles.qrBox}>
            <QRCode value={member.qr.qrPayload} size={180} ecl="M" />
          </View>
          <AppText
            variant="display"
            color={secondsLeft <= 60 ? 'danger' : 'text'}
            accessibilityLabel={t('emergency.timeLeft', { time: formatCountdown(secondsLeft) })}
          >
            {formatCountdown(secondsLeft)}
          </AppText>
          <View style={[styles.track, { backgroundColor: colors.surfaceAlt }]}>
            <View
              style={[
                styles.bar,
                {
                  width: `${Math.min(100, (secondsLeft / member.qr.ttlSeconds) * 100)}%`,
                  backgroundColor: secondsLeft <= 60 ? colors.danger : colors.primary,
                },
              ]}
            />
          </View>
          <AppText variant="caption" color="textMuted" align="center">
            {t('family.qrNote')}
          </AppText>
        </Animated.View>
      ) : (
        <AppText color="textMuted" align="center">
          {member.qr ? t('family.expired') : t('family.noQr')}
        </AppText>
      )}

      <AppButton
        title={active ? t('family.generateNew') : t('family.generate')}
        icon="qr-code-outline"
        variant={active ? 'secondary' : 'primary'}
        fullWidth
        onPress={() => onGenerate(member.id)}
      />

      {confirmRemove && (
        <View style={[styles.confirm, { borderColor: colors.border }]}>
          <AppText variant="caption" color="textMuted">
            {t('family.removeMessage', { name: member.name })}
          </AppText>
          <View style={styles.confirmActions}>
            <AppButton
              title={t('common.cancel')}
              variant="outline"
              size="sm"
              onPress={() => setConfirmRemove(false)}
            />
            <AppButton
              title={t('family.removeAction')}
              icon="trash-outline"
              variant="danger"
              size="sm"
              onPress={() => onRemove(member.id)}
            />
          </View>
        </View>
      )}
    </AppCard>
  );
}

const styles = StyleSheet.create({
  card: { gap: spacing.md },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  headerText: { flex: 1, gap: 2 },
  iconButton: { minWidth: 32, minHeight: 32, alignItems: 'flex-end', justifyContent: 'center' },
  qrSection: { alignItems: 'center', gap: spacing.sm },
  qrBox: {
    padding: spacing.md,
    backgroundColor: '#FFFFFF',
    borderRadius: radius.lg,
  },
  track: {
    height: 6,
    alignSelf: 'stretch',
    borderRadius: radius.pill,
    overflow: 'hidden',
  },
  bar: { height: '100%', borderRadius: radius.pill },
  confirm: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: spacing.sm, gap: spacing.sm },
  confirmActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: spacing.sm },
});

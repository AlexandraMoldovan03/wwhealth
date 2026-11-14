import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import {
  AppButton,
  AppText,
  EmptyState,
  LoadingState,
  ScreenContainer,
} from '@/design-system';
import { spacing } from '@/design-system/theme';
import { useTheme } from '@/design-system/useTheme';
import { useLocalPatientId } from '@/services/auth/useCurrentUser';

import { AddFamilyMemberSheet } from './AddFamilyMemberSheet';
import { FamilyMemberCard } from './FamilyMemberCard';
import { MAX_FAMILY_MEMBERS } from './familyStorage';
import { useFamilyMembers } from './useFamilyMembers';

/**
 * Family tab (patient).
 * Up to 3 family members, each with a 5-minute QR generated on demand — same idea as the
 * emergency passport QR, but kept locally for now (the code does not open medical data yet).
 */
export function FamilyQRScreen() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const patientId = useLocalPatientId();
  const [sheetOpen, setSheetOpen] = useState(false);
  const { members, loading, canAdd, addMember, removeMember, generateQr, clearQr } =
    useFamilyMembers(patientId);

  const openSheet = () => {
    if (canAdd) setSheetOpen(true);
  };

  return (
    <ScreenContainer>
      <View style={styles.heading}>
        <AppText variant="title" accessibilityRole="header">
          {t('family.title')}
        </AppText>
        <AppText color="textMuted">{t('family.intro')}</AppText>
      </View>

      {loading ? (
        <LoadingState count={2} />
      ) : members.length === 0 ? (
        <EmptyState
          icon="people-outline"
          title={t('family.emptyTitle')}
          message={t('family.emptyMessage')}
          actionLabel={t('family.add')}
          onAction={openSheet}
        />
      ) : (
        <View style={styles.list}>
          {members.map((member, index) => (
            <FamilyMemberCard
              key={member.id}
              member={member}
              enterIndex={index}
              onGenerate={generateQr}
              onRemove={removeMember}
              onExpire={clearQr}
            />
          ))}
          {canAdd ? (
            <AppButton
              title={t('family.add')}
              icon="person-add-outline"
              variant="secondary"
              fullWidth
              onPress={openSheet}
            />
          ) : (
            <AppText variant="caption" color="textMuted" align="center">
              {t('family.limit', { max: MAX_FAMILY_MEMBERS })}
            </AppText>
          )}
        </View>
      )}

      <View style={[styles.hint, { borderColor: colors.border }]}>
        <AppText variant="caption" color="textMuted">
          {t('family.footer')}
        </AppText>
      </View>

      <AddFamilyMemberSheet
        visible={sheetOpen}
        onClose={() => setSheetOpen(false)}
        onAdd={(name, relationship) => {
          addMember(name, relationship);
          setSheetOpen(false);
        }}
      />
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  heading: { gap: spacing.xs },
  list: { gap: spacing.md },
  hint: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: spacing.md },
});

import { router, Stack } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { AppButton, AppText, ErrorState, LoadingState, ScreenContainer } from '@/design-system';
import { spacing } from '@/design-system/theme';
import { useAsync } from '@/hooks/useAsync';
import { useSubmit } from '@/hooks/useSubmit';
import { api } from '@/services/backend';
import { markProfileComplete } from '@/services/profileSetup';
import type { PatientRecord } from '@/types';

import { type BasicInfo, BasicInfoFields, basicInfoErrors, basicInfoFrom, basicInfoUpdate } from './BasicInfoFields';

/** First sign-in: name, birth date and sex are required before the app opens (height, weight, contact optional). */
export function ProfileSetupScreen() {
  const { data, isLoading, error, reload } = useAsync(api.getMyPatient);
  return (
    <ScreenContainer edges={['bottom']}>
      <Stack.Screen options={{ headerBackVisible: false, gestureEnabled: false }} />
      {isLoading && <LoadingState />}
      {error && <ErrorState message={error} onRetry={reload} />}
      {data && <SetupForm patient={data} />}
    </ScreenContainer>
  );
}

function SetupForm({ patient }: { patient: PatientRecord }) {
  const { t } = useTranslation();
  const [basics, setBasics] = useState<BasicInfo>(() => basicInfoFrom(patient));
  const [errors, setErrors] = useState<ReturnType<typeof basicInfoErrors>>({});
  const save = useSubmit(api.updateMyProfile);

  useEffect(() => {
    if (save.status !== 'success') return;
    markProfileComplete(patient.id);
    router.replace('/');
  }, [save.status, patient.id]);

  const onSave = () => {
    const next = basicInfoErrors(basics, new Date().toISOString().slice(0, 10));
    setErrors(next);
    if (Object.keys(next).length === 0) void save.run(basicInfoUpdate(basics));
  };

  return (
    <View style={styles.wrap}>
      <View style={styles.heading}>
        <AppText variant="title" accessibilityRole="header">{t('basicInfo.setupTitle')}</AppText>
        <AppText color="textMuted">{t('basicInfo.setupIntro')}</AppText>
      </View>
      <BasicInfoFields value={basics} onChange={setBasics} errors={errors} />
      {Object.keys(errors).length > 0 && <AppText color="danger">{t('basicInfo.fixErrors')}</AppText>}
      {save.error && <ErrorState title={t('editProfile.couldNotSave')} message={save.error} />}
      <AppButton title={t('basicInfo.continue')} icon="checkmark" fullWidth loading={save.isLoading} onPress={onSave} />
    </View>
  );
}

const styles = StyleSheet.create({ wrap: { gap: spacing.lg }, heading: { gap: spacing.xs } });

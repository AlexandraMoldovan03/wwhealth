import { Ionicons } from '@expo/vector-icons';
import { router, Stack } from 'expo-router';
import { useCallback, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { AppButton, AppCard, AppInput, AppText, EmptyState, ErrorState, LoadingState, ScreenContainer, SectionHeader } from '@/design-system';
import { spacing } from '@/design-system/theme';
import { useTheme } from '@/design-system/useTheme';
import { useAsync } from '@/hooks/useAsync';
import { useLanguage } from '@/hooks/useLanguage';
import { useSubmit } from '@/hooks/useSubmit';
import { AppointmentCard } from '@/screens/shared/components/AppointmentCard';
import { SlotPicker } from '@/screens/shared/components/SlotPicker';
import { api } from '@/services/backend';
import type { Slot } from '@/types';
import { useTranslation } from 'react-i18next';

/** Pick a free slot of one doctor and send a booking request; the doctor accepts, rejects or proposes another time. */
export function BookAppointmentScreen({ doctorId, specialtyId, doctorName }: { doctorId: string; specialtyId?: string; doctorName?: string }) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const language = useLanguage();
  const load = useCallback(() => api.listDoctorSlots(doctorId), [doctorId]);
  const slots = useAsync(load);
  const book = useSubmit(api.requestAppointment);
  const [selected, setSelected] = useState<Slot | null>(null);
  const [note, setNote] = useState('');

  const submit = async () => {
    if (!selected) return;
    const res = await book.run({ slotId: selected.id, specialtyId: specialtyId ?? null, note: note.trim() || null }, language);
    if (!res) {
      setSelected(null);
      await slots.reload(); // the slot may have just been taken
    }
  };

  return (
    <ScreenContainer edges={['bottom']} help="appointments">
      <Stack.Screen options={{ title: doctorName ?? t('screens.patient/book/[doctorId]') }} />

      {book.data ? (
        <>
          <AppCard style={styles.card} enterIndex={0}>
            <View style={styles.row}>
              <Ionicons name="checkmark-circle" size={22} color={colors.success} />
              <AppText variant="subheading" style={styles.flex}>
                {t('care.book.sentTitle')}
              </AppText>
            </View>
            <AppText color="textMuted">{t('care.book.sentText')}</AppText>
          </AppCard>
          <AppointmentCard appointment={book.data} perspective="patient" enterIndex={1} />
          <AppButton title={t('care.myAppointments')} icon="calendar-outline" fullWidth onPress={() => router.replace('/patient/appointments')} />
        </>
      ) : (
        <>
          <SectionHeader title={t('care.book.slotsTitle')} subtitle={t('care.book.slotsHint')} />
          {slots.error && !slots.data && <ErrorState message={slots.error} onRetry={slots.reload} />}
          {!slots.data && !slots.error && <LoadingState count={2} />}
          {slots.data && slots.data.length === 0 && (
            <EmptyState
              icon="calendar-outline"
              title={t('care.book.noSlots')}
              message={t('care.doctors.noneText')}
              actionLabel={t('care.doctors.otherSpecialty')}
              onAction={() => router.push('/patient/specialties')}
            />
          )}
          {slots.data && slots.data.length > 0 && <SlotPicker slots={slots.data} selectedId={selected?.id} onSelect={setSelected} />}

          <AppInput
            label={t('care.book.noteLabel')}
            placeholder={t('care.book.notePlaceholder')}
            value={note}
            onChangeText={setNote}
            maxLength={500}
            multiline
          />
          <AppText variant="caption" color="textMuted">
            {t('care.book.noteHint')}
          </AppText>
          <AppButton title={t('care.book.submit')} icon="send-outline" fullWidth disabled={!selected} loading={book.isLoading} onPress={() => void submit()} />
          {book.error && <ErrorState message={book.error} />}
        </>
      )}
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  card: { gap: spacing.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  flex: { flex: 1 },
});

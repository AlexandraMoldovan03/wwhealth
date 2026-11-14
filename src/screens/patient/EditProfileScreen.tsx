import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { type ReactNode, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Switch, View } from 'react-native';

import { AppButton, AppCard, AppInput, AppText, ErrorState, LoadingState, ScreenContainer, SectionHeader } from '@/components/ui';
import { iconSize, spacing } from '@/constants/theme';
import { CategoryFilter } from '@/features/explore/components/CategoryFilter';
import { BLOOD_TYPES, SEVERITIES } from '@/features/patient/profileMeta';
import { useAsync } from '@/hooks/useAsync';
import { useSubmit } from '@/hooks/useSubmit';
import { useTheme } from '@/hooks/useTheme';
import { api } from '@/services/backend';
import type { AllergyInput, BloodType, DiagnosisInput, PatientRecord, TreatmentInput } from '@/types';
import { useTranslation } from 'react-i18next';

const UNKNOWN = 'Unknown';
type BloodChoice = BloodType | typeof UNKNOWN;
const BLOOD_OPTIONS: readonly BloodChoice[] = [UNKNOWN, ...BLOOD_TYPES];

/** Edit blood type, allergies, conditions and medication → PATCH /api/v1/patients/me. */
export function EditProfileScreen() {
  const { data, isLoading, error, reload } = useAsync(api.getMyPatient);
  return (
    <ScreenContainer edges={['bottom']}>
      {isLoading && <LoadingState />}
      {error && <ErrorState message={error} onRetry={reload} />}
      {data && <EditForm patient={data} />}
    </ScreenContainer>
  );
}

function EditForm({ patient }: { patient: PatientRecord }) {
  const { t } = useTranslation();
  const [bloodType, setBloodType] = useState<BloodChoice>((patient.bloodType as BloodType | null) ?? UNKNOWN);
  const [allergies, setAllergies] = useState<AllergyInput[]>(patient.allergies);
  const [diagnoses, setDiagnoses] = useState<DiagnosisInput[]>(patient.diagnoses);
  const [treatments, setTreatments] = useState<TreatmentInput[]>(patient.treatments);
  const [showErrors, setShowErrors] = useState(false);
  const save = useSubmit(api.updateMyProfile);

  useEffect(() => {
    if (save.status === 'success') router.back();
  }, [save.status]);

  const missingName =
    allergies.some((a) => !a.substance.trim()) || diagnoses.some((d) => !d.name.trim()) || treatments.some((tr) => !tr.name.trim());

  const onSave = () => {
    setShowErrors(true);
    if (missingName) return;
    void save.run({ bloodType: bloodType === UNKNOWN ? null : bloodType, allergies, diagnoses, treatments });
  };

  const update = <T,>(list: T[], set: (v: T[]) => void, index: number, patch: Partial<T>) =>
    set(list.map((item, i) => (i === index ? { ...item, ...patch } : item)));
  const remove = <T,>(list: T[], set: (v: T[]) => void, index: number) => set(list.filter((_, i) => i !== index));
  const required = (value: string) => (showErrors && !value.trim() ? t('editProfile.required') : undefined);

  return (
    <>
      <View style={styles.section}>
        <SectionHeader title={t('profile.bloodType')} />
        <CategoryFilter
          options={BLOOD_OPTIONS}
          value={bloodType}
          onChange={setBloodType}
          getLabel={(b) => (b === UNKNOWN ? t('editProfile.unknown') : b)}
        />
      </View>

      <EditableSection
        title={t('editProfile.allergies')}
        addLabel={t('editProfile.addAllergy')}
        onAdd={() => setAllergies([...allergies, { substance: '', reaction: '', severity: 'mild' }])}
        empty={allergies.length === 0}
      >
        {allergies.map((a, i) => (
          <ItemCard key={a.id ?? `new-${i}`} onRemove={() => remove(allergies, setAllergies, i)}>
            <AppInput label={t('editProfile.substance')} placeholder={t('editProfile.substancePlaceholder')} value={a.substance} error={required(a.substance)}
              onChangeText={(v) => update(allergies, setAllergies, i, { substance: v })} />
            <AppInput label={t('editProfile.reaction')} placeholder={t('editProfile.reactionPlaceholder')} value={a.reaction}
              onChangeText={(v) => update(allergies, setAllergies, i, { reaction: v })} />
            <CategoryFilter options={SEVERITIES} value={a.severity} getLabel={(v) => t(`enums.severity.${v}`)}
              onChange={(v) => update(allergies, setAllergies, i, { severity: v })} />
          </ItemCard>
        ))}
      </EditableSection>

      <EditableSection
        title={t('editProfile.conditions')}
        addLabel={t('editProfile.addCondition')}
        onAdd={() => setDiagnoses([...diagnoses, { name: '', status: 'active' }])}
        empty={diagnoses.length === 0}
      >
        {diagnoses.map((d, i) => (
          <ItemCard key={d.id ?? `new-${i}`} onRemove={() => remove(diagnoses, setDiagnoses, i)}>
            <AppInput label={t('editProfile.condition')} placeholder={t('editProfile.conditionPlaceholder')} value={d.name} error={required(d.name)}
              onChangeText={(v) => update(diagnoses, setDiagnoses, i, { name: v })} />
            <CategoryFilter options={['active', 'resolved'] as const} value={d.status} getLabel={(v) => t(`enums.diagnosisStatus.${v}`)}
              onChange={(v) => update(diagnoses, setDiagnoses, i, { status: v })} />
          </ItemCard>
        ))}
      </EditableSection>

      <EditableSection
        title={t('editProfile.medication')}
        addLabel={t('editProfile.addMedication')}
        onAdd={() => setTreatments([...treatments, { name: '', dosage: '', frequency: '', active: true }])}
        empty={treatments.length === 0}
      >
        {treatments.map((tr, i) => (
          <ItemCard key={tr.id ?? `new-${i}`} onRemove={() => remove(treatments, setTreatments, i)}>
            <AppInput label={t('editProfile.medicationName')} placeholder={t('editProfile.medicationPlaceholder')} value={tr.name} error={required(tr.name)}
              onChangeText={(v) => update(treatments, setTreatments, i, { name: v })} />
            <View style={styles.row}>
              <View style={styles.flex}>
                <AppInput label={t('editProfile.dosage')} placeholder="200 mcg" value={tr.dosage}
                  onChangeText={(v) => update(treatments, setTreatments, i, { dosage: v })} />
              </View>
              <View style={styles.flex}>
                <AppInput label={t('editProfile.frequency')} placeholder={t('editProfile.frequencyPlaceholder')} value={tr.frequency}
                  onChangeText={(v) => update(treatments, setTreatments, i, { frequency: v })} />
              </View>
            </View>
            <View style={styles.switchRow}>
              <AppText>{t('editProfile.currentlyTaking')}</AppText>
              <Switch value={tr.active} onValueChange={(v) => update(treatments, setTreatments, i, { active: v })} />
            </View>
          </ItemCard>
        ))}
      </EditableSection>

      {showErrors && missingName && <AppText color="danger">{t('editProfile.fillOrRemove')}</AppText>}
      {save.error && <ErrorState title={t('editProfile.couldNotSave')} message={save.error} />}
      <AppButton title={t('editProfile.save')} icon="checkmark" fullWidth loading={save.isLoading} onPress={onSave} />
    </>
  );
}

function EditableSection(props: { title: string; addLabel: string; onAdd: () => void; empty: boolean; children: ReactNode }) {
  const { t } = useTranslation();
  return (
    <View style={styles.section}>
      <SectionHeader title={props.title} />
      {props.empty && <AppText color="textMuted">{t('profile.noneRecorded')}</AppText>}
      {props.children}
      <AppButton title={props.addLabel} icon="add" variant="secondary" size="sm" onPress={props.onAdd} />
    </View>
  );
}

function ItemCard({ children, onRemove }: { children: ReactNode; onRemove: () => void }) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  return (
    <AppCard style={styles.item}>
      <Pressable onPress={onRemove} hitSlop={10} accessibilityRole="button" accessibilityLabel={t('editProfile.remove')} style={styles.remove}>
        <Ionicons name="trash-outline" size={iconSize.md} color={colors.danger} />
      </Pressable>
      {children}
    </AppCard>
  );
}

const styles = StyleSheet.create({
  section: { gap: spacing.sm },
  item: { gap: spacing.sm, paddingTop: spacing.lg },
  remove: { position: 'absolute', top: spacing.sm, right: spacing.sm, zIndex: 1 },
  row: { flexDirection: 'row', gap: spacing.sm },
  flex: { flex: 1 },
  switchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
});

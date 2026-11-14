import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { type ReactNode, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Switch, View } from 'react-native';

import { AppButton, AppCard, AppInput, AppText, ErrorState, LoadingState, ScreenContainer, SectionHeader } from '@/design-system';
import { iconSize, spacing } from '@/design-system/theme';
import { CategoryFilter } from '@/design-system/components/CategoryFilter';
import { BLOOD_TYPES, SEVERITIES } from './profileMeta';
import { useAsync } from '@/hooks/useAsync';
import { useSubmit } from '@/hooks/useSubmit';
import { useTheme } from '@/design-system/useTheme';
import { api } from '@/services/backend';
import type { AllergyInput, BloodType, DiagnosisInput, PatientRecord, ProfileUpdate, Sex, SurgeryInput, TreatmentInput } from '@/types';
import { useTranslation } from 'react-i18next';

const UNKNOWN = 'Unknown';
type BloodChoice = BloodType | typeof UNKNOWN;
const SEX_OPTIONS = [UNKNOWN, 'female', 'male', 'other'] as const;

function validBirthDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || value.startsWith('0000')) return false;
  const parsed = new Date(value + 'T00:00:00');
  return Number.isFinite(parsed.getTime()) && parsed <= new Date()
    && parsed.getFullYear() === Number(value.slice(0, 4))
    && parsed.getMonth() + 1 === Number(value.slice(5, 7))
    && parsed.getDate() === Number(value.slice(8, 10));
}

function measurement(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return null;
  return /^\d+(?:[.,]\d)?$/.test(trimmed) ? Number(trimmed.replace(',', '.')) : NaN;
}

const BLOOD_OPTIONS: readonly BloodChoice[] = [UNKNOWN, ...BLOOD_TYPES];
const SURGERY_DATE = /^\d{4}(-\d{2}(-\d{2})?)?$/;

/** Edit blood type, allergies, conditions, medication and surgeries → PATCH /api/v1/patients/me. */
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
  const [fullName, setFullName] = useState(patient.fullName);
  const [birthDate, setBirthDate] = useState(patient.dateOfBirth ?? '');
  const [sex, setSex] = useState<Sex | typeof UNKNOWN>(patient.sex ?? UNKNOWN);
  const [height, setHeight] = useState(patient.heightCm?.toString() ?? '');
  const [weight, setWeight] = useState(patient.weightKg?.toString() ?? '');
  const [bloodType, setBloodType] = useState<BloodChoice>((patient.bloodType as BloodType | null) ?? UNKNOWN);
  const [allergies, setAllergies] = useState<AllergyInput[]>(patient.allergies);
  const [diagnoses, setDiagnoses] = useState<DiagnosisInput[]>(patient.diagnoses);
  const [treatments, setTreatments] = useState<TreatmentInput[]>(patient.treatments);
  const [surgeries, setSurgeriesState] = useState<SurgeryInput[]>(patient.surgeries ?? []);
  const [surgeriesTouched, setSurgeriesTouched] = useState(false);
  const setSurgeries = (v: SurgeryInput[]) => {
    setSurgeriesState(v);
    setSurgeriesTouched(true);
  };
  const [showErrors, setShowErrors] = useState(false);
  const save = useSubmit(api.updateMyProfile);

  useEffect(() => {
    if (save.status === 'success') router.back();
  }, [save.status]);

  const missingName =
    allergies.some((a) => !a.substance.trim()) ||
    diagnoses.some((d) => !d.name.trim()) ||
    treatments.some((tr) => !tr.name.trim()) ||
    surgeries.some((s) => !s.name.trim());
  const badDate = surgeries.some((s) => !!s.date && !SURGERY_DATE.test(s.date));

  const heightCm = measurement(height);
  const weightKg = measurement(weight);
  const invalidBirthDate = !!birthDate.trim() && !validBirthDate(birthDate.trim());
  const invalidHeight = heightCm !== null && !(heightCm >= 30 && heightCm <= 260);
  const invalidWeight = weightKg !== null && !(weightKg >= 1 && weightKg <= 400);
  const invalidName = fullName !== patient.fullName && !fullName.trim();

  const onSave = () => {
    setShowErrors(true);
    if (missingName || badDate || invalidBirthDate || invalidHeight || invalidWeight || invalidName) return;
    const update: ProfileUpdate = { bloodType: bloodType === UNKNOWN ? null : bloodType, allergies, diagnoses, treatments };
    if (fullName !== patient.fullName) update.fullName = fullName.trim();
    if (birthDate.trim() !== (patient.dateOfBirth ?? '')) update.dateOfBirth = birthDate.trim() || null;
    const selectedSex = sex === UNKNOWN ? null : sex;
    if (selectedSex !== patient.sex) update.sex = selectedSex;
    if (heightCm !== patient.heightCm) update.heightCm = heightCm;
    if (weightKg !== patient.weightKg) update.weightKg = weightKg;
    // Sent only when edited, so saving still works on a server without the surgeries migration.
    if (surgeriesTouched) update.surgeries = surgeries.map((s) => ({ ...s, date: s.date?.trim() || null }));
    void save.run(update);
  };

  const update = <T,>(list: T[], set: (v: T[]) => void, index: number, patch: Partial<T>) =>
    set(list.map((item, i) => (i === index ? { ...item, ...patch } : item)));
  const remove = <T,>(list: T[], set: (v: T[]) => void, index: number) => set(list.filter((_, i) => i !== index));
  const required = (value: string) => (showErrors && !value.trim() ? t('editProfile.required') : undefined);

  return (
    <>
      <View style={styles.section}>
        <SectionHeader title={t('profile.personalDetails')} />
        <AppCard style={styles.section}>
          <AppInput label={t('profile.name')} value={fullName} onChangeText={setFullName} maxLength={120}
            error={showErrors && invalidName ? t('editProfile.required') : undefined} />
          <AppInput label={t('editProfile.birthDate')} placeholder="YYYY-MM-DD" value={birthDate} onChangeText={setBirthDate}
            error={showErrors && invalidBirthDate ? t('editProfile.birthDateInvalid') : undefined} />
          <AppText variant="label" color="textMuted">{t('profile.sex')}</AppText>
          <CategoryFilter options={SEX_OPTIONS} value={sex} onChange={setSex}
            getLabel={(value) => value === UNKNOWN ? t('editProfile.unknown') : t('enums.sex.' + value)} />
          <AppInput label={t('editProfile.height')} value={height} onChangeText={setHeight} keyboardType="decimal-pad"
            error={showErrors && invalidHeight ? t('editProfile.heightInvalid') : undefined} />
          <AppInput label={t('editProfile.weight')} value={weight} onChangeText={setWeight} keyboardType="decimal-pad"
            error={showErrors && invalidWeight ? t('editProfile.weightInvalid') : undefined} />
        </AppCard>
      </View>

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

      <EditableSection
        title={t('editProfile.surgeries')}
        addLabel={t('editProfile.addSurgery')}
        onAdd={() => setSurgeries([...surgeries, { name: '', date: '', notes: '' }])}
        empty={surgeries.length === 0}
      >
        {surgeries.map((s, i) => (
          <ItemCard key={s.id ?? `new-${i}`} onRemove={() => remove(surgeries, setSurgeries, i)}>
            <AppInput label={t('editProfile.surgeryName')} placeholder={t('editProfile.surgeryPlaceholder')} value={s.name} error={required(s.name)}
              onChangeText={(v) => update(surgeries, setSurgeries, i, { name: v })} />
            <AppInput
              label={t('editProfile.surgeryDate')}
              placeholder={t('editProfile.surgeryDatePlaceholder')}
              value={s.date ?? ''}
              keyboardType="numbers-and-punctuation"
              error={showErrors && !!s.date && !SURGERY_DATE.test(s.date) ? t('editProfile.surgeryDateInvalid') : undefined}
              onChangeText={(v) => update(surgeries, setSurgeries, i, { date: v })}
            />
            <AppInput label={t('editProfile.surgeryNotes')} placeholder={t('editProfile.surgeryNotesPlaceholder')} value={s.notes ?? ''}
              onChangeText={(v) => update(surgeries, setSurgeries, i, { notes: v })} />
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

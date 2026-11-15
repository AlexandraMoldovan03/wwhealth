import { StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { AppInput, AppText, SectionHeader } from '@/design-system';
import { CategoryFilter } from '@/design-system/components/CategoryFilter';
import { spacing } from '@/design-system/theme';
import type { PatientRecord, ProfileUpdate, Sex } from '@/types';

export interface BasicInfo {
  fullName: string;
  dateOfBirth: string;
  sex: Sex | null;
  heightCm: string;
  weightKg: string;
  contactName: string;
  contactPhone: string;
  contactRelation: string;
}

const SEXES: readonly Sex[] = ['female', 'male', 'other'];
const ISO = /^\d{4}-\d{2}-\d{2}$/;
const PHONE = /^[0-9+()./ -]{3,40}$/;

export function basicInfoFrom(p: PatientRecord): BasicInfo {
  return {
    fullName: p.fullName ?? '',
    dateOfBirth: p.dateOfBirth ?? '',
    sex: p.sex ?? null,
    heightCm: p.heightCm != null ? String(p.heightCm) : '',
    weightKg: p.weightKg != null ? String(p.weightKg) : '',
    contactName: p.emergencyContact?.name ?? '',
    contactPhone: p.emergencyContact?.phone ?? '',
    contactRelation: p.emergencyContact?.relation ?? '',
  };
}

const num = (v: string) => Number(v.replace(',', '.'));

function validDate(v: string, today: string): boolean {
  if (!ISO.test(v)) return false;
  const d = new Date(`${v}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v && v <= today && v >= '1900-01-01';
}

/** Field → error key (i18n `basicInfo.errors.*`). Name, birth date and sex are required. */
export function basicInfoErrors(b: BasicInfo, today: string): Partial<Record<keyof BasicInfo, string>> {
  const e: Partial<Record<keyof BasicInfo, string>> = {};
  if (!b.fullName.trim()) e.fullName = 'required';
  if (!b.dateOfBirth.trim()) e.dateOfBirth = 'required';
  else if (!validDate(b.dateOfBirth.trim(), today)) e.dateOfBirth = 'date';
  if (!b.sex) e.sex = 'required';
  if (b.heightCm.trim() && !(num(b.heightCm) >= 30 && num(b.heightCm) <= 260)) e.heightCm = 'height';
  if (b.weightKg.trim() && !(num(b.weightKg) >= 1 && num(b.weightKg) <= 400)) e.weightKg = 'weight';
  const anyContact = b.contactName.trim() || b.contactPhone.trim() || b.contactRelation.trim();
  if (anyContact && !b.contactName.trim()) e.contactName = 'required';
  if (anyContact && !PHONE.test(b.contactPhone.trim())) e.contactPhone = 'phone';
  return e;
}

export function basicInfoUpdate(b: BasicInfo): ProfileUpdate {
  const hasContact = !!(b.contactName.trim() || b.contactPhone.trim());
  return {
    fullName: b.fullName.trim(),
    dateOfBirth: b.dateOfBirth.trim() || null,
    sex: b.sex,
    heightCm: b.heightCm.trim() ? num(b.heightCm) : null,
    weightKg: b.weightKg.trim() ? num(b.weightKg) : null,
    emergencyContact: hasContact
      ? { name: b.contactName.trim(), phone: b.contactPhone.trim(), relation: b.contactRelation.trim() }
      : null,
  };
}

/** Name, birth date, sex, height, weight, emergency contact — used at sign-up and in "Edit profile". */
export function BasicInfoFields({ value, onChange, errors }: {
  value: BasicInfo;
  onChange: (next: BasicInfo) => void;
  errors?: Partial<Record<keyof BasicInfo, string>>;
}) {
  const { t } = useTranslation();
  const set = (patch: Partial<BasicInfo>) => onChange({ ...value, ...patch });
  const err = (k: keyof BasicInfo) => (errors?.[k] ? t(`basicInfo.errors.${errors[k]}`) : undefined);

  return (
    <View style={styles.section}>
      <SectionHeader title={t('basicInfo.title')} />
      <AppInput label={t('basicInfo.fullName')} value={value.fullName} onChangeText={(v) => set({ fullName: v })}
        error={err('fullName')} maxLength={120} autoComplete="name" textContentType="name" />
      <AppInput label={t('basicInfo.dateOfBirth')} placeholder={t('basicInfo.datePlaceholder')} value={value.dateOfBirth}
        onChangeText={(v) => set({ dateOfBirth: v })} error={err('dateOfBirth')} keyboardType="numbers-and-punctuation" maxLength={10} />
      <View style={styles.field}>
        <AppText variant="label" color="textMuted">{t('basicInfo.sex')}</AppText>
        <CategoryFilter options={SEXES} value={(value.sex ?? '') as Sex} onChange={(v) => set({ sex: v })}
          getLabel={(v) => t(`basicInfo.sexes.${v}`)} />
        {!!err('sex') && <AppText variant="caption" color="danger">{err('sex')}</AppText>}
      </View>
      <View style={styles.row}>
        <View style={styles.flex}>
          <AppInput label={t('basicInfo.height')} value={value.heightCm} onChangeText={(v) => set({ heightCm: v })}
            error={err('heightCm')} keyboardType="decimal-pad" maxLength={5} />
        </View>
        <View style={styles.flex}>
          <AppInput label={t('basicInfo.weight')} value={value.weightKg} onChangeText={(v) => set({ weightKg: v })}
            error={err('weightKg')} keyboardType="decimal-pad" maxLength={5} />
        </View>
      </View>
      <AppText variant="label" color="textMuted">{t('basicInfo.contact')}</AppText>
      <AppInput label={t('basicInfo.contactName')} value={value.contactName} onChangeText={(v) => set({ contactName: v })}
        error={err('contactName')} maxLength={120} />
      <View style={styles.row}>
        <View style={styles.flex}>
          <AppInput label={t('basicInfo.contactPhone')} value={value.contactPhone} onChangeText={(v) => set({ contactPhone: v })}
            error={err('contactPhone')} keyboardType="phone-pad" maxLength={40} />
        </View>
        <View style={styles.flex}>
          <AppInput label={t('basicInfo.contactRelation')} value={value.contactRelation}
            onChangeText={(v) => set({ contactRelation: v })} maxLength={40} />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: spacing.sm },
  field: { gap: spacing.xs },
  row: { flexDirection: 'row', gap: spacing.sm },
  flex: { flex: 1 },
});

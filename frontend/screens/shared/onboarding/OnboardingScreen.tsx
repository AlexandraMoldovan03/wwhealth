import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import Animated from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppButton, AppCard, AppInput, AppText, ErrorState, enterUp, tapFeedback } from '@/design-system';
import { gradients, radius, sizes, spacing } from '@/design-system/theme';
import { useCurrentUser } from '@/services/auth/useCurrentUser';
import { CategoryFilter } from '@/design-system/components/CategoryFilter';
import { ChipList } from './components/ChipList';
import { setOnboarded } from './onboardingStorage';
import { useTheme } from '@/design-system/useTheme';
import { api } from '@/services/backend';
import type { BloodType, IconName, Severity } from '@/types';
import { getErrorMessage } from '@/utils/errors';
import { useTranslation } from 'react-i18next';

const BLOOD_TYPES: BloodType[] = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];
const SEVERITIES: Severity[] = ['mild', 'moderate', 'severe'];
type BloodChoice = BloodType | 'unknown' | null;
interface NewAllergy { key: string; substance: string; severity: Severity }
interface NewMedication { key: string; name: string; dosage: string }

const uid = () => Math.random().toString(36).slice(2, 10);

/**
 * First sign-in. Patient: optional minimal medical profile (blood type incl. "I don't know", allergies,
 * chronic conditions, current medication) saved through PATCH /patients/me. Nothing is pre-filled or invented.
 * Doctor: three short screens about the emergency flow. Both can be skipped and reopened from Profile.
 */
export function OnboardingScreen() {
  const { colors, isDark } = useTheme();
  const { t } = useTranslation();
  const user = useCurrentUser();
  const isDoctor = user?.role === 'doctor';
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [blood, setBlood] = useState<BloodChoice>(null);
  const [allergies, setAllergies] = useState<NewAllergy[]>([]);
  const [allergyText, setAllergyText] = useState('');
  const [severity, setSeverity] = useState<Severity | null>(null);
  const [conditions, setConditions] = useState<{ key: string; name: string }[]>([]);
  const [conditionText, setConditionText] = useState('');
  const [meds, setMeds] = useState<NewMedication[]>([]);
  const [medName, setMedName] = useState('');
  const [medDose, setMedDose] = useState('');

  const doctorSlides: { icon: IconName; title: string; text: string }[] = [
    { icon: 'qr-code-outline', title: t('onboarding.doctor.s1Title'), text: t('onboarding.doctor.s1Text') },
    { icon: 'eye-off-outline', title: t('onboarding.doctor.s2Title'), text: t('onboarding.doctor.s2Text') },
    { icon: 'shield-checkmark-outline', title: t('onboarding.doctor.s3Title'), text: t('onboarding.doctor.s3Text') },
  ];
  const total = isDoctor ? doctorSlides.length : 5;
  const isLast = step === total - 1;

  const finish = async () => {
    if (user) await setOnboarded(user.id);
    router.replace('/');
  };

  const savePatient = async () => {
    setSaving(true);
    setError(null);
    try {
      const hasNew = (blood && blood !== 'unknown') || allergies.length || conditions.length || meds.length;
      if (hasNew) {
        // Merge with what is already stored (lists replace the whole list on the backend).
        const current = await api.getMyPatient();
        await api.updateMyProfile({
          ...(blood && blood !== 'unknown' ? { bloodType: blood } : {}),
          ...(allergies.length
            ? {
                allergies: [
                  ...current.allergies.map(({ id, substance, reaction, severity: s }) => ({ id, substance, reaction, severity: s })),
                  ...allergies.map((a) => ({ substance: a.substance, reaction: '', severity: a.severity })),
                ],
              }
            : {}),
          ...(conditions.length
            ? {
                diagnoses: [
                  ...current.diagnoses.map(({ id, name, icd10, diagnosedAt, status }) => ({ id, name, icd10, diagnosedAt, status })),
                  ...conditions.map((c) => ({ name: c.name, status: 'active' as const })),
                ],
              }
            : {}),
          ...(meds.length
            ? {
                treatments: [
                  ...current.treatments.map(({ id, name, dosage, frequency, startDate, endDate, active }) => ({
                    id, name, dosage, frequency, startDate, endDate, active,
                  })),
                  ...meds.map((m) => ({ name: m.name, dosage: m.dosage, frequency: '', active: true })),
                ],
              }
            : {}),
        });
      }
      tapFeedback('success');
      await finish();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const next = () => {
    if (!isLast) return setStep((s) => s + 1);
    if (isDoctor) return void finish();
    void savePatient();
  };

  const addAllergy = () => {
    if (!allergyText.trim() || !severity) return;
    setAllergies((list) => [...list, { key: uid(), substance: allergyText.trim(), severity }]);
    setAllergyText('');
    setSeverity(null);
  };
  const addCondition = () => {
    if (!conditionText.trim()) return;
    setConditions((list) => [...list, { key: uid(), name: conditionText.trim() }]);
    setConditionText('');
  };
  const addMed = () => {
    if (!medName.trim()) return;
    setMeds((list) => [...list, { key: uid(), name: medName.trim(), dosage: medDose.trim() }]);
    setMedName('');
    setMedDose('');
  };

  const renderPatientStep = () => {
    switch (step) {
      case 0:
        return (
          <StepIntro icon="leaf-outline" title={
              user?.fullName
                ? t('onboarding.patient.welcomeTitleName', { name: user.fullName.split(' ')[0] })
                : t('onboarding.patient.welcomeTitle')
            } text={t('onboarding.patient.welcomeText')} />
        );
      case 1:
        return (
          <View style={styles.stepBody}>
            <StepTitle title={t('onboarding.patient.bloodTitle')} text={t('onboarding.patient.bloodText')} />
            <View style={styles.grid}>
              {[...BLOOD_TYPES, 'unknown' as const].map((b) => {
                const active = blood === b;
                return (
                  <Pressable
                    key={b}
                    onPress={() => setBlood(active ? null : b)}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: active }}
                    accessibilityLabel={b === 'unknown' ? t('onboarding.patient.bloodUnknown') : b}
                    style={[
                      styles.bloodCell,
                      b === 'unknown' && styles.bloodUnknown,
                      { backgroundColor: active ? colors.ink : colors.surface, borderColor: active ? colors.ink : colors.border },
                    ]}
                  >
                    <AppText variant={b === 'unknown' ? 'subheading' : 'heading'} style={{ color: active ? colors.onInk : colors.text }}>
                      {b === 'unknown' ? t('onboarding.patient.bloodUnknown') : b}
                    </AppText>
                  </Pressable>
                );
              })}
            </View>
          </View>
        );
      case 2:
        return (
          <View style={styles.stepBody}>
            <StepTitle title={t('onboarding.patient.allergiesTitle')} text={t('onboarding.patient.allergiesText')} />
            <AppInput
              label={t('onboarding.patient.allergyLabel')}
              icon="alert-circle-outline"
              placeholder={t('onboarding.patient.allergyPlaceholder')}
              value={allergyText}
              onChangeText={setAllergyText}
              returnKeyType="done"
            />
            <AppText variant="label" color="textMuted">
              {t('onboarding.patient.severity')}
            </AppText>
            <CategoryFilter
              options={SEVERITIES}
              value={(severity ?? '') as Severity}
              onChange={setSeverity}
              getLabel={(s) => t(`enums.severity.${s}`)}
            />
            <AppButton
              title={t('onboarding.add')}
              icon="add"
              variant="secondary"
              size="sm"
              disabled={!allergyText.trim() || !severity}
              onPress={addAllergy}
            />
            <ChipList
              items={allergies.map((a) => ({ key: a.key, label: `${a.substance} · ${t(`enums.severity.${a.severity}`)}` }))}
              onRemove={(k) => setAllergies((l) => l.filter((a) => a.key !== k))}
            />
          </View>
        );
      case 3:
        return (
          <View style={styles.stepBody}>
            <StepTitle title={t('onboarding.patient.conditionsTitle')} text={t('onboarding.patient.conditionsText')} />
            <AppInput
              label={t('onboarding.patient.conditionLabel')}
              icon="pulse-outline"
              placeholder={t('onboarding.patient.conditionPlaceholder')}
              value={conditionText}
              onChangeText={setConditionText}
              onSubmitEditing={addCondition}
              returnKeyType="done"
            />
            <AppButton title={t('onboarding.add')} icon="add" variant="secondary" size="sm" disabled={!conditionText.trim()} onPress={addCondition} />
            <ChipList items={conditions.map((c) => ({ key: c.key, label: c.name }))} onRemove={(k) => setConditions((l) => l.filter((c) => c.key !== k))} />
          </View>
        );
      default:
        return (
          <View style={styles.stepBody}>
            <StepTitle title={t('onboarding.patient.medsTitle')} text={t('onboarding.patient.medsText')} />
            <AppInput label={t('onboarding.patient.medLabel')} icon="medical-outline" placeholder={t('onboarding.patient.medPlaceholder')} value={medName} onChangeText={setMedName} />
            <AppInput label={t('onboarding.patient.doseLabel')} placeholder={t('onboarding.patient.dosePlaceholder')} value={medDose} onChangeText={setMedDose} onSubmitEditing={addMed} returnKeyType="done" />
            <AppButton title={t('onboarding.add')} icon="add" variant="secondary" size="sm" disabled={!medName.trim()} onPress={addMed} />
            <ChipList items={meds.map((m) => ({ key: m.key, label: m.dosage ? `${m.name} · ${m.dosage}` : m.name }))} onRemove={(k) => setMeds((l) => l.filter((m) => m.key !== k))} />
          </View>
        );
    }
  };

  return (
    <LinearGradient colors={isDark ? gradients.calmDark : gradients.calm} style={styles.flex}>
      <SafeAreaView style={styles.flex} edges={['top', 'bottom']}>
        <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={styles.topBar}>
            <View style={styles.dots} accessibilityLabel={t('onboarding.progress', { step: step + 1, total })}>
              {Array.from({ length: total }, (_, i) => (
                <View key={i} style={[styles.dot, { backgroundColor: i <= step ? colors.primary : colors.border, width: i === step ? 22 : 8 }]} />
              ))}
            </View>
            <AppButton title={t('onboarding.skip')} variant="ghost" size="sm" onPress={() => void finish()} />
          </View>

          <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            <Animated.View key={step} entering={enterUp()}>
              <AppCard style={styles.card}>
                {isDoctor ? <StepIntro {...doctorSlides[step]} /> : renderPatientStep()}
              </AppCard>
            </Animated.View>
            {error && <ErrorState message={error} />}
          </ScrollView>

          <View style={styles.footer}>
            {step > 0 && <AppButton title={t('onboarding.back')} variant="outline" icon="arrow-back" onPress={() => setStep((s) => s - 1)} />}
            <View style={styles.flex}>
              <AppButton
                title={isLast ? (isDoctor ? t('onboarding.start') : t('onboarding.save')) : t('onboarding.next')}
                trailingIcon={isLast ? 'checkmark' : 'arrow-forward'}
                fullWidth
                loading={saving}
                onPress={next}
              />
            </View>
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </LinearGradient>
  );
}

function StepTitle({ title, text }: { title: string; text: string }) {
  return (
    <View style={styles.titleWrap}>
      <AppText variant="title" accessibilityRole="header">
        {title}
      </AppText>
      <AppText color="textMuted">{text}</AppText>
    </View>
  );
}

function StepIntro({ icon, title, text }: { icon: IconName; title: string; text: string }) {
  const { colors } = useTheme();
  return (
    <View style={styles.intro}>
      <View style={[styles.halo, { backgroundColor: colors.primaryMuted }]}>
        <View style={[styles.haloInner, { backgroundColor: colors.surface }]}>
          <Ionicons name={icon} size={36} color={colors.primary} />
        </View>
      </View>
      <StepTitle title={title} text={text} />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.lg, paddingTop: spacing.sm },
  dots: { flexDirection: 'row', gap: 6, alignItems: 'center' },
  dot: { height: 8, borderRadius: radius.pill },
  content: { padding: spacing.lg, gap: spacing.md, width: '100%', maxWidth: sizes.maxContentWidth, alignSelf: 'center' },
  card: { padding: spacing.lg, borderRadius: radius.xl },
  stepBody: { gap: spacing.md },
  titleWrap: { gap: spacing.sm },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  bloodCell: { width: '22%', flexGrow: 1, height: 58, borderRadius: radius.lg, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  bloodUnknown: { width: '100%' },
  intro: { gap: spacing.lg, alignItems: 'flex-start', paddingVertical: spacing.md },
  halo: { width: 104, height: 104, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  haloInner: { width: 72, height: 72, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  footer: { flexDirection: 'row', gap: spacing.sm, paddingHorizontal: spacing.lg, paddingBottom: spacing.md, paddingTop: spacing.sm, width: '100%', maxWidth: sizes.maxContentWidth, alignSelf: 'center' },
});

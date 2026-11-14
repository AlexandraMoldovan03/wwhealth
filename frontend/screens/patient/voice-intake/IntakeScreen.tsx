import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { AppButton, AppCard, AppInput, AppText, DemoNotice, LoadingState, ScreenContainer } from '@/design-system';
import { spacing } from '@/design-system/theme';
import { useCurrentUser } from '@/services/auth/useCurrentUser';
import { saveIntake } from './intakeStorage';
import { useVoiceIntake } from './useVoiceIntake';
import { useSubmit } from '@/hooks/useSubmit';
import type { IntakeForm, Symptom } from '@/types';

const EMPTY_SYMPTOM: Symptom = { name: '', duration: null, severity: null, notes: null };

export function IntakeScreen() {
  const user = useCurrentUser();
  return <VoiceIntake key={user?.id} userId={user?.id} />;
}

function VoiceIntake({ userId }: { userId?: string }) {
  const intake = useVoiceIntake();
  const { form, phase, start, stop, error } = intake;

  return (
    <ScreenContainer help="intake" edges={['bottom']}>
      <AppText variant="title">Describe your symptoms</AppText>
      <AppText color="textMuted">
        Speak in Romanian or English. ElevenLabs transcribes your recording and Gemini organizes the transcript.
        You can review and edit the form before saving it.
      </AppText>
      <AppText color="textMuted">AI does not diagnose. In an emergency in the EU, call 112.</AppText>
      {phase === 'processing' ? (
        <LoadingState message="Preparing your symptom form…" />
      ) : phase === 'recording' ? (
        <AppButton title="Stop and transcribe" icon="stop-circle-outline" variant="danger" onPress={stop} />
      ) : (
        <AppButton
          title={form ? 'Record again' : 'Start recording'}
          icon="mic-outline"
          loading={phase === 'starting'}
          disabled={!userId}
          onPress={start}
        />
      )}
      {error && <AppText color="danger" accessibilityRole="alert">{error}</AppText>}
      {form && userId && <IntakeEditor userId={userId} key={intake.revision} initialForm={form} disabled={phase !== 'idle'} />}
    </ScreenContainer>
  );
}

function IntakeEditor({ initialForm, disabled, userId }: { initialForm: IntakeForm; disabled: boolean; userId: string }) {
  const [form, setForm] = useState(initialForm);
  const [medications, setMedications] = useState(initialForm.medicationsMentioned.join(', '));
  const [allergies, setAllergies] = useState(initialForm.allergiesMentioned.join(', '));
  const save = useSubmit(saveIntake);
  const locked = disabled || save.isLoading || !!save.data;

  function updateSymptom(index: number, changes: Partial<Symptom>) {
    setForm((current) => ({
      ...current,
      symptoms: current.symptoms.map((item, i) => i === index ? { ...item, ...changes } : item),
    }));
  }

  function submit() {
    const split = (value: string) => value.split(',').map((item) => item.trim()).filter(Boolean);
    return save.run(userId, {
      ...form,
      summary: form.summary.trim(),
      symptoms: form.symptoms.map((item) => ({ ...item, name: item.name.trim() })),
      medicationsMentioned: split(medications),
      allergiesMentioned: split(allergies),
    });
  }

  return (
    <View style={styles.fields}>
      {form.isDemo && <DemoNotice message="Demo form with example symptoms. Review before saving." />}
      {form.urgentWarning && (
        <AppCard>
          <AppText color="danger" accessibilityRole="alert">
            Possible urgent symptoms were flagged. If this is an emergency in the EU, call 112.
          </AppText>
        </AppCard>
      )}
      <AppText variant="heading">Review your form</AppText>
      <AppInput label="Summary" accessibilityLabel="Summary" value={form.summary} editable={!locked}
        onChangeText={(summary) => setForm((current) => ({ ...current, summary }))} />
      {form.symptoms.map((symptom, index) => (
        <AppCard key={index} style={styles.fields}>
          <AppText variant="subheading">Symptom {index + 1}</AppText>
          <AppInput label="Name" accessibilityLabel="Symptom name" value={symptom.name} editable={!locked}
            onChangeText={(name) => updateSymptom(index, { name })} />
          <AppInput label="Duration" accessibilityLabel="Duration" value={symptom.duration ?? ''} editable={!locked}
            onChangeText={(duration) => updateSymptom(index, { duration: duration || null })} />
          <AppInput label="Notes" accessibilityLabel="Notes" value={symptom.notes ?? ''} editable={!locked}
            onChangeText={(notes) => updateSymptom(index, { notes: notes || null })} />
          <AppText variant="label" color="textMuted">Severity</AppText>
          <View style={styles.choices}>
            {([null, 'mild', 'moderate', 'severe'] as const).map((severity) => (
              <AppButton key={severity ?? 'unknown'} title={severity ?? 'Unspecified'} size="sm"
                variant={symptom.severity === severity ? 'secondary' : 'outline'}
                accessibilityState={{ selected: symptom.severity === severity, disabled: locked }}
                disabled={locked} onPress={() => updateSymptom(index, { severity })} />
            ))}
          </View>
          <AppButton title="Remove symptom" variant="ghost" disabled={locked} onPress={() => {
            setForm((current) => ({ ...current, symptoms: current.symptoms.filter((_, i) => i !== index) }));
          }} />
        </AppCard>
      ))}
      <AppButton title="Add symptom" variant="outline" disabled={locked} onPress={() => {
        setForm((current) => ({ ...current, symptoms: [...current.symptoms, EMPTY_SYMPTOM] }));
      }} />
      <AppInput label="Medications (separate with commas)" accessibilityLabel="Medications"
        value={medications} onChangeText={setMedications} editable={!locked} />
      <AppInput label="Allergies (separate with commas)" accessibilityLabel="Allergies"
        value={allergies} onChangeText={setAllergies} editable={!locked} />
      <AppText variant="subheading">Original transcript</AppText>
      <AppText color="textMuted" selectable>{form.transcript}</AppText>
      {save.error && <AppText color="danger" accessibilityRole="alert">{save.error}</AppText>}
      {save.data ? (
        <AppText color="primary" accessibilityRole="alert">Saved to History on this device.</AppText>
      ) : (
        <AppButton title="Save to History" loading={save.isLoading}
          disabled={locked || !form.summary.trim() || form.symptoms.some((item) => !item.name.trim())}
          onPress={submit} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  fields: { gap: spacing.md },
  choices: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
});

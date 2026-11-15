import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { AppButton, AppCard, AppInput, AppText, DemoNotice, ScreenContainer } from '@/design-system';
import { useTheme } from '@/design-system/useTheme';
import { spacing } from '@/design-system/theme';
import { useLocalPatientId } from '@/services/auth/useCurrentUser';
import { RecordButton } from './RecordButton';
import { RecordingFeedback } from './RecordingFeedback';
import { saveIntake } from './intakeStorage';
import { useVoiceIntake } from './useVoiceIntake';
import { useSubmit } from '@/hooks/useSubmit';
import { VoiceTranslationPanel } from '@/screens/shared/components/VoiceTranslationPanel';
import type { IntakeForm, Symptom } from '@/types';

const EMPTY_SYMPTOM: Symptom = { name: '', duration: null, severity: null, notes: null };

export function IntakeScreen() {
  const userId = useLocalPatientId();
  return <VoiceIntake key={userId} userId={userId} />;
}

function VoiceIntake({ userId }: { userId?: string }) {
  const { t } = useTranslation();
  const intake = useVoiceIntake();
  const { form, phase, start, stop, error } = intake;

  return (
    <ScreenContainer help="intake" edges={['bottom']}>
      <AppText variant="title">{t('voiceIntake.title')}</AppText>
      <AppText color="textMuted">
        {t('voiceIntake.instructions')}
      </AppText>
      <AppText color="textMuted">{t('voiceIntake.notice')}</AppText>
      {phase === 'processing' || phase === 'recording' ? (
        <>
          <RecordingFeedback recorder={intake.recorder} processing={phase === 'processing'} />
          {phase === 'recording' && <RecordButton title={t('voiceIntake.stop')} stopping onPress={stop} />}
        </>
      ) : (
        <RecordButton
          title={t(form ? 'voiceIntake.again' : 'voiceIntake.start')}
          loading={phase === 'starting'}
          disabled={!userId}
          onPress={start}
        />
      )}
      {error && <AppText color="danger" accessibilityRole="alert">{error}</AppText>}
      {form && userId && (
        <View style={phase !== 'idle' && styles.hidden}>
          <IntakeEditor userId={userId} key={intake.revision} initialForm={form} disabled={phase !== 'idle'} />
        </View>
      )}
    </ScreenContainer>
  );
}

function IntakeEditor({ initialForm, disabled, userId }: { initialForm: IntakeForm; disabled: boolean; userId: string }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const [sourceIndex, setSourceIndex] = useState<number | null>(null);
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
      {form.isDemo && <DemoNotice message={t('voiceIntake.sample')} />}
      {form.urgentWarning && (
        <AppCard>
          <AppText color="danger" accessibilityRole="alert">
            {t('voiceIntake.urgent')}
          </AppText>
        </AppCard>
      )}
      <AppText variant="heading">{t('voiceIntake.review')}</AppText>
      <AppInput label={t('voiceIntake.summary')} accessibilityLabel={t('voiceIntake.summary')} value={form.summary} editable={!locked}
        onChangeText={(summary) => setForm((current) => ({ ...current, summary }))} />
      {form.symptoms.map((symptom, index) => {
        const match = form.isDemo ? null : findTranscriptMatch(form.transcript, symptom.name);
        return (
        <AppCard key={index} style={styles.fields}>
          <AppText variant="subheading">{t('voiceIntake.symptom', { number: index + 1 })}</AppText>
          {match && (
            <>
              <AppButton
                title={t('voiceRecording.source')}
                size="sm"
                variant="outline"
                accessibilityState={{ expanded: sourceIndex === index }}
                onPress={() => setSourceIndex(sourceIndex === index ? null : index)}
              />
              {sourceIndex === index && (
                <AppText selectable color="textMuted">
                  {match.before}
                  <AppText style={{ backgroundColor: colors.accentMuted, color: colors.text, fontWeight: '700' }}>{match.text}</AppText>
                  {match.after}
                </AppText>
              )}
            </>
          )}
          <AppInput label={t('voiceIntake.name')} accessibilityLabel={t('voiceIntake.name')} value={symptom.name} editable={!locked}
            onChangeText={(name) => updateSymptom(index, { name })} />
          <AppInput label={t('voiceIntake.duration')} accessibilityLabel={t('voiceIntake.duration')} value={symptom.duration ?? ''} editable={!locked}
            onChangeText={(duration) => updateSymptom(index, { duration: duration || null })} />
          <AppInput label={t('voiceIntake.notes')} accessibilityLabel={t('voiceIntake.notes')} value={symptom.notes ?? ''} editable={!locked}
            onChangeText={(notes) => updateSymptom(index, { notes: notes || null })} />
          <AppText variant="label" color="textMuted">{t('voiceIntake.severity')}</AppText>
          <View style={styles.choices}>
            {([null, 'mild', 'moderate', 'severe'] as const).map((severity) => (
              <AppButton key={severity ?? 'unknown'} title={severity ? t('enums.severity.' + severity) : t('voiceIntake.unspecified')} size="sm"
                variant={symptom.severity === severity ? 'secondary' : 'outline'}
                accessibilityState={{ selected: symptom.severity === severity, disabled: locked }}
                disabled={locked} onPress={() => updateSymptom(index, { severity })} />
            ))}
          </View>
          <AppButton title={t('voiceIntake.remove')} variant="ghost" disabled={locked} onPress={() => {
            setSourceIndex(null);
            setForm((current) => ({ ...current, symptoms: current.symptoms.filter((_, i) => i !== index) }));
          }} />
        </AppCard>
      );
      })}
      <AppButton title={t('voiceIntake.add')} variant="outline" disabled={locked} onPress={() => {
        setForm((current) => ({ ...current, symptoms: [...current.symptoms, EMPTY_SYMPTOM] }));
      }} />
      <AppInput label={t('voiceIntake.medsInput')} accessibilityLabel={t('voiceIntake.meds')}
        value={medications} onChangeText={setMedications} editable={!locked} />
      <AppInput label={t('voiceIntake.allergiesInput')} accessibilityLabel={t('voiceIntake.allergies')}
        value={allergies} onChangeText={setAllergies} editable={!locked} />
      <AppText variant="subheading">{t('voiceIntake.transcript')}</AppText>
      <View accessible={false} style={{ height: 2, backgroundColor: colors.primary }} />
      <AppText color="textMuted" selectable>{form.transcript}</AppText>
      {!form.isDemo && <VoiceTranslationPanel language={form.language} translation={form.translation} />}
      {save.error && <AppText color="danger" accessibilityRole="alert">{save.error}</AppText>}
      {save.data ? (
        <AppText color="primary" accessibilityRole="alert">{t('voiceIntake.saved')}</AppText>
      ) : (
        <AppButton title={t('voiceIntake.save')} loading={save.isLoading}
          disabled={locked || !form.summary.trim() || form.symptoms.some((item) => !item.name.trim())}
          onPress={submit} />
      )}
    </View>
  );
}

function findTranscriptMatch(transcript: string, name: string) {
  const label = name.trim();
  if (label.length < 2) return null;

  const escaped = label.replace(/[.*+?^$\{\}()|[\]\\]/g, '\\$&');
  const match = new RegExp('(^|[^\\p{L}\\p{N}])' + escaped + '(?![\\p{L}\\p{N}])', 'iu').exec(transcript);
  if (!match) return null;

  const index = match.index + match[1].length;
  const start = Math.max(0, index - 65);
  const end = match.index + match[0].length;
  return {
    before: (start > 0 ? '…' : '') + transcript.slice(start, index),
    text: transcript.slice(index, end),
    after: transcript.slice(end, end + 65) + (end + 65 < transcript.length ? '…' : ''),
  };
}

const styles = StyleSheet.create({
  hidden: { display: 'none' },
  fields: { gap: spacing.md },
  choices: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
});

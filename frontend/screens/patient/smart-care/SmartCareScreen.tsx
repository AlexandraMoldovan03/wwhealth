import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Switch, View } from 'react-native';

import { AppButton, AppCard, AppInput, AppText, Badge, DemoNotice, EmptyState, ErrorState, LoadingState, ScreenContainer, SectionHeader } from '@/design-system';
import { spacing } from '@/design-system/theme';
import { useTheme } from '@/design-system/useTheme';
import { useAsync } from '@/hooks/useAsync';
import { useLanguage } from '@/hooks/useLanguage';
import { useSubmit } from '@/hooks/useSubmit';
import { useVoiceIntake } from '@/screens/patient/voice-intake/useVoiceIntake';
import { DataOriginBadge } from '@/screens/shared/components/DataOrigin';
import { api } from '@/services/backend';
import type { ClarificationAnswer, Transcript, TriageResult } from '@/types';
import { useTranslation } from 'react-i18next';

import { EmergencyGuidanceCard } from './components/EmergencyGuidanceCard';

const MAX_ANSWERS = 3;

/**
 * Smart Care: the patient describes symptoms (text, or voice → ElevenLabs transcript they check), confirms the text,
 * and gets 1–3 specialties from the backend catalog. Emergency rules run on the server before any AI; Gemini is used
 * only with the AI consent. Manual search is always available.
 */
export function SmartCareScreen() {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const language = useLanguage();
  const consent = useAsync(api.getAiConsent);
  const setConsent = useSubmit(api.setAiConsent);
  const triage = useSubmit(api.triageSymptoms);
  const voice = useVoiceIntake<Transcript>(api.transcribeSymptoms);

  const [symptoms, setSymptoms] = useState('');
  const [source, setSource] = useState<'text' | 'voice'>('text');
  const [confirmed, setConfirmed] = useState(false);
  const [useHistory, setUseHistory] = useState(false);
  const [voiceConsent, setVoiceConsent] = useState(false);
  const [answers, setAnswers] = useState<ClarificationAnswer[]>([]);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [result, setResult] = useState<TriageResult | null>(null);
  const [voiceRevision, setVoiceRevision] = useState(0);

  // A new transcript replaces the text; the patient must check it again.
  if (voice.form && voice.revision !== voiceRevision) {
    setVoiceRevision(voice.revision);
    setSymptoms(voice.form.transcript);
    setSource('voice');
    setConfirmed(false);
    setResult(null);
    setAnswers([]);
  }

  const editText = (value: string) => {
    setSymptoms(value);
    setConfirmed(false);
    setResult(null);
    setAnswers([]);
    setDrafts({});
  };

  const send = async (withAnswers: ClarificationAnswer[]) => {
    const res = await triage.run({ symptoms: symptoms.trim(), source, confirmed, useHistory, answers: withAnswers, language });
    if (res) {
      setResult(res);
      setAnswers(withAnswers);
      setDrafts({});
    }
  };

  const sendAnswers = () => {
    const fresh = (result?.clarificationQuestions ?? [])
      .map((question) => ({ question, answer: (drafts[question] ?? '').trim() }))
      .filter((a) => a.answer);
    void send([...answers, ...fresh].slice(0, MAX_ANSWERS));
  };

  const grantConsent = async () => {
    if (await setConsent.run(true)) {
      await consent.reload();
      if (result?.status === 'no_consent') void send(answers);
    }
  };

  const canSend = confirmed && symptoms.trim().length >= 3 && voice.phase === 'idle';
  const openSpecialty = (id: string, name: string) => router.push({ pathname: '/patient/specialty/[id]', params: { id, name } });

  return (
    <ScreenContainer edges={['bottom']} help="smartCare">
      <AppText color="textMuted">{t('care.intro')}</AppText>
      <AppText variant="caption" color="danger">
        {t('care.emergencyNote')}
      </AppText>

      <View style={styles.section}>
        <SectionHeader title={t('care.describeTitle')} subtitle={t('care.describeHint')} />
        <AppInput
          accessibilityLabel={t('care.describeTitle')}
          placeholder={t('care.placeholder')}
          value={symptoms}
          onChangeText={editText}
          multiline
          maxLength={2000}
          style={styles.textArea}
          editable={voice.phase === 'idle' && !triage.isLoading}
        />

        <AppCard style={styles.card}>
          <View style={styles.row}>
            <Ionicons name="mic-outline" size={18} color={colors.accent} />
            <AppText variant="subheading" style={styles.flex}>
              {t('care.voice.title')}
            </AppText>
            <Badge label="ElevenLabs" color={colors.accent} />
          </View>
          <AppText variant="caption" color="textMuted">
            {t('care.voice.consentText')}
          </AppText>
          <ToggleRow label={t('care.voice.consentLabel')} value={voiceConsent} onChange={setVoiceConsent} />
          {voice.phase === 'processing' ? (
            <LoadingState message={t('care.voice.processing')} />
          ) : voice.phase === 'recording' ? (
            <AppButton title={t('care.voice.stop')} icon="stop-circle-outline" variant="danger" fullWidth onPress={voice.stop} />
          ) : (
            <AppButton
              title={t(voice.form ? 'care.voice.again' : 'care.voice.start')}
              icon="mic-outline"
              variant="outline"
              fullWidth
              disabled={!voiceConsent || triage.isLoading}
              loading={voice.phase === 'starting'}
              onPress={voice.start}
            />
          )}
          {voice.form?.isDemo && <DemoNotice message={t('care.voice.demo')} />}
          {voice.error && <ErrorState compact message={voice.error} />}
        </AppCard>

        <AppCard style={styles.card}>
          <ToggleRow label={t('care.confirmLabel')} hint={t(source === 'voice' ? 'care.confirmHintVoice' : 'care.confirmHint')} value={confirmed} onChange={setConfirmed} />
          <ToggleRow label={t('care.historyLabel')} hint={t('care.historyHint')} value={useHistory} onChange={setUseHistory} />
        </AppCard>
      </View>

      {consent.data && !consent.data.granted && (
        <AppCard style={styles.card}>
          <AppText variant="subheading">{t('care.consent.title')}</AppText>
          <AppText color="textMuted">{t('care.consent.text')}</AppText>
          <AppText variant="caption" color="textMuted">
            {t('care.consent.withoutIt')}
          </AppText>
          <AppButton title={t('care.consent.accept')} icon="checkmark-circle-outline" fullWidth loading={setConsent.isLoading} onPress={() => void grantConsent()} />
          {setConsent.error && <ErrorState compact message={setConsent.error} />}
        </AppCard>
      )}

      <AppButton
        title={t('care.submit')}
        icon="sparkles-outline"
        fullWidth
        disabled={!canSend}
        loading={triage.isLoading}
        onPress={() => void send([])}
      />
      {!confirmed && symptoms.trim().length >= 3 && (
        <AppText variant="caption" color="textMuted">
          {t('care.confirmFirst')}
        </AppText>
      )}
      {triage.error && <ErrorState title={t('care.failedTitle')} message={triage.error} />}

      {result && (
        <TriageView
          result={result}
          drafts={drafts}
          setDrafts={setDrafts}
          onAnswers={sendAnswers}
          onRetry={() => void send(answers)}
          answering={triage.isLoading}
          onOpen={openSpecialty}
        />
      )}

      <AppButton title={t('care.manualSearch')} icon="search-outline" variant="ghost" fullWidth onPress={() => router.push('/patient/specialties')} />
      <AppButton title={t('care.myAppointments')} icon="calendar-outline" variant="ghost" fullWidth onPress={() => router.push('/patient/appointments')} />
    </ScreenContainer>
  );
}

function ToggleRow({ label, hint, value, onChange }: { label: string; hint?: string; value: boolean; onChange: (v: boolean) => void }) {
  const { colors } = useTheme();
  return (
    <View style={styles.row}>
      <View style={styles.flex}>
        <AppText>{label}</AppText>
        {!!hint && (
          <AppText variant="caption" color="textMuted">
            {hint}
          </AppText>
        )}
      </View>
      <Switch value={value} onValueChange={onChange} trackColor={{ true: colors.primary, false: colors.border }} accessibilityLabel={label} />
    </View>
  );
}

function TriageView({
  result,
  drafts,
  setDrafts,
  onAnswers,
  onRetry,
  answering,
  onOpen,
}: {
  result: TriageResult;
  drafts: Record<string, string>;
  setDrafts: (fn: (d: Record<string, string>) => Record<string, string>) => void;
  onAnswers: () => void;
  onRetry: () => void;
  answering: boolean;
  onOpen: (id: string, name: string) => void;
}) {
  const { colors } = useTheme();
  const { t } = useTranslation();

  if (result.status === 'emergency' && result.emergency) return <EmergencyGuidanceCard guidance={result.emergency} />;

  if (result.status !== 'ok') {
    const key = result.status === 'no_consent' ? 'noConsent' : result.status === 'not_configured' ? 'notConfigured' : 'failed';
    return (
      <>
        {result.emergency && <EmergencyGuidanceCard guidance={result.emergency} />}
        <EmptyState
          icon="cloud-offline-outline"
          title={t(`care.status_${key}.title`)}
          message={result.status === 'failed' && result.failureReason ? t(`care.failure.${result.failureReason}`) : t(`care.status_${key}.text`)}
        />
        {result.status === 'failed' && <AppButton title={t('care.retry')} icon="refresh-outline" variant="outline" fullWidth loading={answering} onPress={onRetry} />}
      </>
    );
  }

  const hasDrafts = result.clarificationQuestions.some((q) => (drafts[q] ?? '').trim());

  return (
    <View style={styles.section}>
      {result.emergency && <EmergencyGuidanceCard guidance={result.emergency} />}
      <SectionHeader title={t('care.result.title')} subtitle={t('care.result.subtitle')} />

      {!!result.symptomSummary && (
        <AppCard style={styles.card}>
          <View style={styles.row}>
            <AppText variant="label" color="textMuted" style={styles.flex}>
              {t('care.result.summary')}
            </AppText>
            <DataOriginBadge origin="ai" />
          </View>
          <AppText>{result.symptomSummary}</AppText>
          {result.historyUsed && (
            <AppText variant="caption" color="textMuted">
              {t('care.result.historyUsed')}
            </AppText>
          )}
        </AppCard>
      )}

      {result.clarificationQuestions.length > 0 && (
        <AppCard style={[styles.card, { borderLeftWidth: 4, borderLeftColor: colors.info }]}>
          <AppText variant="subheading">{t('care.result.questionsTitle')}</AppText>
          <AppText variant="caption" color="textMuted">
            {t('care.result.questionsHint')}
          </AppText>
          {result.clarificationQuestions.map((q) => (
            <AppInput
              key={q}
              label={q}
              accessibilityLabel={q}
              value={drafts[q] ?? ''}
              maxLength={300}
              onChangeText={(v) => setDrafts((d) => ({ ...d, [q]: v }))}
            />
          ))}
          <AppButton title={t('care.result.sendAnswers')} icon="send-outline" fullWidth disabled={!hasDrafts} loading={answering} onPress={onAnswers} />
        </AppCard>
      )}

      {result.specialties.map((s, i) => (
        <AppCard key={s.id} style={styles.card} enterIndex={i + 1}>
          <View style={styles.row}>
            <Ionicons name="medkit-outline" size={18} color={colors.primary} />
            <AppText variant="subheading" style={styles.flex}>
              {s.name}
            </AppText>
            {i === 0 && <Badge label={t('care.result.first')} color={colors.primary} />}
          </View>
          {!!s.reason && <AppText color="textMuted">{s.reason}</AppText>}
          <AppButton title={t('care.result.seeDoctors')} icon="calendar-outline" fullWidth onPress={() => onOpen(s.id, s.name)} />
        </AppCard>
      ))}

      {!!result.reasoning && (
        <AppText variant="caption" color="textMuted">
          {result.reasoning}
        </AppText>
      )}
      {!!result.recommendedNextStep && (
        <AppCard style={styles.card}>
          <AppText variant="label" color="textMuted">
            {t('care.result.nextStep')}
          </AppText>
          <AppText>{result.recommendedNextStep}</AppText>
        </AppCard>
      )}
      {result.warningSigns.length > 0 && (
        <AppCard style={[styles.card, { borderLeftWidth: 4, borderLeftColor: colors.warning }]}>
          <AppText variant="subheading">{t('care.result.warningTitle')}</AppText>
          {result.warningSigns.map((w) => (
            <View key={w} style={styles.row}>
              <Ionicons name="alert-circle-outline" size={16} color={colors.warning} />
              <AppText style={styles.flex}>{w}</AppText>
            </View>
          ))}
          <AppText variant="caption" color="textMuted">
            {t('care.emergencyNote')}
          </AppText>
        </AppCard>
      )}
      {result.discarded > 0 && (
        <AppText variant="caption" color="textMuted">
          {t('care.result.discarded', { count: result.discarded })}
        </AppText>
      )}
      <AppText variant="caption" color="textSubtle">
        {t('care.result.disclaimer')}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: spacing.md },
  card: { gap: spacing.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  flex: { flex: 1, gap: spacing.xxs },
  textArea: { minHeight: 110, textAlignVertical: 'top' },
});

import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useRef, useState } from 'react';
import { Keyboard, Pressable, StyleSheet, Switch, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { AppButton, AppCard, AppInput, AppText, DemoNotice, EmptyState, ErrorState, LoadingState, ScreenContainer } from '@/design-system';
import { radius, spacing } from '@/design-system/theme';
import { tapFeedback } from '@/design-system/motion';
import { useTheme } from '@/design-system/useTheme';
import { useAsync } from '@/hooks/useAsync';
import { useLanguage } from '@/hooks/useLanguage';
import { useSubmit } from '@/hooks/useSubmit';
import { useVoiceIntake } from '@/screens/patient/voice-intake/useVoiceIntake';
import { USE_MOCKS } from '@/config/config';
import { api } from '@/services/backend';
import type { ClarificationAnswer, Transcript, TriageResult } from '@/types';

import { CareSheet } from './components/CareSheet';
import { EmergencyGuidanceCard } from './components/EmergencyGuidanceCard';

const MAX_ANSWERS = 3;
type Panel = 'review' | 'permissions' | 'voice';

export function SmartCareScreen() {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const language = useLanguage();
  const consent = useAsync(api.getAiConsent, { refetchOnFocus: true });
  const updateConsent = useSubmit(api.setAiConsent);
  const triage = useSubmit(api.triageSymptoms);
  const voice = useVoiceIntake<Transcript>(api.transcribeSymptoms);
  const pending = useRef(false);
  const [panel, setPanel] = useState<Panel | null>(null);
  const [symptoms, setSymptoms] = useState('');
  const [source, setSource] = useState<'text' | 'voice'>('text');
  const [useHistory, setUseHistory] = useState(false);
  const [result, setResult] = useState<TriageResult | null>(null);
  const [answers, setAnswers] = useState<ClarificationAnswer[]>([]);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [questionIndex, setQuestionIndex] = useState(0);
  const [clarifying, setClarifying] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [specialtyId, setSpecialtyId] = useState<string | null>(null);
  const [voiceRevision, setVoiceRevision] = useState(0);

  if (voice.form && voice.revision !== voiceRevision) {
    setVoiceRevision(voice.revision);
    if (!voice.form.isDemo) {
      setSymptoms(voice.form.transcript);
      setSource('voice');
    }
  }

  const critical = result?.emergency?.level === 'call_112';
  const busy = triage.isLoading || updateConsent.isLoading;
  const granted = !USE_MOCKS && !consent.error && consent.data?.granted === true;
  const ok = result?.status === 'ok';
  const activeSpecialty = result?.specialties.find((s) => s.id === specialtyId) ?? result?.specialties[0];
  const hasDetails = !!(activeSpecialty?.reason || result?.reasoning || result?.recommendedNextStep || result?.historyUsed || (result?.specialties.length ?? 0) > 1);
  const questions = result?.clarificationQuestions ?? [];
  const question = questions[questionIndex];
  const canReview = symptoms.trim().length >= 3 && voice.phase === 'idle' && !busy;

  async function send(nextAnswers: ClarificationAnswer[], history: boolean, grant = false) {
    if (pending.current) return;
    pending.current = true;
    Keyboard.dismiss();
    try {
      if (grant) {
        if (!(await updateConsent.run(true))) return;
        await consent.reload();
      }
      setPanel(null);
      const res = await triage.run({ symptoms: symptoms.trim(), source, confirmed: true, useHistory: history, answers: nextAnswers, language });
      if (!res) return;
      if (res.status === 'no_consent' && !USE_MOCKS) void consent.reload();
      setResult(res);
      setAnswers(nextAnswers);
      setDrafts({});
      setQuestionIndex(0);
      setClarifying(res.status === 'ok' && res.clarificationQuestions.length > 0);
      setExpanded(false);
      setSpecialtyId(null);
    } finally {
      pending.current = false;
    }
  }

  function review() {
    Keyboard.dismiss();
    updateConsent.reset();
    setPanel('review');
  }

  function edit() {
    setResult(null);
    setAnswers([]);
    setDrafts({});
    setUseHistory(false);
    triage.reset();
  }

  function advanceQuestion() {
    if (questionIndex + 1 < questions.length) {
      setQuestionIndex(questionIndex + 1);
      return;
    }
    const fresh = questions.map((q) => ({ question: q, answer: (drafts[q] ?? '').trim() })).filter((a) => a.answer);
    if (fresh.length) void send([...answers, ...fresh].slice(0, MAX_ANSWERS), useHistory);
    else setClarifying(false);
  }

  async function revoke() {
    if (pending.current) return;
    pending.current = true;
    try {
      if (!(await updateConsent.run(false))) return;
      edit();
      await consent.reload();
      setPanel(null);
    } finally {
      pending.current = false;
    }
  }

  return (
    <ScreenContainer edges={['bottom']} help="smartCare">
      <View style={styles.group}>
        <AppText variant="label" color="primary">{t('care.flow.step', { current: result ? 2 : 1 })}</AppText>
        <AppText variant="heading" accessibilityRole="header">
          {t(result ? 'care.flow.guidance' : 'care.flow.describe')}
        </AppText>
        {!result && <AppText color="textMuted">{t('care.flow.purpose')}</AppText>}
      </View>

      {result?.emergency ? <EmergencyGuidanceCard guidance={result.emergency} /> : (
        <AppText variant="caption" color="danger">{t('care.emergencyNote')}</AppText>
      )}
      {ok && result.warningSigns.length > 0 && (
        <AppCard style={styles.group}>
          <AppText variant="subheading" color="danger">{t('care.result.warningTitle')}</AppText>
          {result.warningSigns.map((warning, index) => <AppText key={index}>{warning}</AppText>)}
        </AppCard>
      )}

      {!result && (
        <>
          <View>
            <AppInput
              accessibilityLabel={t('care.describeTitle')}
              placeholder={t('care.placeholder')}
              value={symptoms}
              onChangeText={(text) => { setSymptoms(text); triage.reset(); }}
              multiline
              maxLength={2000}
              style={styles.textArea}
              editable={voice.phase === 'idle' && !busy}
            />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t(voice.phase === 'recording' ? 'care.voice.stop' : 'care.voice.start')}
              accessibilityState={{ disabled: busy || voice.phase === 'processing' || voice.phase === 'starting' }}
              disabled={busy || voice.phase === 'processing' || voice.phase === 'starting'}
              onPress={() => {
                tapFeedback();
                Keyboard.dismiss();
                if (voice.phase === 'recording') void voice.stop();
                else setPanel('voice');
              }}
              style={({ pressed }) => [styles.mic, { backgroundColor: colors.primaryMuted, opacity: pressed ? 0.7 : 1 }]}
            >
              <Ionicons name={voice.phase === 'recording' ? 'stop' : 'mic-outline'} size={22} color={voice.phase === 'recording' ? colors.danger : colors.primary} />
            </Pressable>
          </View>
          {voice.phase === 'recording' && <AppText color="danger" accessibilityLiveRegion="polite">{t('care.flow.recording')}</AppText>}
          {voice.phase === 'processing' && <LoadingState message={t('care.voice.processing')} />}
          {voice.form?.isDemo && voice.phase === 'idle' && <DemoNotice message={t('care.flow.demoVoice')} />}
          {voice.error && <ErrorState compact message={t(voice.permissionDenied ? 'care.flow.microphoneDenied' : 'care.flow.voiceError')} />}
          {source === 'voice' && <AppText variant="caption" color="textMuted">{t('care.confirmHintVoice')}</AppText>}
          <AppButton title={t('care.flow.continue')} fullWidth disabled={!canReview} loading={busy} onPress={review} />
        </>
      )}

      {triage.isLoading && <AppText color="textMuted" accessibilityLiveRegion="polite">{t('care.flow.analyzing')}</AppText>}
      {triage.error && <ErrorState compact message={t('care.flow.requestError')} />}

      {ok && (
        <>
          {clarifying && question ? (
            <AppCard style={styles.group}>
              <AppText variant="label" color="primary">{t('care.flow.question', { current: questionIndex + 1, total: questions.length })}</AppText>
              <AppInput label={question} value={drafts[question] ?? ''} maxLength={300} editable={!busy} onChangeText={(answer) => setDrafts({ ...drafts, [question]: answer })} />
              <AppButton title={t('care.flow.continue')} loading={busy} onPress={advanceQuestion} />
              <AppButton variant="ghost" title={t('care.flow.skipQuestions')} disabled={busy} onPress={() => setClarifying(false)} />
            </AppCard>
          ) : (
            <>
              <AppCard style={styles.group} enterIndex={0}>
                <AppText variant="label" color="primary">{t('care.flow.specialty')}</AppText>
                <AppText variant="heading">{activeSpecialty?.name}</AppText>
                {!!result.symptomSummary && <AppText>{result.symptomSummary}</AppText>}
                {hasDetails && <Pressable accessibilityRole="button" accessibilityState={{ expanded }} style={styles.detail} onPress={() => setExpanded(!expanded)}>
                  <AppText color="primary">{t(expanded ? 'care.flow.hideDetails' : 'care.flow.details')}</AppText>
                  <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={18} color={colors.primary} />
                </Pressable>}
                {expanded && (
                  <View style={styles.group}>
                    {!!activeSpecialty?.reason && <AppText color="textMuted">{activeSpecialty.reason}</AppText>}
                    {!!result.reasoning && result.reasoning !== activeSpecialty?.reason && <AppText color="textMuted">{result.reasoning}</AppText>}
                    {!!result.recommendedNextStep && <AppText>{result.recommendedNextStep}</AppText>}
                    {result.historyUsed && <AppText variant="caption" color="textMuted">{t('care.result.historyUsed')}</AppText>}
                    {result.specialties.length > 1 && result.specialties.map((specialty) => (
                      <Pressable key={specialty.id} accessibilityRole="radio" accessibilityState={{ checked: specialty.id === activeSpecialty?.id }} style={styles.detail} onPress={() => setSpecialtyId(specialty.id)}>
                        <Ionicons name={specialty.id === activeSpecialty?.id ? 'radio-button-on' : 'radio-button-off'} size={20} color={colors.primary} />
                        <AppText style={styles.flex}>{specialty.name}</AppText>
                      </Pressable>
                    ))}
                  </View>
                )}
              </AppCard>
              <AppText variant="caption" color="textMuted">{t('care.flow.disclaimer')}</AppText>
              {activeSpecialty && <AppButton title={t('care.flow.findDoctor')} fullWidth onPress={() => router.push({ pathname: '/patient/specialty/[id]', params: { id: activeSpecialty.id, name: activeSpecialty.name, fromCare: 'true' } })} />}
            </>
          )}
        </>
      )}

      {result && !ok && result.emergency?.level !== 'call_112' && (
        <>
          <EmptyState icon="information-circle-outline" title={t('care.flow.unavailable')} message={t('care.flow.manualFallback')} />
          {(result.status === 'failed' || result.status === 'no_consent') && <AppButton title={t(result.status === 'no_consent' ? 'care.flow.reviewConsent' : 'care.retry')} loading={busy} onPress={review} />}
        </>
      )}

      <View style={styles.links}>
        {result && <AppButton variant="ghost" title={t('care.flow.edit')} disabled={busy} onPress={edit} />}
        {!critical && !ok && <AppButton variant="ghost" title={t('care.manualSearch')} disabled={busy || voice.phase !== 'idle'} onPress={() => router.push('/patient/specialties')} />}
        <AppButton variant="ghost" title={t('care.flow.permissions')} disabled={busy || voice.phase !== 'idle'} onPress={() => { updateConsent.reset(); setPanel('permissions'); }} />
      </View>

      {panel === 'voice' && (
        <CareSheet title={t('care.voice.title')} onClose={() => setPanel(null)}>
          <AppText>{t('care.flow.audioConsent')}</AppText>
          <AppButton title={t('care.flow.allowAudio')} disabled={USE_MOCKS} fullWidth onPress={() => { setPanel(null); void voice.start(); }} />
          {USE_MOCKS && <AppText color="textMuted">{t('care.flow.mock')}</AppText>}
        </CareSheet>
      )}
      {panel && panel !== 'voice' && (
        <CareSheet title={t(panel === 'review' ? 'care.flow.review' : 'care.flow.permissions')} onClose={() => { if (!busy) setPanel(null); }}>
          {(panel === 'permissions' || !granted) && <AppText>{t('care.flow.aiConsent')}</AppText>}
          {panel === 'permissions' && granted && <AppText color="primary">{t('care.flow.granted')}</AppText>}
          {panel === 'review' && (
            <>
              <AppText variant="caption" color="textMuted">{t('care.flow.confirmText')}</AppText>
              <AppCard style={styles.group}><AppText>{symptoms.trim()}</AppText></AppCard>
              <View style={styles.detail}>
                <AppText style={styles.flex}>{t('care.historyLabel')}</AppText>
                <Switch accessibilityLabel={t('care.historyLabel')} value={useHistory} onValueChange={setUseHistory} disabled={busy || USE_MOCKS} />
              </View>
              <AppText variant="caption" color="textMuted">{t('care.historyHint')}</AppText>
              {USE_MOCKS ? (
                <AppButton title={t('care.flow.withoutAI')} fullWidth loading={busy} onPress={() => void send(answers, false)} />
              ) : (
                <>
                  {consent.isLoading && <LoadingState />}
                  {consent.data && !consent.error && (
                    <AppButton title={t(granted ? 'care.flow.analyze' : 'care.flow.allowAI')} fullWidth loading={busy} disabled={consent.isLoading} onPress={() => void send(answers, useHistory, !granted)} />
                  )}
                  {!granted && <AppButton title={t('care.flow.withoutAI')} variant="ghost" disabled={busy || consent.isLoading || !!consent.error || !consent.data} onPress={() => void send(answers, false)} />}
                </>
              )}
            </>
          )}
          {panel === 'permissions' && (
            <>
              <AppText>{t('care.flow.audioConsent')}</AppText>
              <AppText color="textMuted">{t('care.flow.historyPerRequest')}</AppText>
              {granted && <AppButton title={t('care.flow.revoke')} variant="outline" loading={busy} onPress={() => void revoke()} />}
            </>
          )}
          {consent.error && <ErrorState compact message={t('care.flow.requestError')} onRetry={consent.reload} />}
          {updateConsent.error && <ErrorState compact message={t('care.flow.requestError')} />}
        </CareSheet>
      )}
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  group: { gap: spacing.sm },
  textArea: { minHeight: 160, paddingBottom: 54 },
  mic: { position: 'absolute', right: spacing.sm, bottom: spacing.sm, minWidth: 44, minHeight: 44, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  detail: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: 44 },
  flex: { flex: 1 },
  links: { gap: spacing.xs },
});

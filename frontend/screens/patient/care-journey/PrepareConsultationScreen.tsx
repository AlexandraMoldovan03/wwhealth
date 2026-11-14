import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { StyleSheet, Switch, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { AppButton, AppCard, AppInput, AppText, ErrorState, LoadingState, ScreenContainer, SectionHeader } from '@/design-system';
import { spacing } from '@/design-system/theme';
import { useAsync } from '@/hooks/useAsync';
import { useSubmit } from '@/hooks/useSubmit';
import { api } from '@/services/backend';
import { getCareSummaryDraft } from '@/services/careSummaryDraft';
import type { Preparation } from '@/types';

const MAX_QUESTIONS = 10;

/**
 * "Pregătește consultația": reason, symptoms, questions for the doctor and — only if the patient chooses — the
 * Smart Care summary. Visible to the patient and to the appointment's doctor only. The rest of the record is shared
 * separately and explicitly (Grant access).
 */
export function PrepareConsultationScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const load = useCallback(() => api.getPreparation(id), [id]);
  const prep = useAsync(load);
  if (prep.error && !prep.data) return <ScreenContainer edges={['bottom']}><ErrorState message={prep.error} onRetry={prep.reload} /></ScreenContainer>;
  if (prep.status !== 'success') return <ScreenContainer edges={['bottom']}><LoadingState count={3} /></ScreenContainer>;
  return <PrepareForm id={id} initial={prep.data} />;
}

function PrepareForm({ id, initial }: { id: string; initial: Preparation | null }) {
  const { t } = useTranslation();
  const save = useSubmit(api.savePreparation);
  const [reason, setReason] = useState(initial?.reason ?? '');
  const [symptoms, setSymptoms] = useState(initial?.symptoms ?? '');
  const [questions, setQuestions] = useState<string[]>(initial?.questions.length ? initial.questions : ['']);
  const [attach, setAttach] = useState(!!initial?.careSummary);
  const [saved, setSaved] = useState(false);
  const summary = initial?.careSummary ?? null;
  const draft = getCareSummaryDraft();

  const attached = summary ?? draft;
  const setQ = (i: number, v: string) => setQuestions((qs) => qs.map((q, j) => (j === i ? v : q)));

  const submit = async () => {
    setSaved(false);
    const res = await save.run(id, {
      reason: reason.trim() || null,
      symptoms: symptoms.trim() || null,
      questions: questions.map((q) => q.trim()).filter(Boolean),
      careSummary: attach ? attached : null,
    });
    if (res) setSaved(true);
  };

  return (
    <ScreenContainer edges={['bottom']} help="prepare">
      <AppText color="textMuted">{t('cj.prep.intro')}</AppText>
      <AppInput label={t('cj.prep.reason')} placeholder={t('cj.prep.reasonHint')} value={reason} onChangeText={setReason} maxLength={300} />
      <AppInput label={t('cj.prep.symptoms')} placeholder={t('cj.prep.symptomsHint')} value={symptoms} onChangeText={setSymptoms} multiline maxLength={1500} />

      <View style={styles.section}>
        <SectionHeader title={t('cj.prep.questions')} subtitle={t('cj.prep.questionsHint')} />
        {questions.map((q, i) => (
          <AppInput key={i} value={q} onChangeText={(v) => setQ(i, v)} placeholder={t('cj.prep.questionN', { n: i + 1 })} maxLength={300}
            onClear={questions.length > 1 ? () => setQuestions((qs) => qs.filter((_, j) => j !== i)) : undefined} />
        ))}
        {questions.length < MAX_QUESTIONS && (
          <AppButton title={t('cj.prep.addQuestion')} icon="add-outline" variant="ghost" size="sm" onPress={() => setQuestions((qs) => [...qs, ''])} />
        )}
      </View>

      {attached && (
        <AppCard style={styles.card}>
          <View style={styles.row}>
            <View style={styles.flex}>
              <AppText variant="subheading">{t('cj.prep.attachSummary')}</AppText>
              <AppText variant="caption" color="textMuted">{t('cj.prep.attachHint')}</AppText>
            </View>
            <Switch value={attach} onValueChange={setAttach} accessibilityLabel={t('cj.prep.attachSummary')} />
          </View>
          {attach && <AppText variant="caption">{attached.symptomSummary}</AppText>}
        </AppCard>
      )}

      {save.error && <ErrorState compact message={save.error} />}
      {saved && <AppText color="success">{t('cj.prep.saved')}</AppText>}
      <AppButton title={t('common.save')} icon="checkmark-outline" fullWidth loading={save.isLoading} onPress={() => void submit()} />

      <AppCard style={styles.card}>
        <AppText variant="subheading">{t('cj.prep.shareTitle')}</AppText>
        <AppText variant="caption" color="textMuted">{t('cj.prep.shareHint')}</AppText>
        <AppButton title={t('cj.prep.shareCta')} icon="shield-checkmark-outline" variant="outline" size="sm" onPress={() => router.push('/patient/grant-access')} />
      </AppCard>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  section: { gap: spacing.sm },
  card: { gap: spacing.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  flex: { flex: 1, gap: spacing.xxs },
});

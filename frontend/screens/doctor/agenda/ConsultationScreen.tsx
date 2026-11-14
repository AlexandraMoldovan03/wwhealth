import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { RefreshControl, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { AppButton, AppCard, AppText, Badge, ErrorState, ListRow, LoadingState, ScreenContainer, SectionHeader } from '@/design-system';
import { spacing } from '@/design-system/theme';
import { useTheme } from '@/design-system/useTheme';
import { useAsync } from '@/hooks/useAsync';
import { useLanguage } from '@/hooks/useLanguage';
import { AppointmentCard } from '@/screens/shared/components/AppointmentCard';
import { CareInsightsPanel } from '@/screens/shared/components/CareInsightsPanel';
import { OrganizedRecordView } from '@/screens/shared/components/RecordItemList';
import { TreatmentCard } from '@/screens/shared/components/TreatmentCard';
import { api } from '@/services/backend';
import type { RecordItem } from '@/types';
import { formatDate } from '@/utils/format';

/**
 * Consultation sheet: the appointment, what the patient prepared, and — ONLY for the sections the patient shared
 * (active grant, verified in the backend / RLS) — allergies, conditions, medication, WWHealth treatments, labs and
 * documents. Nothing shared → nothing shown, with a clear explanation.
 */
export function ConsultationScreen() {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const language = useLanguage();
  const { id } = useLocalSearchParams<{ id: string }>();
  const load = useCallback(() => api.getConsultation(id, language), [id, language]);
  const { data, error, isLoading, reload } = useAsync(load, { refetchOnFocus: true });
  const [showRecord, setShowRecord] = useState(false);
  const patientId = data?.appointment.patientId ?? '';
  const loadRecord = useCallback(() => api.getPatientRecordView(patientId, 'relevance', id, language), [patientId, id, language]);
  const record = useAsync(loadRecord, { immediate: false });
  const insights = useCallback(() => api.getPatientInsights(patientId, language, data?.preparation?.reason ?? null), [patientId, language, data?.preparation?.reason]);

  if (error && !data) return <ScreenContainer edges={['bottom']}><ErrorState message={error} onRetry={reload} /></ScreenContainer>;
  if (!data) return <ScreenContainer edges={['bottom']}><LoadingState count={4} /></ScreenContainer>;

  const p = data.preparation;
  const shared = !!data.grant && data.grant.status === 'active';
  const canPrescribe = shared && !!data.grant?.scopes.includes('profile');
  const openDoc = (docId: string) => router.push({ pathname: '/doctor/patient/[id]/document/[docId]', params: { id: patientId, docId } });
  const openItem = (i: RecordItem) => i.documentId && openDoc(i.documentId);
  const newPlan = () => router.push({ pathname: '/doctor/treatment', params: { patientId, appointmentId: id } });

  return (
    <ScreenContainer edges={['bottom']} help="consultation" refreshControl={<RefreshControl refreshing={isLoading} onRefresh={reload} tintColor={colors.primary} />}>
      <AppointmentCard appointment={data.appointment} perspective="doctor" />

      <SectionHeader title={t('cj.consult.preparation')} />
      {p && (p.reason || p.symptoms || p.questions.length || p.careSummary) ? (
        <AppCard style={styles.card}>
          {!!p.reason && <Field label={t('cj.prep.reason')} value={p.reason} />}
          {!!p.symptoms && <Field label={t('cj.prep.symptoms')} value={p.symptoms} />}
          {p.questions.length > 0 && (
            <View style={styles.block}>
              <AppText variant="label" color="textMuted">{t('cj.prep.questions')}</AppText>
              {p.questions.map((q, i) => <AppText key={i}>{i + 1}. {q}</AppText>)}
            </View>
          )}
          {p.careSummary && (
            <View style={styles.block}>
              <AppText variant="label" color="textMuted">{t('cj.consult.careSummary')}</AppText>
              <AppText>{p.careSummary.symptomSummary}</AppText>
              {p.careSummary.specialties.length > 0 && <AppText variant="caption" color="textMuted">{p.careSummary.specialties.join(', ')}</AppText>}
              <AppText variant="caption" color="textMuted">{t('cj.consult.careSummaryNote')}</AppText>
            </View>
          )}
        </AppCard>
      ) : (
        <AppText color="textMuted">{t('cj.consult.notPrepared')}</AppText>
      )}

      <SectionHeader title={t('cj.consult.access')} />
      {shared ? (
        <View style={styles.badges}>
          {data.grant?.scopes.map((s) => <Badge key={s} label={t(`consent.scopes.${s}`, { defaultValue: s })} color={colors.success} />)}
          {data.grant?.expiresAt && <AppText variant="caption" color="textMuted">{t('cj.consult.until', { date: formatDate(data.grant.expiresAt) })}</AppText>}
        </View>
      ) : (
        <AppCard style={styles.card}>
          <AppText>{t(data.grant ? `cj.consult.grant.${data.grant.status}` : 'cj.consult.grant.none')}</AppText>
          <AppText variant="caption" color="textMuted">{t('cj.consult.grantHint')}</AppText>
        </AppCard>
      )}

      {data.allergies && (
        <Section title={t('cj.record.category.allergies')}>
          {data.allergies.length ? data.allergies.map((a) => (
            <ListRow key={a.id} icon="warning-outline" iconColor={colors.danger} title={a.substance} subtitle={[a.reaction, t(`enums.severity.${a.severity}`, { defaultValue: a.severity })].filter(Boolean).join(' · ')} />
          )) : <AppText color="textMuted">{t('cj.consult.noneDeclared')}</AppText>}
        </Section>
      )}

      {data.treatments && (
        <Section title={t('cj.consult.treatments')} action={canPrescribe ? <AppButton title={t('cj.treat.new')} icon="add-outline" size="sm" onPress={newPlan} /> : null}>
          {data.treatments.map((pl) => (
            <TreatmentCard key={pl.id} plan={pl} onPress={() => router.push({ pathname: '/doctor/treatment', params: { patientId, planId: pl.id } })} />
          ))}
          {!data.treatments.length && <AppText color="textMuted">{t('cj.consult.noPlans')}</AppText>}
        </Section>
      )}

      {data.declaredMedication && data.declaredMedication.length > 0 && (
        <Section title={t('cj.consult.declared')}>
          {data.declaredMedication.map((m) => (
            <ListRow key={m.id} icon="person-outline" title={m.name} subtitle={[m.dosage, m.frequency].filter(Boolean).join(' · ')}
              right={<Badge label={t('cj.record.verification.patient_declared')} color={colors.warning} />} />
          ))}
        </Section>
      )}

      {data.diagnoses && data.diagnoses.length > 0 && (
        <Section title={t('cj.record.category.conditions')}>
          {data.diagnoses.map((d) => (
            <ListRow key={d.id} icon="pulse-outline" title={d.name} subtitle={[d.icd10, d.diagnosedAt && formatDate(d.diagnosedAt), t('cj.record.verification.patient_declared')].filter(Boolean).join(' · ')} />
          ))}
        </Section>
      )}

      {data.surgeries && data.surgeries.length > 0 && (
        <Section title={t('cj.record.category.procedures')}>
          {data.surgeries.map((s) => <ListRow key={s.id} icon="cut-outline" title={s.name} subtitle={[s.date && formatDate(s.date), s.notes].filter(Boolean).join(' · ')} />)}
        </Section>
      )}

      {data.labs && data.labs.length > 0 && (
        <Section title={t('cj.record.category.labs')}>
          {data.labs.slice(0, 12).map((l, i) => (
            <ListRow key={`${l.documentId}${i}`} icon="flask-outline" title={l.name} subtitle={[`${l.value}${l.unit ? ` ${l.unit}` : ''}`, l.documentTitle].filter(Boolean).join(' · ')}
              onPress={() => openDoc(l.documentId)} />
          ))}
        </Section>
      )}

      {data.documents && data.documents.length > 0 && (
        <Section title={t('cj.consult.documents')}>
          {data.documents.map((d) => (
            <ListRow key={d.id} icon="document-outline" title={d.title} subtitle={`${t(`documentTypes.${d.type}`, { defaultValue: d.type })} · ${formatDate(d.uploadedAt)}`} onPress={() => openDoc(d.id)} />
          ))}
        </Section>
      )}

      {shared && (
        <>
          <AppButton title={t(showRecord ? 'cj.consult.hideRecord' : 'cj.consult.showRecord')} icon="albums-outline" variant="outline"
            onPress={() => { setShowRecord((v) => !v); if (!record.data) void record.reload(); }} />
          {showRecord && record.error && <ErrorState compact message={record.error} onRetry={record.reload} />}
          {showRecord && !record.data && record.isLoading && <LoadingState count={2} />}
          {showRecord && record.data && <OrganizedRecordView record={record.data} onOpen={openItem} />}
          <CareInsightsPanel perspective="doctor" fetch={insights} />
        </>
      )}
    </ScreenContainer>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.block}>
      <AppText variant="label" color="textMuted">{label}</AppText>
      <AppText>{value}</AppText>
    </View>
  );
}

function Section({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <View style={styles.head}>
        <View style={styles.flex}><SectionHeader title={title} /></View>
        {action}
      </View>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: spacing.sm },
  card: { gap: spacing.sm },
  block: { gap: spacing.xxs },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, alignItems: 'center' },
  head: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  flex: { flex: 1 },
});

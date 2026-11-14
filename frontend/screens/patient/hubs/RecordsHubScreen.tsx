import { router } from 'expo-router';
import { RefreshControl, StyleSheet, View } from 'react-native';

import { AppButton, EmptyState, ErrorState, ListRow, LoadingState, ScreenContainer, SectionHeader } from '@/design-system';
import { spacing } from '@/design-system/theme';
import { useAsync } from '@/hooks/useAsync';
import { useTheme } from '@/design-system/useTheme';
import { FeatureExplainer } from '@/screens/shared/components/FeatureExplainer';
import { HubHeader } from '@/screens/shared/components/HubHeader';
import { api } from '@/services/backend';
import { useTranslation } from 'react-i18next';

/** "My record" (COLLECT): everything the patient adds — profile, documents, confirmed labs, timeline, voice intake. */
export function RecordsHubScreen() {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const patient = useAsync(api.getMyPatient, { refetchOnFocus: true });
  const labs = useAsync(api.listLabValues, { refetchOnFocus: true });
  const p = patient.data;
  const history = p ? p.allergies.length + p.diagnoses.length + p.treatments.length + (p.surgeries?.length ?? 0) : 0;
  const labDocs = new Set((labs.data ?? []).map((v) => v.documentId)).size;

  return (
    <ScreenContainer
      help="records"
      refreshControl={<RefreshControl refreshing={patient.isLoading && !!p} onRefresh={patient.reload} tintColor={colors.primary} />}
    >
      <HubHeader step={t('journey.collect.title')} title={t('hubs.records.title')} subtitle={t('hubs.records.subtitle')} />

      {patient.error && !p ? (
        <ErrorState message={patient.error} onRetry={patient.reload} />
      ) : !p ? (
        <LoadingState count={3} />
      ) : (
        <>
          <View style={styles.section}>
            <SectionHeader title={t('hubs.records.aboutYou')} />
            <ListRow
              icon="person-outline"
              iconColor={colors.primary}
              title={t('hubs.records.profile')}
              subtitle={history > 0 ? t('hubs.records.profileCount', { count: history }) : t('hubs.records.profileEmpty')}
              enterIndex={1}
              onPress={() => router.push('/patient/profile')}
            />
            <ListRow
              icon="mic-outline"
              iconColor={colors.primary}
              title={t('hubs.records.intake')}
              subtitle={t('hubs.records.intakeHint')}
              enterIndex={2}
              onPress={() => router.push('/patient/intake')}
            />
          </View>

          <View style={styles.section}>
            <SectionHeader title={t('hubs.records.documentsTitle')} subtitle={t('hubs.records.documentsSubtitle')} />
            {p.documents.length === 0 ? (
              <EmptyState
                icon="document-text-outline"
                title={t('hubs.records.noDocuments')}
                message={t('hubs.records.noDocumentsHint')}
                actionLabel={t('hubs.records.uploadFirst')}
                onAction={() => router.push('/patient/upload-document')}
              />
            ) : (
              <>
                <ListRow
                  icon="folder-open-outline"
                  iconColor={colors.accent}
                  title={t('hubs.records.documents')}
                  subtitle={t('hubs.records.documentsCount', { count: p.documents.length })}
                  enterIndex={3}
                  onPress={() => router.push('/patient/documents')}
                />
                <ListRow
                  icon="flask-outline"
                  iconColor={colors.accent}
                  title={t('hubs.records.labs')}
                  subtitle={
                    labs.data && labs.data.length > 0
                      ? t('hubs.records.labsCount', { count: labs.data.length, docs: labDocs })
                      : t('hubs.records.labsEmpty')
                  }
                  enterIndex={4}
                  onPress={() => router.navigate(labs.data && labs.data.length > 0 ? '/history' : '/patient/documents')}
                />
                <AppButton
                  title={t('hubs.records.upload')}
                  icon="cloud-upload-outline"
                  variant="outline"
                  fullWidth
                  onPress={() => router.push('/patient/upload-document')}
                />
              </>
            )}
            <FeatureExplainer id="ocr" />
          </View>

          <View style={styles.section}>
            <SectionHeader title={t('hubs.records.timelineTitle')} />
            <ListRow
              icon="time-outline"
              iconColor={colors.danger}
              title={t('hubs.records.timeline')}
              subtitle={p.history.length > 0 ? t('hubs.records.timelineCount', { count: p.history.length }) : t('hubs.records.timelineEmpty')}
              enterIndex={5}
              onPress={() => router.navigate('/history')}
            />
          </View>
        </>
      )}
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({ section: { gap: spacing.md } });

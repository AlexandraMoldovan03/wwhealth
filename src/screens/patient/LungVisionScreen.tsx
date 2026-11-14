import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { Ionicons } from '@expo/vector-icons';
import Animated from 'react-native-reanimated';

import { AppButton, AppText, Badge, DemoNotice, ErrorState, GradientCard, ImagePickerArea, LoadingState, ScreenContainer, popIn } from '@/components/ui';
import { USE_MOCKS } from '@/constants/config';
import { gradients, spacing } from '@/constants/theme';
import { LungResultCard } from '@/features/lungvision/components/LungResultCard';
import { useXrayAnalysis } from '@/features/lungvision/useXrayAnalysis';
import { useTheme } from '@/hooks/useTheme';
import { useTranslation } from 'react-i18next';

/** LungVision AI tab — chest X-ray → DenseNet121 + Grad-CAM on the backend (POST /api/ai/lung/analyze). */
export function LungVisionScreen() {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const { imageUri, result, error, isAnalyzing, pickFromLibrary, takePhoto, analyze, reset } = useXrayAnalysis();
  const showResult = !!result && !isAnalyzing;

  return (
    // New key when the result appears → fresh ScrollView at the top, so the classification is the first thing seen.
    <ScreenContainer key={showResult ? 'result' : 'select'}>
      {showResult ? (
        <View style={styles.titleRow}>
          <AppText variant="title" accessibilityRole="header">
            LungVision AI
          </AppText>
          {USE_MOCKS && <Badge label="DEMO" color={colors.warning} />}
        </View>
      ) : (
        <GradientCard colors={gradients.patientHero} enterIndex={0}>
          <View style={styles.heroRow}>
            <View style={styles.heroIcon}>
              <Ionicons name="scan" size={24} color="#466C61" />
            </View>
            {USE_MOCKS && <Badge label="DEMO" color="#FFFFFF" />}
          </View>
          <AppText variant="title" style={styles.white} accessibilityRole="header">
            LungVision AI
          </AppText>
          <AppText variant="caption" style={styles.soft}>
            {t('lung.subtitle')}
          </AppText>
        </GradientCard>
      )}

      {showResult && result && (
        <>
          <Animated.View entering={popIn}>
            <LungResultCard result={result} imageUri={imageUri} />
          </Animated.View>
          <AppButton title={t('lung.analyzeAnother')} variant="outline" icon="refresh" fullWidth onPress={reset} />
        </>
      )}

      {!showResult && (
        <>
          <ImagePickerArea imageUri={imageUri} onPress={pickFromLibrary} title={t('lung.select')} hint={t('lung.selectHint')} />

          <View style={styles.actions}>
            <View style={styles.flex}>
              <AppButton title={t('lung.gallery')} icon="images-outline" variant="outline" fullWidth onPress={pickFromLibrary} />
            </View>
            <View style={styles.flex}>
              <AppButton title={t('lung.camera')} icon="camera-outline" variant="outline" fullWidth onPress={takePhoto} />
            </View>
          </View>

          <AppButton title={t('lung.analyze')} icon="sparkles" size="lg" fullWidth disabled={!imageUri} loading={isAnalyzing} onPress={analyze} />

          {isAnalyzing && <LoadingState message={t('lung.running')} />}
          {error && !isAnalyzing && <ErrorState message={error} onRetry={imageUri ? analyze : undefined} />}

          {!isAnalyzing && (
            <>
              <DemoNotice
                message={
                  USE_MOCKS
                    ? t('lung.mockNotice')
                    : t('lung.notice')
                }
              />
              <AppButton title={t('lung.previous')} variant="ghost" icon="time-outline" onPress={() => router.push('/patient/xray-results')} />
            </>
          )}
        </>
      )}
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  heroRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  heroIcon: { width: 48, height: 48, borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.92)', alignItems: 'center', justifyContent: 'center' },
  white: { color: '#FFFFFF' },
  soft: { color: 'rgba(255,255,255,0.94)' },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  actions: { flexDirection: 'row', gap: spacing.md },
  flex: { flex: 1 },
});

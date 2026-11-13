import { StyleSheet, View } from 'react-native';

import { AppButton, AppCard, AppText, Badge, ErrorState, LoadingState, ScreenContainer } from '@/components/ui';
import { USE_MOCK_API } from '@/constants/config';
import { spacing } from '@/constants/theme';
import { AnalysisResultCard } from '@/features/analysis/components/AnalysisResultCard';
import { ImagePickerArea } from '@/features/analysis/components/ImagePickerArea';
import { useImageAnalysis } from '@/features/analysis/useImageAnalysis';
import { useTheme } from '@/hooks/useTheme';

export function AnalysisScreen() {
  const { colors } = useTheme();
  const { imageUri, result, error, isAnalyzing, pickFromLibrary, takePhoto, analyze, reset } = useImageAnalysis();

  return (
    <ScreenContainer>
      <View style={styles.header}>
        <View style={styles.titleRow}>
          <AppText variant="title">AI Analysis</AppText>
          {USE_MOCK_API && <Badge label="DEMO" color={colors.warning} />}
        </View>
        <AppText color="textMuted">
          {USE_MOCK_API
            ? 'Results are simulated. Connect FastAPI to get real predictions.'
            : 'Images are sent to your FastAPI backend.'}
        </AppText>
      </View>

      <ImagePickerArea imageUri={imageUri} onPress={pickFromLibrary} />

      <View style={styles.actions}>
        <View style={styles.flex}>
          <AppButton title="Gallery" icon="images-outline" variant="outline" fullWidth onPress={pickFromLibrary} />
        </View>
        <View style={styles.flex}>
          <AppButton title="Camera" icon="camera-outline" variant="outline" fullWidth onPress={takePhoto} />
        </View>
      </View>

      <AppButton
        title="Analyze"
        icon="sparkles"
        fullWidth
        disabled={!imageUri}
        loading={isAnalyzing}
        onPress={analyze}
      />

      {isAnalyzing && <LoadingState message="Analyzing image…" />}
      {error && !isAnalyzing && <ErrorState message={error} onRetry={imageUri ? analyze : undefined} />}
      {result && !isAnalyzing && (
        <>
          <AnalysisResultCard result={result} />
          <AppButton title="Start over" variant="ghost" icon="refresh" onPress={reset} />
        </>
      )}

      {!result && !isAnalyzing && (
        <AppCard style={styles.info}>
          <AppText variant="subheading">How it works</AppText>
          <AppText variant="caption" color="textMuted">
            1. Pick or take a photo{'\n'}2. Tap Analyze{'\n'}3. The app calls analyzeImage() in
            src/services/ai/aiService.ts — mock today, FastAPI tomorrow.
          </AppText>
        </AppCard>
      )}
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  header: { gap: spacing.xs },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  actions: { flexDirection: 'row', gap: spacing.md },
  flex: { flex: 1 },
  info: { gap: spacing.xs },
});

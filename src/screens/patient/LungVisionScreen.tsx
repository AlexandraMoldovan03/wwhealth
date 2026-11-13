import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { AppButton, AppText, Badge, DemoNotice, ErrorState, ImagePickerArea, LoadingState, ScreenContainer } from '@/components/ui';
import { USE_MOCKS } from '@/constants/config';
import { spacing } from '@/constants/theme';
import { LungResultCard } from '@/features/lungvision/components/LungResultCard';
import { useXrayAnalysis } from '@/features/lungvision/useXrayAnalysis';
import { useTheme } from '@/hooks/useTheme';

/** LungVision AI tab — chest X-ray → DenseNet121 + Grad-CAM on the backend (POST /api/ai/lung/analyze). */
export function LungVisionScreen() {
  const { colors } = useTheme();
  const { imageUri, result, error, isAnalyzing, pickFromLibrary, takePhoto, analyze, reset } = useXrayAnalysis();
  const showResult = !!result && !isAnalyzing;

  return (
    // New key when the result appears → fresh ScrollView at the top, so the classification is the first thing seen.
    <ScreenContainer key={showResult ? 'result' : 'select'}>
      <View style={styles.header}>
        <View style={styles.titleRow}>
          <AppText variant="title">LungVision AI</AppText>
          {USE_MOCKS && <Badge label="DEMO" color={colors.warning} />}
        </View>
        {!showResult && (
          <AppText color="textMuted">
            Experimental pneumonia screening with DenseNet121 (trained on PneumoniaMNIST) and Grad-CAM explanations.
          </AppText>
        )}
      </View>

      {showResult && result && (
        <>
          <LungResultCard result={result} imageUri={imageUri} />
          <AppButton title="Analyze another X-ray" variant="outline" icon="refresh" fullWidth onPress={reset} />
        </>
      )}

      {!showResult && (
        <>
          <ImagePickerArea imageUri={imageUri} onPress={pickFromLibrary} title="Select a chest X-ray" hint="Frontal (PA/AP) view works best" />

          <View style={styles.actions}>
            <View style={styles.flex}>
              <AppButton title="Gallery" icon="images-outline" variant="outline" fullWidth onPress={pickFromLibrary} />
            </View>
            <View style={styles.flex}>
              <AppButton title="Camera" icon="camera-outline" variant="outline" fullWidth onPress={takePhoto} />
            </View>
          </View>

          <AppButton title="Analyze" icon="sparkles" fullWidth disabled={!imageUri} loading={isAnalyzing} onPress={analyze} />

          {isAnalyzing && <LoadingState message="Running the model on the server…" />}
          {error && !isAnalyzing && <ErrorState message={error} onRetry={imageUri ? analyze : undefined} />}

          {!isAnalyzing && (
            <>
              <DemoNotice
                message={
                  USE_MOCKS
                    ? 'MOCK mode: LungVision is disabled because it needs the real model on the backend. Set EXPO_PUBLIC_USE_MOCKS=false.'
                    : 'Educational prototype, not a medical device. The image is sent only to your WWHealth backend and is not stored.'
                }
              />
              <AppButton title="Previous results" variant="ghost" icon="time-outline" onPress={() => router.push('/patient/xray-results')} />
            </>
          )}
        </>
      )}
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  header: { gap: spacing.xs },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  actions: { flexDirection: 'row', gap: spacing.md },
  flex: { flex: 1 },
});

import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { AppButton, AppText, Badge, DemoNotice, ErrorState, ImagePickerArea, LoadingState, ScreenContainer } from '@/components/ui';
import { USE_MOCKS } from '@/constants/config';
import { spacing } from '@/constants/theme';
import { XrayResultCard } from '@/features/lungvision/components/XrayResultCard';
import { useXrayAnalysis } from '@/features/lungvision/useXrayAnalysis';
import { useTheme } from '@/hooks/useTheme';

/** LungVision AI tab — chest X-ray → DenseNet121 + Grad-CAM (backend). */
export function LungVisionScreen() {
  const { colors } = useTheme();
  const { imageUri, result, error, isAnalyzing, pickFromLibrary, takePhoto, analyze, reset } = useXrayAnalysis();

  return (
    <ScreenContainer>
      <View style={styles.header}>
        <View style={styles.titleRow}>
          <AppText variant="title">LungVision AI</AppText>
          {USE_MOCKS && <Badge label="DEMO" color={colors.warning} />}
        </View>
        <AppText color="textMuted">Chest X-ray analysis with DenseNet121 and Grad-CAM explanations.</AppText>
      </View>

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

      {isAnalyzing && <LoadingState message="Running LungVision…" />}
      {error && !isAnalyzing && <ErrorState message={error} onRetry={imageUri ? analyze : undefined} />}
      {result && !isAnalyzing && (
        <>
          <XrayResultCard result={result} />
          <AppButton
            title="All X-ray results"
            variant="secondary"
            icon="images-outline"
            onPress={() => router.push({ pathname: '/patient/xray-results', params: { id: result.id } })}
          />
          <AppButton title="Analyze another" variant="ghost" icon="refresh" onPress={reset} />
        </>
      )}

      {!result && !isAnalyzing && (
        <>
          <DemoNotice />
          <AppButton title="Previous results" variant="ghost" icon="time-outline" onPress={() => router.push('/patient/xray-results')} />
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

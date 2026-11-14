import { router, useIsFocused } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Ionicons } from '@expo/vector-icons';
import Animated from 'react-native-reanimated';

import { AppButton, AppText, Badge, DemoNotice, ErrorState, GradientCard, ImagePickerArea, LoadingState, ScreenContainer, fadeIn } from '@/design-system';
import { USE_MOCKS } from '@/config/config';
import { gradients, spacing } from '@/design-system/theme';
import { LungsPicker } from './components/LungsPicker';
import { LungResultCard } from './components/LungResultCard';
import { useXrayAnalysis } from './useXrayAnalysis';
import { useTheme } from '@/design-system/useTheme';
import { useTranslation } from 'react-i18next';

/** LungVision AI tab — chest X-ray → DenseNet121 + Grad-CAM on the backend (POST /api/ai/lung/analyze). */
export function LungVisionScreen() {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const { imageUri, result, error, isAnalyzing, pickFromLibrary, takePhoto, analyze, reset } = useXrayAnalysis();
  const focused = useIsFocused();
  const [showSources, setShowSources] = useState(false);
  const showResult = !!result && !isAnalyzing;

  return (
    // New key when the result appears → fresh ScrollView at the top, so the classification is the first thing seen.
    <ScreenContainer help="lungvision" key={showResult ? 'result' : 'select'}>
      {showResult ? (
        <View style={styles.titleRow}>
          <AppText variant="title" accessibilityRole="header">
            LungVision AI
          </AppText>
          {USE_MOCKS && <Badge label={t('home.demoData')} color={colors.warning} />}
        </View>
      ) : (
        <GradientCard colors={gradients.patientHero} enterIndex={0}>
          <View style={styles.heroRow}>
            <View style={styles.heroIcon}>
              <Ionicons name="scan" size={24} color="#466C61" />
            </View>
            {USE_MOCKS && <Badge label={t('home.demoData')} color="#FFFFFF" />}
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
          <Animated.View entering={fadeIn()}>
            <LungResultCard result={result} imageUri={imageUri} />
          </Animated.View>
          <AppButton title={t('lung.analyzeAnother')} variant="outline" icon="refresh" fullWidth onPress={() => { setShowSources(false); reset(); }} />
        </>
      )}

      {!showResult && (
        <>
          {imageUri ? (
            <ImagePickerArea
              imageUri={imageUri}
              onPress={pickFromLibrary}
              onRemove={() => { setShowSources(false); reset(); }}
              title={t('lung.select')}
              hint={t('lung.selectHint')}
            />
          ) : focused && !showSources ? (
            <View>
              <LungsPicker onReveal={() => setShowSources(true)} />
              <View style={styles.sceneCaption}>
                <AppText variant="heading" align="center">{t('lung.animatePreview')}</AppText>
                <AppText variant="caption" color="textMuted" align="center">{t('lung.selectHint')}</AppText>
              </View>
            </View>
          ) : null}

          {(showSources || imageUri) && (
            <Animated.View entering={fadeIn()} style={styles.actions}>
            <View style={styles.flex}>
              <AppButton title={t('lung.gallery')} icon="images-outline" variant="outline" fullWidth onPress={pickFromLibrary} />
            </View>
            <View style={styles.flex}>
              <AppButton title={t('lung.camera')} icon="camera-outline" variant="outline" fullWidth onPress={takePhoto} />
            </View>
            </Animated.View>
          )}

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
  sceneCaption: { alignItems: 'center', gap: spacing.xxs },
  actions: { flexDirection: 'row', gap: spacing.md },
  flex: { flex: 1 },
});

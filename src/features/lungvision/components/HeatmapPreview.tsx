import { Ionicons } from '@expo/vector-icons';
import { Image, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui';
import { radius, spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/useTheme';
import { useTranslation } from 'react-i18next';

interface HeatmapPreviewProps {
  imageUrl: string | null;
  heatmapUrl: string | null;
  /** Label shown over a real heatmap (e.g. what the overlay means). */
  caption?: string;
}

/**
 * Shows the Grad-CAM overlay when the backend sends `heatmapUrl`.
 * Until then: original image (if any) + a clearly labelled placeholder.
 */
export function HeatmapPreview({ imageUrl, heatmapUrl, caption }: HeatmapPreviewProps) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const source = heatmapUrl ?? imageUrl;
  return (
    <View style={[styles.frame, { backgroundColor: colors.surfaceAlt }]}>
      {source ? (
        <Image source={{ uri: source }} style={StyleSheet.absoluteFill} resizeMode="cover" />
      ) : (
        <Ionicons name="body-outline" size={48} color={colors.textSubtle} />
      )}
      {(!heatmapUrl || caption) && (
        <View style={[styles.label, { backgroundColor: colors.overlay }]}>
          <AppText variant="caption" style={styles.labelText}>
            {heatmapUrl ? caption : t('xray.heatmapPlaceholder')}
          </AppText>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  frame: { aspectRatio: 1, borderRadius: radius.lg, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  label: { position: 'absolute', bottom: spacing.sm, marginHorizontal: spacing.sm, paddingHorizontal: spacing.sm, paddingVertical: spacing.xs, borderRadius: radius.sm },
  labelText: { color: '#FFFFFF' },
});

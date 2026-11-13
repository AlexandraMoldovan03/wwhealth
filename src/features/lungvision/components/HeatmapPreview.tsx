import { Ionicons } from '@expo/vector-icons';
import { Image, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui';
import { radius, spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/useTheme';

interface HeatmapPreviewProps {
  imageUrl: string | null;
  heatmapUrl: string | null;
}

/**
 * Shows the Grad-CAM overlay when the backend sends `heatmapUrl`.
 * Until then: original image (if any) + a clearly labelled placeholder.
 */
export function HeatmapPreview({ imageUrl, heatmapUrl }: HeatmapPreviewProps) {
  const { colors } = useTheme();
  const source = heatmapUrl ?? imageUrl;
  return (
    <View style={[styles.frame, { backgroundColor: colors.surfaceAlt }]}>
      {source ? (
        <Image source={{ uri: source }} style={StyleSheet.absoluteFill} resizeMode="cover" />
      ) : (
        <Ionicons name="body-outline" size={48} color={colors.textSubtle} />
      )}
      {!heatmapUrl && (
        <View style={[styles.label, { backgroundColor: colors.overlay }]}>
          <AppText variant="caption" style={styles.labelText}>
            Grad-CAM heatmap placeholder
          </AppText>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  frame: { aspectRatio: 1, borderRadius: radius.lg, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  label: { position: 'absolute', bottom: spacing.sm, paddingHorizontal: spacing.sm, paddingVertical: spacing.xs, borderRadius: radius.sm },
  labelText: { color: '#FFFFFF' },
});

import { Ionicons } from '@expo/vector-icons';
import { Image, Pressable, StyleSheet, View } from 'react-native';

import { radius, spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/useTheme';

import { AppText } from './AppText';

export interface ImagePickerAreaProps {
  title?: string;
  hint?: string;
  imageUri: string | null;
  onPress: () => void;
}

/** Dashed drop-zone that shows the selected image or a placeholder. */
export function ImagePickerArea({ imageUri, onPress, title = 'Select an image', hint = 'Tap to choose from your gallery' }: ImagePickerAreaProps) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={imageUri ? 'Change image' : 'Select image'}
      style={[styles.area, { borderColor: colors.border, backgroundColor: colors.surfaceAlt }]}
    >
      {imageUri ? (
        <Image source={{ uri: imageUri }} style={styles.image} resizeMode="cover" />
      ) : (
        <View style={styles.placeholder}>
          <Ionicons name="image-outline" size={40} color={colors.primary} />
          <AppText variant="subheading">{title}</AppText>
          <AppText variant="caption" color="textMuted" align="center">
            {hint}
          </AppText>
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  area: {
    aspectRatio: 4 / 3,
    borderRadius: radius.lg,
    borderWidth: 2,
    borderStyle: 'dashed',
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  image: { width: '100%', height: '100%' },
  placeholder: { alignItems: 'center', gap: spacing.xs, padding: spacing.lg },
});

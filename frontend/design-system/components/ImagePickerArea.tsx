import { Ionicons } from '@expo/vector-icons';
import { Image, Pressable, StyleSheet, View } from 'react-native';

import { radius, spacing } from '@/design-system/theme';
import { useTheme } from '@/design-system/useTheme';

import { AppText } from './AppText';
import { useTranslation } from 'react-i18next';

export interface ImagePickerAreaProps {
  title?: string;
  hint?: string;
  imageUri: string | null;
  onPress: () => void;
  onRemove?: () => void;
}

/** Dashed drop-zone that shows the selected image or a placeholder. */
export function ImagePickerArea({ imageUri, onPress, onRemove, title, hint }: ImagePickerAreaProps) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  return (
    <View style={styles.container}>
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={imageUri ? t('image.change') : t('image.selectA11y')}
        style={[styles.area, { borderColor: colors.border, backgroundColor: colors.surfaceAlt }]}
      >
        {imageUri ? (
          <Image source={{ uri: imageUri }} style={styles.image} resizeMode="cover" />
        ) : (
          <View style={styles.placeholder}>
            <Ionicons name="image-outline" size={40} color={colors.primary} />
            <AppText variant="subheading">{title ?? t('image.select')}</AppText>
            <AppText variant="caption" color="textMuted" align="center">
              {hint ?? t('image.hint')}
            </AppText>
          </View>
        )}
      </Pressable>
      {imageUri && onRemove && (
        <Pressable
          onPress={onRemove}
          accessibilityRole="button"
          accessibilityLabel={t('image.remove')}
          hitSlop={6}
          style={[styles.remove, { backgroundColor: colors.overlay }]}
        >
          <Ionicons name="close" size={21} color="#FFFFFF" />
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { width: '100%', aspectRatio: 4 / 3, position: 'relative' },
  area: {
    flex: 1,
    borderRadius: radius.lg,
    borderWidth: 2,
    borderStyle: 'dashed',
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  image: { width: '100%', height: '100%' },
  placeholder: { alignItems: 'center', gap: spacing.xs, padding: spacing.lg },
  remove: {
    position: 'absolute',
    top: spacing.sm,
    right: spacing.sm,
    width: 38,
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.pill,
    zIndex: 1,
  },
});

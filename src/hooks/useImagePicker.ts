import * as ImagePicker from 'expo-image-picker';
import { useCallback, useState } from 'react';

import { getErrorMessage } from '@/utils/errors';

/**
 * Pick an image from the gallery or camera (expo-image-picker, works in Expo Go).
 * Used by LungVision (X-rays) and Upload Document.
 */
export function useImagePicker(options: { allowsEditing?: boolean } = {}) {
  const { allowsEditing = false } = options;
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [pickError, setPickError] = useState<string | null>(null);

  const handle = (picked: ImagePicker.ImagePickerResult) => {
    if (picked.canceled || picked.assets.length === 0) return;
    setImageUri(picked.assets[0].uri);
    setPickError(null);
  };

  const pickFromLibrary = useCallback(async () => {
    try {
      handle(await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing, quality: 0.8 }));
    } catch (err) {
      setPickError(getErrorMessage(err));
    }
  }, [allowsEditing]);

  const takePhoto = useCallback(async () => {
    try {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) {
        setPickError('Camera permission is required to take a photo.');
        return;
      }
      handle(await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], allowsEditing, quality: 0.8 }));
    } catch (err) {
      setPickError(getErrorMessage(err));
    }
  }, [allowsEditing]);

  const clear = useCallback(() => {
    setImageUri(null);
    setPickError(null);
  }, []);

  return { imageUri, pickError, pickFromLibrary, takePhoto, clear };
}

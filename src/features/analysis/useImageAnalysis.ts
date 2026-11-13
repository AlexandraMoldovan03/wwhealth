import * as ImagePicker from 'expo-image-picker';
import { useCallback, useState } from 'react';

import { analyzeImage } from '@/services/ai/aiService';
import type { AnalysisResult, AsyncStatus } from '@/types';
import { getErrorMessage } from '@/utils/errors';

/**
 * All logic for the AI Analysis screen: picking an image and running analysis.
 * The screen only renders what this hook returns.
 */
export function useImageAnalysis() {
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [status, setStatus] = useState<AsyncStatus>('idle');
  const [error, setError] = useState<string | null>(null);

  const handlePicked = (picked: ImagePicker.ImagePickerResult) => {
    if (picked.canceled || picked.assets.length === 0) return;
    setImageUri(picked.assets[0].uri);
    setResult(null);
    setError(null);
    setStatus('idle');
  };

  const pickFromLibrary = useCallback(async () => {
    try {
      const picked = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        quality: 0.8,
      });
      handlePicked(picked);
    } catch (err) {
      setError(getErrorMessage(err));
    }
  }, []);

  const takePhoto = useCallback(async () => {
    try {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) {
        setError('Camera permission is required to take a photo.');
        return;
      }
      const picked = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.8 });
      handlePicked(picked);
    } catch (err) {
      setError(getErrorMessage(err));
    }
  }, []);

  const analyze = useCallback(async () => {
    if (!imageUri) return;
    setStatus('loading');
    setError(null);
    try {
      setResult(await analyzeImage(imageUri));
      setStatus('success');
    } catch (err) {
      setError(getErrorMessage(err));
      setStatus('error');
    }
  }, [imageUri]);

  const reset = useCallback(() => {
    setImageUri(null);
    setResult(null);
    setError(null);
    setStatus('idle');
  }, []);

  return { imageUri, result, status, error, isAnalyzing: status === 'loading', pickFromLibrary, takePhoto, analyze, reset };
}

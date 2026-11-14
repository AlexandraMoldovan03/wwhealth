import { useImagePicker } from '@/hooks/useImagePicker';
import { useSubmit } from '@/hooks/useSubmit';
import { ApiError } from '@/services/api/ApiError';
import { api } from '@/services/backend';
import type { UploadFile } from '@/types';
import { toUploadFile } from '@/utils/files';

/** Keeps the backend's explanation for 503 (model not set up) instead of a generic "server problem". */
async function analyzeLung(file: UploadFile) {
  try {
    return await api.analyzeLung(file);
  } catch (err) {
    if (err instanceof ApiError && err.status === 503) throw new Error(err.message);
    throw err;
  }
}

/** LungVision logic: pick a chest X-ray → POST /api/ai/lung/analyze (real model on the backend). */
export function useXrayAnalysis() {
  const picker = useImagePicker();
  const submit = useSubmit(analyzeLung);

  const analyze = () => {
    if (picker.imageUri) void submit.run(toUploadFile(picker.imageUri, 'xray.jpg'));
  };

  const pickFromLibrary = async () => {
    submit.reset();
    await picker.pickFromLibrary();
  };

  const takePhoto = async () => {
    submit.reset();
    await picker.takePhoto();
  };

  const reset = () => {
    picker.clear();
    submit.reset();
  };

  return {
    imageUri: picker.imageUri,
    pickFromLibrary,
    takePhoto,
    result: submit.data,
    isAnalyzing: submit.isLoading,
    error: picker.pickError ?? submit.error,
    analyze,
    reset,
  };
}

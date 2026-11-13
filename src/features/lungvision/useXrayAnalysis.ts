import { useImagePicker } from '@/hooks/useImagePicker';
import { useSubmit } from '@/hooks/useSubmit';
import { api } from '@/services/backend';
import { toUploadFile } from '@/utils/files';

/** LungVision logic: pick an X-ray image → POST /api/v1/xray/analyze. */
export function useXrayAnalysis() {
  const picker = useImagePicker();
  const submit = useSubmit(api.analyzeXray);

  const analyze = () => {
    if (picker.imageUri) void submit.run(toUploadFile(picker.imageUri, 'xray.jpg'));
  };

  const reset = () => {
    picker.clear();
    submit.reset();
  };

  return {
    imageUri: picker.imageUri,
    pickFromLibrary: picker.pickFromLibrary,
    takePhoto: picker.takePhoto,
    result: submit.data,
    isAnalyzing: submit.isLoading,
    error: picker.pickError ?? submit.error,
    analyze,
    reset,
  };
}

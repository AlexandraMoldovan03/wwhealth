import { AudioModule, RecordingPresets, setAudioModeAsync, useAudioRecorder } from 'expo-audio';
import { useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';

import { useSubmit } from '@/hooks/useSubmit';
import { api } from '@/services/backend';
import type { IntakeForm, UploadFile } from '@/types';

async function recordingFile(uri: string): Promise<UploadFile> {
  if (Platform.OS !== 'web') return { uri, name: 'symptoms.m4a', type: 'audio/mp4' };
  const blob = await (await fetch(uri)).blob();
  if (!blob.size) throw new Error('The recording is empty. Please try again.');
  const type = blob.type.split(';')[0];
  const extension = type.endsWith('/mp4') ? 'mp4' : type.endsWith('/ogg') ? 'ogg' : 'webm';
  return { uri, name: 'symptoms.' + extension, type };
}

export function useVoiceIntake() {
  const recorder = useAudioRecorder({ ...RecordingPresets.HIGH_QUALITY, isMeteringEnabled: true });
  const { run, reset, error: uploadError } = useSubmit(api.analyzeIntake);
  const [form, setForm] = useState<IntakeForm | null>(null);
  const [revision, setRevision] = useState(0);
  const [phase, setPhase] = useState<'idle' | 'starting' | 'recording' | 'processing'>('idle');
  const [error, setError] = useState<string | null>(null);
  const active = useRef(false);
  const pending = useRef(false);
  const recording = useRef(false);

  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
      if (Platform.OS === 'web' && recording.current) {
        recording.current = false;
        void recorder.stop().then(() => {
          if (recorder.uri) URL.revokeObjectURL(recorder.uri);
        }).catch(() => {});
      }
      if (Platform.OS !== 'web') void setAudioModeAsync({ allowsRecording: false }).catch(() => {});
    };
  }, [recorder]);

  async function start() {
    if (pending.current || recording.current) return;
    pending.current = true;
    setError(null);
    reset();
    setPhase('starting');
    try {
      const permission = await AudioModule.requestRecordingPermissionsAsync();
      if (!active.current) return;
      if (!permission.granted) throw new Error('Allow microphone access in your device or browser settings.');
      if (Platform.OS !== 'web') {
        await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
        if (!active.current) {
          await setAudioModeAsync({ allowsRecording: false });
          return;
        }
      }
      await recorder.prepareToRecordAsync();
      if (!active.current) {
        if (Platform.OS === 'web') {
          recorder.record();
          await recorder.stop();
          if (recorder.uri) URL.revokeObjectURL(recorder.uri);
        }
        return;
      }
      recorder.record();
      recording.current = true;
      setPhase('recording');
    } catch (cause) {
      if (active.current) {
        setError(cause instanceof Error ? cause.message : 'Could not start the microphone.');
        setPhase('idle');
      }
    } finally {
      pending.current = false;
    }
  }

  async function stop() {
    if (pending.current || !recording.current) return;
    pending.current = true;
    recording.current = false;
    setPhase('processing');
    let uri: string | null = null;
    try {
      await recorder.stop();
      uri = recorder.uri;
      if (Platform.OS !== 'web' && active.current) await setAudioModeAsync({ allowsRecording: false });
      if (!active.current) return;
      if (!uri) throw new Error('No recording was created. Please try again.');
      const file = await recordingFile(uri);
      if (!active.current) return;
      const result = await run(file);
      if (result && active.current) {
        setForm(result);
        setRevision((current) => current + 1);
      }
    } catch (cause) {
      if (active.current) setError(cause instanceof Error ? cause.message : 'Could not process the recording.');
    } finally {
      if (uri && Platform.OS === 'web') URL.revokeObjectURL(uri);
      pending.current = false;
      if (active.current) setPhase('idle');
    }
  }

  return { recorder, form, revision, phase, start, stop, error: error ?? uploadError };
}

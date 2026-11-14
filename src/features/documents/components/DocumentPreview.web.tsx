import { createElement, useEffect, useState } from 'react';
import { Image, StyleSheet, View } from 'react-native';

import { ErrorState, LoadingState } from '@/components/ui';
import { getAuthHeaders } from '@/services/api/client';
import { useTranslation } from 'react-i18next';

/** Web: fetch the protected file with the auth header, then show it from a temporary blob: URL. */
export function DocumentPreview({ uri, mimeType }: { uri: string; mimeType: string }) {
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const { t } = useTranslation();

  useEffect(() => {
    let url: string | null = null;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(uri, { headers: await getAuthHeaders() });
        if (!res.ok) throw new Error(String(res.status));
        url = URL.createObjectURL(await res.blob());
        if (!cancelled) setObjectUrl(url);
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [uri]);

  if (failed) return <ErrorState message={t('documents.loadFailed')} />;
  if (!objectUrl) return <LoadingState />;

  if (mimeType.startsWith('image/')) {
    return <Image source={{ uri: objectUrl }} style={styles.fill} resizeMode="contain" accessibilityLabel={t('documents.a11yDocument')} />;
  }
  return (
    <View style={styles.fill}>
      {createElement('iframe', { src: objectUrl, title: t('documents.a11yDocument'), style: { border: 0, width: '100%', height: '100%' } })}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
});

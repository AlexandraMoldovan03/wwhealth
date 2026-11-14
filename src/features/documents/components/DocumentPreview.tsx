import { useEffect, useState } from 'react';
import { Image, Platform, StyleSheet, View } from 'react-native';
import { WebView } from 'react-native-webview';

import { EmptyState, ErrorState, LoadingState } from '@/components/ui';
import { getAuthHeaders } from '@/services/api/client';
import { useTranslation } from 'react-i18next';

/**
 * Shows a protected document (iOS / Android). The auth header is sent with the request, so the
 * file never needs a public URL. PDFs render in a WebView (native PDF viewer on iOS).
 */
export function DocumentPreview({ uri, mimeType }: { uri: string; mimeType: string }) {
  const [headers, setHeaders] = useState<Record<string, string> | null>(null);
  const [failed, setFailed] = useState(false);
  const { t } = useTranslation();
  const isLocal = uri.startsWith('file:');

  useEffect(() => {
    void getAuthHeaders().then(setHeaders);
  }, []);

  if (!headers) return <LoadingState />;
  if (failed) return <ErrorState message={t('documents.loadFailed')} />;

  if (mimeType.startsWith('image/')) {
    return (
      <View style={styles.fill}>
        <Image
          source={{ uri, headers: isLocal ? undefined : headers }}
          style={styles.fill}
          resizeMode="contain"
          onError={() => setFailed(true)}
          accessibilityLabel={t('documents.a11yDocument')}
        />
      </View>
    );
  }

  if (Platform.OS === 'android') {
    // Android's WebView has no built-in PDF renderer.
    return <EmptyState icon="document-text-outline" title={t('documents.noPdfAndroid')} message={t('documents.noPdfAndroidHint')} />;
  }

  return (
    <WebView
      source={{ uri, headers: isLocal ? undefined : headers }}
      style={styles.fill}
      originWhitelist={['*']}
      allowFileAccess
      allowingReadAccessToURL={isLocal ? uri : undefined}
      startInLoadingState
      renderLoading={() => <LoadingState />}
      onError={() => setFailed(true)}
      onHttpError={() => setFailed(true)}
    />
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
});

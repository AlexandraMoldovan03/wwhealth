import { StyleSheet, View } from 'react-native';
import { WebView } from 'react-native-webview';

import type { HtmlSceneProps } from './HtmlScene.types';

const sceneUrl = 'https://wwhealth.invalid/';

export function HtmlScene({ html, height, title, onMessage }: HtmlSceneProps) {
  return (
    <View style={[styles.container, { height }]}>
      <WebView
        accessibilityLabel={title}
        source={{ html, baseUrl: sceneUrl }}
        originWhitelist={['*']}
        onShouldStartLoadWithRequest={({ url }) => url === 'about:blank' || url === sceneUrl}
        scrollEnabled={false}
        bounces={false}
        style={styles.scene}
        onMessage={({ nativeEvent }) => {
          let message: unknown;
          try {
            message = JSON.parse(nativeEvent.data);
          } catch {
            return;
          }
          onMessage(message);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { width: '100%' },
  scene: { flex: 1, width: '100%', backgroundColor: 'transparent' },
});

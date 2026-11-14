import { StyleSheet, View } from 'react-native';
import { WebView } from 'react-native-webview';

import type { HtmlSceneProps } from './HtmlScene.types';

export function HtmlScene({ html, height, title, onMessage }: HtmlSceneProps) {
  return (
    <View style={{ height }}>
      <WebView
        accessibilityLabel={title}
        source={{ html }}
        originWhitelist={['*']}
        onShouldStartLoadWithRequest={({ url }) => url === 'about:blank'}
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
  scene: { backgroundColor: 'transparent' },
});

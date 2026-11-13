import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppInput, type AppInputProps } from '@/components/ui';
import { iconSize, sizes } from '@/constants/theme';
import { useTheme } from '@/hooks/useTheme';

/** AppInput with a show / hide toggle. */
export function PasswordInput(props: Omit<AppInputProps, 'secureTextEntry' | 'onClear'>) {
  const { colors } = useTheme();
  const [visible, setVisible] = useState(false);
  return (
    <View>
      <AppInput icon="lock-closed-outline" autoCapitalize="none" autoCorrect={false} {...props} secureTextEntry={!visible} style={styles.input} />
      <Pressable
        onPress={() => setVisible((v) => !v)}
        hitSlop={8}
        accessibilityLabel={visible ? 'Hide password' : 'Show password'}
        style={[styles.toggle, { top: props.label ? 22 : 0 }]}
      >
        <Ionicons name={visible ? 'eye-off-outline' : 'eye-outline'} size={iconSize.md} color={colors.textMuted} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  input: { paddingRight: 32 },
  toggle: { position: 'absolute', right: 14, height: sizes.inputHeight, justifyContent: 'center' },
});

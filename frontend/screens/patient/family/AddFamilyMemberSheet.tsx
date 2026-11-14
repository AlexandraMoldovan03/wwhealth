import { useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';

import { AppButton, AppInput, AppText } from '@/design-system';
import { radius, sizes, spacing } from '@/design-system/theme';
import { useTheme } from '@/design-system/useTheme';
import { validateEmail } from '@/screens/auth/validation';

interface AddFamilyMemberSheetProps {
  visible: boolean;
  onClose: () => void;
  onAdd: (name: string, email: string, relationship: string) => void;
}

/** Bottom sheet with the fields needed for a family member. */
export function AddFamilyMemberSheet({ visible, onClose, onAdd }: AddFamilyMemberSheetProps) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [relationship, setRelationship] = useState('');
  const [nameError, setNameError] = useState<string | null>(null);
  const [emailError, setEmailError] = useState<string | null>(null);

  const reset = () => {
    setName('');
    setEmail('');
    setRelationship('');
    setNameError(null);
    setEmailError(null);
  };

  const close = () => {
    reset();
    onClose();
  };

  const submit = () => {
    const cleanName = name.trim();
    const nameProblem = cleanName ? null : t('family.nameRequired');
    const emailProblem = validateEmail(email) ?? null;
    setNameError(nameProblem);
    setEmailError(emailProblem);
    if (nameProblem || emailProblem) return;
    onAdd(cleanName, email.trim(), relationship.trim());
    reset();
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={close}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.root}
      >
        <Pressable
          accessible={false}
          style={[StyleSheet.absoluteFill, { backgroundColor: colors.overlay }]}
          onPress={close}
        />
        <View
          accessibilityViewIsModal
          style={[
            styles.sheet,
            {
              backgroundColor: colors.surface,
              paddingBottom: Math.max(insets.bottom, spacing.md),
            },
          ]}
        >
          <View style={styles.header}>
            <AppText variant="heading" accessibilityRole="header" style={styles.title}>
              {t('family.addTitle')}
            </AppText>
            <Pressable accessibilityRole="button" onPress={close} style={styles.close}>
              <AppText color="primary">{t('common.close')}</AppText>
            </Pressable>
          </View>

          <AppInput
            label={t('family.name')}
            placeholder={t('family.namePlaceholder')}
            icon="person-outline"
            value={name}
            onChangeText={(value) => {
              setName(value);
              if (nameError) setNameError(null);
            }}
            error={nameError ?? undefined}
            autoCapitalize="words"
            maxLength={60}
            onClear={() => setName('')}
            autoFocus
          />
          <AppInput
            label={t('family.email')}
            placeholder={t('family.emailPlaceholder')}
            icon="mail-outline"
            value={email}
            onChangeText={(value) => {
              setEmail(value);
              if (emailError) setEmailError(null);
            }}
            error={emailError ?? undefined}
            keyboardType="email-address"
            textContentType="emailAddress"
            autoCapitalize="none"
            autoCorrect={false}
            maxLength={120}
            onClear={() => setEmail('')}
          />
          <AppInput
            label={t('family.relationship')}
            placeholder={t('family.relationshipPlaceholder')}
            icon="people-outline"
            value={relationship}
            onChangeText={setRelationship}
            autoCapitalize="sentences"
            maxLength={40}
            onClear={() => setRelationship('')}
            onSubmitEditing={submit}
            returnKeyType="done"
          />

          <AppButton
            title={t('family.save')}
            icon="person-add-outline"
            fullWidth
            onPress={submit}
          />
          <AppButton
            title={t('common.cancel')}
            variant="ghost"
            fullWidth
            onPress={close}
          />
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: 'flex-end' },
  sheet: {
    width: '100%',
    maxWidth: sizes.maxContentWidth,
    alignSelf: 'center',
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    padding: spacing.lg,
    gap: spacing.md,
  },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  title: { flex: 1 },
  close: { minHeight: 44, justifyContent: 'center' },
});

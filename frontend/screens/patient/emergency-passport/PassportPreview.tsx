import { useRouter } from "expo-router";
import { StyleSheet, View } from "react-native";
import { useTranslation } from "react-i18next";

import { AppButton, AppText, ErrorState, LoadingState, SectionHeader } from "@/design-system";
import { spacing } from "@/design-system/theme";
import { useAsync } from "@/hooks/useAsync";
import { PrioritizedPassportView } from "@/screens/shared/components/PrioritizedPassportView";
import { api } from "@/services/backend";

const load = () => api.getEmergencyPassportPreview();

/** Patient: what a doctor would see, with sources, conflicts and "needs confirmation" — and where to correct it. */
export function PassportPreview() {
  const { t } = useTranslation();
  const router = useRouter();
  const preview = useAsync(load, { refetchOnFocus: true });

  if (preview.isLoading && !preview.data) return <LoadingState count={2} />;
  if (preview.error) return <ErrorState message={preview.error} onRetry={preview.reload} />;
  const passport = preview.data;
  if (!passport) return null;

  return (
    <View style={styles.section}>
      <SectionHeader title={t("passport.previewTitle")} />
      {(passport.unconfirmed > 0 || passport.conflicts > 0) && (
        <AppText color="warning">
          {t("passport.reviewHint", { unconfirmed: passport.unconfirmed, conflicts: passport.conflicts })}
        </AppText>
      )}
      <PrioritizedPassportView
        passport={passport}
        onOpenSource={(id) => router.push({ pathname: "/patient/document/[id]", params: { id } })}
      />
      <AppButton
        title={t("passport.correct")}
        icon="create-outline"
        variant="outline"
        fullWidth
        onPress={() => router.push("/patient/edit-profile")}
      />
    </View>
  );
}

const styles = StyleSheet.create({ section: { gap: spacing.sm } });

import { useEffect, useState } from "react";
import { AppState, StyleSheet, View } from "react-native";

import {
  AppButton,
  AppCard,
  AppText,
  ErrorState,
  ScreenContainer,
  SectionHeader,
  tapFeedback,
} from "@/design-system";
import { spacing } from "@/design-system/theme";
import { EmergencyAuditList } from "@/screens/shared/components/EmergencyAuditList";
import { PassportPreview } from "./PassportPreview";
import { EmergencyGuardiansSection } from "@/screens/patient/emergency-guardians";
import { EmergencyQrCard } from "./EmergencyQrCard";
import { useCountdown } from "./useCountdown";
import { useAsync } from "@/hooks/useAsync";
import { useTheme } from "@/design-system/useTheme";
import { api } from "@/services/backend";
import { useEmergencyToken } from "@/services/EmergencyTokenProvider";
import { getErrorMessage } from "@/utils/errors";
import { useTranslation } from "react-i18next";

/**
 * Emergency Medical Passport (patient).
 * POST /api/v1/emergency/tokens → random single-use token, valid 5 minutes, shown as a QR.
 * The QR holds no medical data; a DOCTOR account scans it and the backend validates it.
 */
export function EmergencyPassportScreen() {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const { token: code, isRestoring: restoringCode, saveToken, clearToken } = useEmergencyToken();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const audit = useAsync(api.getEmergencyAudit, { refetchOnFocus: true });
  const secondsLeft = useCountdown(code?.expiresAt ?? null);
  const active = !!code && secondsLeft > 0;

  useEffect(() => {
    if (!active || !code) return;
    let mounted = true;
    let checking = false;
    const checkStatus = async () => {
      if (checking) return;
      checking = true;
      try {
        const result = await api.getEmergencyTokenStatus(code.tokenId);
        if (mounted && result.status !== "active") {
          await clearToken();
        }
      } catch {
        // Keep displaying the locally saved QR while offline; retry on the next interval.
      } finally {
        checking = false;
      }
    };
    void checkStatus();
    const interval = setInterval(() => { void checkStatus(); }, 2_000);
    const appState = AppState.addEventListener("change", (state) => {
      if (state === "active") void checkStatus();
    });
    return () => { mounted = false; clearInterval(interval); appState.remove(); };
  }, [active, code, clearToken]);


  const act = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setBusy(false);
      void audit.reload();
    }
  };

  const generate = () =>
    act(async () => {
      const token = await api.createEmergencyToken();
      await saveToken(token);
      tapFeedback("success");
    });
  const revoke = () =>
    act(async () => {
      if (code)
        await api.revokeEmergencyToken(code.tokenId).catch(() => undefined); // already used/expired → just hide it
      await clearToken();
    });

  return (
    <ScreenContainer help="emergency" edges={["bottom"]}>
      <AppText color="textMuted">{t("emergency.intro")}</AppText>
      <AppCard style={styles.shared}>
        <AppText variant="label" color="textMuted">
          {t("emergency.sharedTitle")}
        </AppText>
        <AppText>{t("emergency.sharedListPriority")}</AppText>
      </AppCard>

      {active ? (
        <EmergencyQrCard code={code} secondsLeft={secondsLeft}>
          <AppButton
            title={t("emergency.revoke")}
            icon="close-circle-outline"
            variant="outline"
            fullWidth
            loading={busy}
            onPress={revoke}
          />
        </EmergencyQrCard>
      ) : (
        <View style={styles.actions}>
          {restoringCode && <AppText color="textMuted" align="center">{t("common.loading")}</AppText>}
          {code && (
            <AppText color="textMuted" align="center">
              {t("emergency.expired")}
            </AppText>
          )}
          <AppButton
            title={code ? t("emergency.generateNew") : t("emergency.generate")}
            icon="qr-code-outline"
            variant="danger"
            size="lg"
            fullWidth
            loading={busy || restoringCode}
            disabled={restoringCode}
            onPress={generate}
          />
        </View>
      )}
      {error && <ErrorState message={error} />}

      <PassportPreview />

      <EmergencyGuardiansSection />

      <View style={styles.section}>
        <SectionHeader title={t("emergency.audit.title")} />
        {audit.error ? (
          <ErrorState message={audit.error} onRetry={audit.reload} />
        ) : (
          <EmergencyAuditList events={audit.data ?? []} />
        )}
      </View>
      <View style={[styles.hint, { borderColor: colors.border }]}>
        <AppText variant="caption" color="textMuted">
          {t("emergency.privacyNote")}
        </AppText>
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  shared: { gap: spacing.xs },
  actions: { gap: spacing.sm },
  section: { gap: spacing.sm },
  hint: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: spacing.md },
});

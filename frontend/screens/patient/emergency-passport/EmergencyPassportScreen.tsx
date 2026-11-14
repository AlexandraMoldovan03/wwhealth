import { useState } from "react";
import { StyleSheet, View } from "react-native";
import QRCode from "react-native-qrcode-svg";
import Animated from "react-native-reanimated";

import {
  AppButton,
  AppCard,
  AppText,
  ErrorState,
  ScreenContainer,
  SectionHeader,
  popIn,
  tapFeedback,
} from "@/design-system";
import { radius, spacing } from "@/design-system/theme";
import { EmergencyAuditList } from "@/screens/shared/components/EmergencyAuditList";
import {
  formatCountdown,
  useCountdown,
} from "./useCountdown";
import { useAsync } from "@/hooks/useAsync";
import { useTheme } from "@/design-system/useTheme";
import { api } from "@/services/backend";
import type { EmergencyTokenResponse } from "@/types";
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
  const [code, setCode] = useState<EmergencyTokenResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const audit = useAsync(api.getEmergencyAudit, { refetchOnFocus: true });
  const secondsLeft = useCountdown(code?.expiresAt ?? null);
  const active = !!code && secondsLeft > 0;


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
      setCode(await api.createEmergencyToken());
      tapFeedback("success");
    });
  const revoke = () =>
    act(async () => {
      if (code)
        await api.revokeEmergencyToken(code.tokenId).catch(() => undefined); // already used/expired → just hide it
      setCode(null);
    });

  return (
    <ScreenContainer edges={["bottom"]}>
      <AppText color="textMuted">{t("emergency.intro")}</AppText>
      <AppCard style={styles.shared}>
        <AppText variant="label" color="textMuted">
          {t("emergency.sharedTitle")}
        </AppText>
        <AppText>{t("emergency.sharedList")}</AppText>
      </AppCard>

      {active ? (
        <Animated.View key={code.tokenId} entering={popIn}>
          <AppCard style={styles.qrCard}>
            {/* White quiet zone so scanners work in dark mode too. */}
            <View style={styles.qrBox}>
              <QRCode value={code.qrPayload} size={220} ecl="M" />
            </View>
            <AppText
              variant="display"
              color={secondsLeft <= 60 ? "danger" : "text"}
              accessibilityLabel={t("emergency.timeLeft", {
                time: formatCountdown(secondsLeft),
              })}
            >
              {formatCountdown(secondsLeft)}
            </AppText>
            <View
              style={[styles.track, { backgroundColor: colors.surfaceAlt }]}
            >
              <View
                style={[
                  styles.bar,
                  {
                    width: `${Math.min(100, (secondsLeft / code.ttlSeconds) * 100)}%`,
                    backgroundColor:
                      secondsLeft <= 60 ? colors.danger : colors.primary,
                  },
                ]}
              />
            </View>
            <AppText variant="caption" color="textMuted" align="center">
              {t("emergency.singleUse")}
            </AppText>
            <AppButton
              title={t("emergency.revoke")}
              icon="close-circle-outline"
              variant="outline"
              fullWidth
              loading={busy}
              onPress={revoke}
            />
          </AppCard>
        </Animated.View>
      ) : (
        <View style={styles.actions}>
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
            loading={busy}
            onPress={generate}
          />
        </View>
      )}
      {error && <ErrorState message={error} />}

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
  qrCard: { alignItems: "center", gap: spacing.md },
  qrBox: {
    padding: spacing.md,
    backgroundColor: "#FFFFFF",
    borderRadius: radius.lg,
  },
  track: {
    height: 6,
    alignSelf: "stretch",
    borderRadius: radius.pill,
    overflow: "hidden",
  },
  bar: { height: "100%", borderRadius: radius.pill },
  actions: { gap: spacing.sm },
  section: { gap: spacing.sm },
  hint: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: spacing.md },
});

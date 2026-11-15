import type { ReactNode } from "react";
import { StyleSheet, View } from "react-native";
import QRCode from "react-native-qrcode-svg";
import Animated from "react-native-reanimated";
import { useTranslation } from "react-i18next";

import { AppCard, AppText, fadeIn } from "@/design-system";
import { radius, spacing } from "@/design-system/theme";
import { useTheme } from "@/design-system/useTheme";
import type { EmergencyTokenResponse } from "@/types";

import { formatCountdown } from "./useCountdown";

/** The 5-minute emergency QR with its countdown. Used by the patient and by an emergency guardian. */
export function EmergencyQrCard({
  code,
  secondsLeft,
  children,
}: {
  code: EmergencyTokenResponse;
  secondsLeft: number;
  /** Action under the QR (revoke / hide). */
  children?: ReactNode;
}) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  return (
    <Animated.View key={code.tokenId} entering={fadeIn()}>
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
        <View style={[styles.track, { backgroundColor: colors.surfaceAlt }]}>
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
        {children}
      </AppCard>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
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
});

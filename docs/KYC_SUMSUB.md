# Optional identity verification (Sumsub): research and proposal

**Status: not implemented.** This waits until availability, cost and data-processing terms are confirmed. No
code, keys or tables were added. Facts marked *(to confirm)* come from third-party sources or are not stated in
Sumsub's documentation.

## 1. What Sumsub offers (relevant to WWHealth)

| Need | What we found | Source |
|---|---|---|
| ID document check | Document capture + OCR + authenticity checks through Mobile SDK / WebSDK | docs.sumsub.com – How ID verification works |
| Selfie + liveness | Part of the "applicant level" set up in the dashboard (e.g. ID + selfie + liveness) | docs.sumsub.com – MobileSDK |
| Romanian identity card | Sumsub covers 14,000+ document types; we found **no explicit confirmation for the Romanian identity card** (the NFC list shows only the Romanian passport) *(to confirm in the supported-documents list / with Sales)* | docs.sumsub.com – Supported documents, NFC-supported documents |
| Expo | Official package `@sumsub/react-native-mobilesdk-module` (native). **There is no official Expo config plugin**; the "Expo Compatibility" issue is still open. It does not work in Expo Go: it needs a Development Build + our own config plugin (Maven repo + Android Gradle settings, iOS camera / microphone permissions) | docs.sumsub.com – React Native Module; GitHub issues |
| Alternative without native code | WebSDK opened in `react-native-webview` (already installed) or the system browser, with a link / token from our backend; works in Expo Go *(camera access in the WebView to be tested on iOS / Android)* | docs.sumsub.com – WebSDK |
| Sandbox | Sandbox mode with separate keys and simulated results; access through the trial / self-service flow *(some users report that Sales hands out credentials)* | docs.sumsub.com – self-service |
| SDK token | The backend calls `POST /resources/accessTokens/sdk` (`userId`, `levelName`, `ttlInSecs`), authenticated with App Token + HMAC-SHA256 signature (`X-App-Token`, `X-App-Access-Ts`, `X-App-Access-Sig`). The app receives **only** the short-lived token | docs.sumsub.com – Generate access token, Authentication |
| Webhook | Events such as `applicantReviewed` (`reviewResult.reviewAnswer` = GREEN / RED). Header `X-Payload-Digest` = HMAC over the **raw body** with the webhook secret; algorithm in `X-Payload-Digest-Alg` (HMAC_SHA256_HEX by default; SHA1 deprecated) | docs.sumsub.com – Webhook manager |
| Cost | Public list prices: Basic ≈ $1.35 / verification (minimum $149 / month), Compliance ≈ $1.85 (minimum $299 / month), Enterprise on quote *(check the live page / offer; trial reportedly 14 days / 50 checks, unconfirmed)* | sumsub.com/pricing |
| GDPR | Sumsub = processor, WWHealth = controller; the client sets the retention periods. A DPA must be requested (we did not find a public one), plus confirmation that data is stored in the EU | sumsub.com – Privacy notice (service) |

## 2. Proposed architecture (when we decide)

1. **App**: the "Verify your identity" button (Settings → Security). The backend returns an SDK token. The app opens the Sumsub SDK (Development Build) or the WebSDK. Photos of the identity card and the selfie go **directly** to Sumsub, never through our backend and never into Supabase Storage.
2. **Backend** (`/api/v1/identity/token`): checks the Supabase JWT, uses `userId = auth.uid()` as `externalUserId` (no name, CNP or email), asks Sumsub for a token valid for 10 minutes, and rate-limits it (e.g. 5 / hour). `SUMSUB_APP_TOKEN`, `SUMSUB_SECRET_KEY` and `SUMSUB_WEBHOOK_SECRET` live only in the server `.env`, separately for sandbox and production.
3. **Webhook** (`/api/v1/identity/webhook`, without a JWT):
   1. Read the raw body and check `X-Payload-Digest` with `hmac.compare_digest`.
   2. Accept only SHA256 / SHA512; refuse anything else.
   3. Refuse the request if the signature is missing or invalid.
   4. Make it idempotent: keep a unique event / correlation id.
   5. Log nothing from the payload.
   6. Write to the database only through the server key or a dedicated `security definer` function.
4. **Minimal storage**: a new table `identity_verifications`, with RLS so only the owner can read it:

   | Column | Content |
   |---|---|
   | `user_id` | Supabase user id |
   | `provider` | `sumsub` |
   | `applicant_id` | Sumsub applicant id |
   | `level` | verification level |
   | `status` | pending / approved / rejected / retry |
   | `reject_labels` | short codes only |
   | `reviewed_at` | review time |
   | `environment` | sandbox / production |

   No images, no document number, no CNP, no date of birth taken from the identity card. Matching against the profile, if needed, is done at Sumsub, and only a match yes / no is kept.
5. **Delete the account** → delete the applicant at Sumsub (their API) + the local row. Agree the retention period at Sumsub in the DPA.
6. **Effect in the app**: an "Identity verified" badge only. No access rights depend on it, and it **never changes the role**.

## 3. Licence to practise (doctors) – separate from KYC

* An identity check proves **who** the person is, not that they are **allowed to practise**. The doctor role stays as today: set only by an administrator in `profiles.role`, never automatically after a Sumsub result.
* Proposal: a table `doctor_credentials`:

  | Column | Content |
  |---|---|
  | `user_id` | Supabase user id |
  | `cmr_code` | Colegiul Medicilor din România registration code |
  | `county_college` | county college |
  | `specialty` | specialty |
  | `status` | submitted / verified / rejected / suspended / expired |
  | `evidence_ref` | reference only, no document stored |
  | `checked_by` | administrator |
  | `checked_at` | check time |
  | `valid_until` | expiry, for annual re-checks |

  RLS: the doctor reads their own row, and only the administrator writes.
* Flow:
  1. The doctor enters the CMR code (+ optionally passes KYC).
  2. An administrator checks it against the public CMR register (or an official API, if one exists) and the identity match.
  3. The administrator approves.
  4. Only then does an admin function set `role = doctor`.
  5. Re-check yearly or when the professional insurance expires; when `status` ≠ verified, doctor access is withdrawn.
* Recommended order: KYC (optional) → CMR check (required for doctors) → manual approval by the administrator.

## 4. Steps before implementation

1. Sandbox account + confirmation of the Romanian identity card at the chosen level (ID + selfie + liveness).
2. Written offer (price per check, monthly minimum, trial), DPA, EU data location, sub-processors, retention period.
3. DPIA (biometric data = special category, art. 9 GDPR), explicit consent in the app, privacy policy update.
4. Choose the client integration: WebSDK in a WebView (Expo Go, quick) or the native module (Development Build + our own config plugin).
5. Only after that: migration (applied first on staging), token + webhook endpoints with tests (valid / invalid signature, replay, unknown events), RO/EN screen.

Sources: [MobileSDK](https://docs.sumsub.com/docs/mobile-sdk), [React Native Module](https://docs.sumsub.com/docs/react-native-module), [Expo forum](https://forums.expo.dev/t/sumsub-sdk-integration-in-expo-react-native/53568), [Generate access token](https://docs.sumsub.com/docs/generate-access-token), [Authentication](https://docs.sumsub.com/reference/authentication), [Webhook manager](https://docs.sumsub.com/docs/webhook-manager), [Hookdeck – Sumsub webhooks](https://hookdeck.com/webhooks/platforms/guide-to-sumsub-webhooks-features-and-best-practices), [Pricing](https://sumsub.com/pricing/), [Self-service](https://docs.sumsub.com/docs/self-service), [Supported documents](https://docs.sumsub.com/docs/supported-documents), [NFC documents](https://docs.sumsub.com/docs/nfc-supported-documents), [Privacy notice (service)](https://sumsub.com/privacy-notice-service).

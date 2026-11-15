# WWHealth – Security

Status of branch `security/hardening`. "Tested" means automated tests that pass. Nothing here was verified on a
physical phone unless it says so.

## 1. What the app enforces

| Layer | Control |
|---|---|
| Session storage | Supabase session in the Keychain (iOS) / Keystore (Android) through `expo-secure-store`, split into chunks of 1,800 characters (`AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY`). The old AsyncStorage copy is migrated once and then deleted. If the Keychain fails, the session is kept in memory only, never in plaintext. Web uses localStorage, so it is for development only. |
| Sign-out | Removes the session, the cached emergency QR, voice-intake drafts, the care-summary draft, scheduled medication reminders and the app-lock setting. "Sign out on all devices" revokes every refresh token (`scope: global`). |
| Invalid session | A backend 401 triggers one refresh; if that fails, the user is signed out and sent to Login. Supabase `SIGNED_OUT` does the same. |
| App lock (optional) | Face ID / fingerprint, with the device passcode as fallback, when the app reopens (restored session, or ≥30 s in the background). Without biometrics or a passcode, the only way in is signing in again. The OS does the matching: no biometric data or face image is ever read or stored. A local unlock is **not** a server sign-in. |
| Sensitive actions | Export (FHIR / PDF / CSV / ZIP), sharing with a doctor, adding an emergency contact, turning off MFA and changing the password all ask for Face ID / passcode first (if the lock is on). The **server** also checks them (see below). |
| Never gated | Emergency passport, generating the emergency QR (patient or emergency contact), the doctor scanning a QR, and revoking access (doctor grant, emergency contact). |
| MFA (TOTP) | Settings → Security: enrol by QR or setup key, verify, status, turn off (needs an aal2 session + confirmation). At login, an MFA account stays on the code screen until the code is accepted; the root and tab guards load no data while the session is aal1. |
| Password change | The current password is checked with a separate sign-in that is revoked straight away (the current aal2 session is untouched), then `updateUser`. Accounts with Google only do not see it. Changing the email is not offered in the app. |

## 2. What the backend enforces

* **JWT**: signature via JWKS (ES256 / RS256 / EdDSA), issuer, audience `authenticated`, expiry. The role always comes from `public.profiles`, never from the token metadata.
* **MFA gate** (`get_current_user`): if the token is not aal2 and the account has a verified factor, the answer is `403` with header `X-WWHealth-Step-Up: mfa`. Factor status is read from Supabase Auth with the user's own token and cached for 60 s. If Supabase Auth does not answer, the request is refused (fails closed, 503).
* **Recent sign-in** (`get_sensitive_user` / `get_sensitive_doctor`): exports (patient and doctor), new doctor grants and emergency-contact invites need a real sign-in (newest `amr` timestamp) no older than `SENSITIVE_REAUTH_MAX_AGE_MINUTES` (default 1440 = 24 h; `0` turns the check off). Otherwise the answer is `403` with `X-WWHealth-Step-Up: reauth`. A token refresh does not reset the clock, and a Face ID unlock never reaches the server.
* **Doctor MFA policy**: `DOCTOR_MFA_REQUIRED=false` by default. When `true`, every doctor endpoint (QR scan included) needs aal2, otherwise `403` with `mfa-enroll`. Turn it on only after the flow has been tested on real test accounts and the recovery procedure (section 5) is in place.
* **Rate limits** (in memory, per process):
  * QR redeem: 10/min per doctor, plus a 15-minute lock after 8 rejected codes (not found / used / expired / revoked).
  * QR creation: 6/min.
  * Emergency-contact invites: 10/h.
  * Doctor grants: 20/h.
  * Exports: 30/h.

  Sign-in, sign-up and MFA verification are rate-limited by Supabase Auth itself. With several workers or servers, move the counters to Redis.
* **Status endpoint** `GET /api/v1/security/status`: returns `aal`, `mfaEnrolled`, `mfaSatisfied`, `recentAuth` and the active policies. It contains no secrets and also answers an aal1 MFA session, so the app knows to ask for the code.
* **Headers**: `X-Content-Type-Options`, `Referrer-Policy`, `X-Frame-Options` on every response, and HSTS when `APP_ENV=production`. The CORS layer exposes `X-WWHealth-Step-Up`. A warning is logged if `CORS_ORIGINS=*` in production.

## 3. Emergency QR – audit (unchanged behaviour)

| Property | Implementation | Test |
|---|---|---|
| 5 minutes | `expires_at` set in Postgres; check constraint ≤ 5 min | `test_emergency.py` |
| Single use | Atomic consume in `redeem_emergency_token`; replay → 409 | `test_qr_replay_is_refused_and_counted` |
| Hash only | The app gets the random token (≥ 256 bits); the database stores SHA-256 | `test_token_is_random_short_lived_and_carries_no_data` |
| Doctor role | `get_current_doctor` + role check in the SQL function | `test_supabase_redeem_requires_doctor_role` |
| Emergency contacts | Accepted link only; revoking cancels their unused QR codes | `test_emergency_guardians.py` |
| Logging | created / viewed / denied / revoked in `emergency_access_log` | `test_audit_log_records_every_access` |
| Brute force | Per-doctor counter of rejected codes → 429 for 15 min | `test_guessing_codes_locks_the_doctor_out` |
| No login | The QR token is not a JWT: as a Bearer token it gets 401 | `test_qr_token_is_not_a_login` |
| No data in the QR | `wwhealth://emergency/<random>`: no name, CNP or medical data | `test_qr_payload_carries_no_identity_or_medical_data` |

## 4. Database (Supabase)

* RLS is on for all 27 `public` tables. The backend calls PostgREST with the user's JWT, so RLS applies to it too.
* All 44 `security definer` functions set `search_path` and filter on `auth.uid()`.
* `medical-documents` is a private bucket; every file a doctor opens is re-checked against the grant and logged.
* **Not applied**: `supabase/migrations/20261201000000_mfa_aal2_enforcement.sql` adds a restrictive aal2 policy on every RLS table, for accounts that have MFA. It closes direct PostgREST access with an aal1 token. Test it on a staging project before production. The security-definer RPCs bypass RLS, so a follow-up should make them call `public.mfa_satisfied()`.

## 5. Manual Supabase configuration

1. **Authentication → Multi-Factor**: enable **TOTP** (enrol + verify). Phone / WebAuthn are not needed.
2. Optional: **Authentication → Providers → Email → Secure password change** (asks for a recent sign-in). The app already handles `reauthentication_needed`.
3. Keep the JWT expiry at 1 h (the default); refresh tokens rotate.
4. **MFA recovery procedure** (TOTP has no self-service recovery codes in this project yet; `mfa.recoveryCodes` is experimental in supabase-js):
   1. The user contacts the administrator.
   2. The administrator verifies identity through a channel other than the app.
   3. In Supabase Dashboard → Authentication → Users → the user → *Factors*, the administrator deletes the TOTP factor.
   4. The user signs in with the password and enrols again.
   5. Record each reset.
5. Before `DOCTOR_MFA_REQUIRED=true`:
   1. Test enrol / login / wrong code / expired code / disable on two test accounts (one patient, one doctor) with a real authenticator app.
   2. Make sure the recovery procedure above works.
6. Apply the aal2 RLS migration only on staging first, with approval.

## 6. Expo Go vs Development Build

| Feature | Expo Go | Development Build |
|---|---|---|
| Secure session storage (SecureStore) | yes | yes |
| Fingerprint / face unlock (Android) | yes | yes |
| Face ID (iOS) | **no** – falls back to the passcode (no `NSFaceIDUsageDescription` in Expo Go) | yes (plugin `expo-local-authentication` with `faceIDPermission` in `app.json`) |
| MFA TOTP, re-authentication, step-up | yes | yes |
| Local reminder notifications | partly (Expo Go limits) | yes |

Face ID test: `npx expo run:ios --device` or an EAS development build, then turn on Settings → Security → Lock.

## 7. Identity verification (KYC) – later, not implemented

* **Patient identity** (is this person who they say?) and **doctor licence to practise** (is this doctor registered with the Colegiul Medicilor?) are two separate checks with separate data and flags.
* Proposed flow with Sumsub or a similar service:
  1. The SDK in the app captures the ID document and a liveness check directly to the provider; WWHealth never receives the images.
  2. A provider webhook goes to the backend (signature checked) and stores only `identity_verifications(user_id, provider, applicant_id, status, level, verified_at, expires_at)`.
  3. Store no document number, no CNP and no images.
  4. Deleting the account also deletes the applicant at the provider (their API).
* **Doctors**: a separate table, e.g. `doctor_credentials(user_id, cmr_code, specialty, status, checked_by, checked_at)`, checked against the public CMR register by an administrator (or automatically, if an official API exists). Only `status = verified` keeps `profiles.role = doctor`.
* Legal: identity data is personal data, so a DPA with the provider, explicit consent, a retention period and a DPIA are needed before going live.

## 8. Deployment checklist (Vultr, not changed here)

* TLS at the reverse proxy (Caddy / Nginx with Let's Encrypt). The API is reachable only over HTTPS; uvicorn listens on 127.0.0.1.
* `APP_ENV=production` (turns on HSTS, turns off demo documents). Set `CORS_ORIGINS` to the exact web origin, or leave it empty if there is only the mobile app.
* Secrets only in the server `.env` (permissions 600) or a secret manager: `SUPABASE_SECRET_KEY`, `GEMINI_API_KEY`, `ELEVENLABS_API_KEY`. Never in the app or in git.
* One uvicorn worker (in-memory rate limits), or Redis before scaling out.
* Logs: the backend logs no tokens, prompts or medical data. Keep the proxy access log without `Authorization` headers and without query strings that contain data.
* Firewall: only 443 (and 22 restricted). Automatic OS updates; `pip-audit` / `npm audit` before each release.

## 9. Known limitations

* Biometrics, Face ID, the lock screen and MFA have **not** been verified on a real device in this branch: only typecheck, lint, Android bundle export and unit / integration tests.
* Rate limits reset when the process restarts and are per process.
* The aal2 RLS migration is written but not applied or tested on Postgres with Supabase Auth.
* No self-service MFA recovery codes; recovery goes through the administrator.
* Web keeps the session in localStorage.

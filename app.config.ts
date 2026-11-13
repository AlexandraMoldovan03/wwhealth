import type { ConfigContext, ExpoConfig } from 'expo/config';

/**
 * Dynamic config: Expo merges app.json into `config`, and we only add the
 * Auth0 config plugin here so its domain always matches `.env`.
 *
 * The Auth0 domain is public (it is also baked into the native intent filter),
 * but keeping it in one place avoids the classic callback-URL mismatch.
 */
const auth0Domain = (process.env.EXPO_PUBLIC_AUTH0_DOMAIN ?? '')
  .trim()
  .replace(/^["']|["']$/g, '')
  .replace(/^https?:\/\//, '')
  .replace(/\/+$/, '');

/** Must match `AUTH0.customScheme` in src/constants/config.ts. */
const AUTH0_CUSTOM_SCHEME = 'wwhealth';

const auth0Plugin: [string, { domain: string; customScheme: string }] = [
  'react-native-auth0',
  { domain: auth0Domain, customScheme: AUTH0_CUSTOM_SCHEME },
];

export default ({ config }: ConfigContext): ExpoConfig => ({
  // app.json provides the required fields (name, slug, …).
  ...(config as ExpoConfig),
  plugins: [
    ...(config.plugins ?? []).filter((plugin) =>
      Array.isArray(plugin) ? plugin[0] !== 'react-native-auth0' : plugin !== 'react-native-auth0',
    ),
    auth0Plugin,
  ],
});

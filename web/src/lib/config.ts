/** Build-time settings, from CDK outputs copied into Amplify Hosting environment variables. */
export const config = {
  apiUrl: (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, "") ?? "",
  userPoolId: (import.meta.env.VITE_USER_POOL_ID as string | undefined) ?? "",
  userPoolClientId: (import.meta.env.VITE_USER_POOL_CLIENT_ID as string | undefined) ?? "",
  vapidPublicKey: (import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined) ?? "",
  /** Show languages whose strings are not yet native-reviewed, marked as drafts. Never on in production. */
  showDraftLanguages: import.meta.env.DEV || import.meta.env.VITE_SHOW_DRAFT_LANGUAGES === "true",
};

/** Without an API, the demo runs a labelled in-browser simulation so the UI can be developed offline. */
export const isSimulated = !config.apiUrl;

import { Amplify } from "aws-amplify";
import {
  confirmResetPassword,
  confirmSignUp,
  fetchAuthSession,
  getCurrentUser,
  resendSignUpCode,
  resetPassword,
  signIn,
  signOut as amplifySignOut,
  signUp,
} from "aws-amplify/auth";
import { mockApiEnabled, setTokenProvider } from "./api";
import { config } from "./config";

/** Family members sign in with Cognito. Parents never do: their phone is paired with a one-time code. */
export const authConfigured = Boolean(config.userPoolId && config.userPoolClientId);

if (authConfigured) {
  Amplify.configure({
    Auth: {
      Cognito: {
        userPoolId: config.userPoolId,
        userPoolClientId: config.userPoolClientId,
        loginWith: { email: true },
        signUpVerificationMethod: "code",
      },
    },
  });
}

// API Gateway's JWT authorizer checks the access token's client_id.
setTokenProvider("family", async () => {
  if (!authConfigured) return null;
  try {
    return (await fetchAuthSession()).tokens?.accessToken?.toString() ?? null;
  } catch {
    return null;
  }
});

/** In the local preview (no AWS), sign-in is simulated so every screen can be tried. */
async function mock() {
  if (!import.meta.env.DEV) throw new Error("Not available in production");
  return import("./mock-api");
}

export async function isSignedIn(): Promise<boolean> {
  if (mockApiEnabled) return true;
  if (!authConfigured) return false;
  try {
    await getCurrentUser();
    return true;
  } catch {
    return false;
  }
}

export type SignInResult = "done" | "confirm";

/**
 * The user pool matches email addresses case-sensitively, and that cannot be changed on an existing
 * pool. A phone that capitalised "Arjun@gmail.com" at sign-up used to lock him out the day he typed
 * "arjun@gmail.com" to sign back in — "user not found" for his own address. Every address is stored
 * and looked up in lower case from now on.
 */
export const normaliseEmail = (email: string) => email.trim().toLowerCase();

export async function signInWithEmail(email: string, password: string): Promise<SignInResult> {
  if (mockApiEnabled) {
    (await mock()).mockSignIn();
    return "done";
  }
  const lower = normaliseEmail(email);
  let username = lower;
  let result;
  try {
    result = await signIn({ username, password });
  } catch (error) {
    // Accounts made before addresses were lower-cased may be stored exactly as they were typed.
    // Wrong passwords and unknown users look the same from here, so try that spelling once.
    const typed = email.trim();
    if ((error as { name?: string }).name !== "NotAuthorizedException" || typed === lower) throw error;
    username = typed;
    result = await signIn({ username, password });
  }
  if (result.isSignedIn) return "done";
  if (result.nextStep.signInStep === "CONFIRM_SIGN_UP") {
    await resendSignUpCode({ username });
    return "confirm";
  }
  throw new Error("This sign-in needs a step the app does not support yet.");
}

export async function createAccount(email: string, password: string): Promise<SignInResult> {
  if (mockApiEnabled) return "confirm";
  const address = normaliseEmail(email);
  const result = await signUp({ username: address, password, options: { userAttributes: { email: address } } });
  return result.isSignUpComplete ? "done" : "confirm";
}

export async function confirmAccount(email: string, password: string, code: string): Promise<void> {
  if (mockApiEnabled) {
    (await mock()).mockSignIn();
    return;
  }
  email = normaliseEmail(email);
  await confirmSignUp({ username: email, confirmationCode: code.trim() });
  await signIn({ username: email, password });
}

export async function signOut(): Promise<void> {
  if (mockApiEnabled) {
    (await mock()).mockSignOut();
    return;
  }
  await amplifySignOut();
}

/**
 * Step one of a forgotten password: email a code. The app client hides whether an account exists
 * (preventUserExistenceErrors), so this succeeds for any address and the screen says "if an account
 * uses this email" rather than confirming who has signed up.
 */
export async function requestPasswordReset(email: string): Promise<void> {
  if (mockApiEnabled) return;
  await resetPassword({ username: normaliseEmail(email) });
}

/** Step two: the emailed code and a new password, then straight in rather than back to a form. */
export async function finishPasswordReset(email: string, code: string, newPassword: string): Promise<void> {
  if (mockApiEnabled) {
    (await mock()).mockSignIn();
    return;
  }
  await confirmResetPassword({ username: normaliseEmail(email), confirmationCode: code.trim(), newPassword });
  await signIn({ username: normaliseEmail(email), password: newPassword });
}

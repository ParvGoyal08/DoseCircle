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

export async function signInWithEmail(email: string, password: string): Promise<SignInResult> {
  if (mockApiEnabled) {
    (await mock()).mockSignIn();
    return "done";
  }
  const result = await signIn({ username: email, password });
  if (result.isSignedIn) return "done";
  if (result.nextStep.signInStep === "CONFIRM_SIGN_UP") {
    await resendSignUpCode({ username: email });
    return "confirm";
  }
  throw new Error("This sign-in needs a step the app does not support yet.");
}

export async function createAccount(email: string, password: string): Promise<SignInResult> {
  if (mockApiEnabled) return "confirm";
  const result = await signUp({ username: email, password, options: { userAttributes: { email } } });
  return result.isSignUpComplete ? "done" : "confirm";
}

export async function confirmAccount(email: string, password: string, code: string): Promise<void> {
  if (mockApiEnabled) {
    (await mock()).mockSignIn();
    return;
  }
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

export { confirmResetPassword, resetPassword };

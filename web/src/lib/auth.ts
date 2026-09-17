import { Amplify } from "aws-amplify";
import {
  confirmResetPassword,
  confirmSignUp,
  fetchAuthSession,
  getCurrentUser,
  resendSignUpCode,
  resetPassword,
  signIn,
  signOut,
  signUp,
} from "aws-amplify/auth";
import { setTokenProvider } from "./api";
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

export async function isSignedIn(): Promise<boolean> {
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
  const result = await signIn({ username: email, password });
  if (result.isSignedIn) return "done";
  if (result.nextStep.signInStep === "CONFIRM_SIGN_UP") {
    await resendSignUpCode({ username: email });
    return "confirm";
  }
  throw new Error("This sign-in needs a step the app does not support yet.");
}

export async function createAccount(email: string, password: string): Promise<SignInResult> {
  const result = await signUp({ username: email, password, options: { userAttributes: { email } } });
  return result.isSignUpComplete ? "done" : "confirm";
}

export async function confirmAccount(email: string, password: string, code: string): Promise<void> {
  await confirmSignUp({ username: email, confirmationCode: code.trim() });
  await signIn({ username: email, password });
}

export { confirmResetPassword, resetPassword, signOut };

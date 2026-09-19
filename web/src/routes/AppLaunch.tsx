import { Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { Navigate } from "react-router";
import { isSignedIn } from "../lib/auth";
import { pairedDevice } from "../lib/device";

/**
 * /app — where the installed app opens (the manifest's start_url).
 *
 * The installed app used to open on the landing page, which has no idea who is holding the phone.
 * To a parent whose phone was paired, or a family member still signed in, that looked exactly like
 * being logged out. So the app opens here and goes straight to the right place: a paired phone to
 * today's medicines, a signed-in family member to their home, anyone else to sign in.
 */
export function AppLaunch() {
  const [to, setTo] = useState<string | null>(() => (pairedDevice() ? "/parent" : null));

  useEffect(() => {
    if (to) return;
    let live = true;
    void isSignedIn().then((signedIn) => live && setTo(signedIn ? "/home" : "/signin"));
    return () => {
      live = false;
    };
  }, [to]);

  if (to) return <Navigate to={to} replace />;
  return (
    <div className="grid min-h-dvh place-items-center bg-paper">
      <Loader2 aria-hidden className="size-8 animate-spin text-muted" />
    </div>
  );
}

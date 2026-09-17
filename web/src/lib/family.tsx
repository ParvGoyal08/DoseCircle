import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { Navigate, useLocation } from "react-router";
import { api } from "./api";
import { authConfigured, isSignedIn } from "./auth";
import type { Me } from "./types";

type FamilyState =
  | { status: "loading" }
  | { status: "signedOut" }
  | { status: "noFamily" }
  | { status: "ready"; me: NonNullable<Me["member"]> };

const FamilyContext = createContext<{ state: FamilyState; reload: () => Promise<void> }>({ state: { status: "loading" }, reload: async () => {} });

export function FamilyProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<FamilyState>({ status: authConfigured ? "loading" : "signedOut" });

  const reload = useCallback(async () => {
    if (!(await isSignedIn())) return setState({ status: "signedOut" });
    try {
      const me = await api<Me>("/me", { auth: "family" });
      setState(me.member ? { status: "ready", me: me.member } : { status: "noFamily" });
    } catch {
      setState({ status: "signedOut" });
    }
  }, []);

  useEffect(() => {
    if (authConfigured) void reload();
  }, [reload]);

  return <FamilyContext.Provider value={{ state, reload }}>{children}</FamilyContext.Provider>;
}

export function useFamily() {
  return useContext(FamilyContext);
}

/** Family pages need a signed-in member of a family; everyone else is sent to sign in or set up. */
export function RequireFamily({ children }: { children: (me: NonNullable<Me["member"]>) => ReactNode }) {
  const { state } = useFamily();
  const location = useLocation();
  if (state.status === "loading") return <div className="min-h-dvh bg-paper" aria-busy="true" />;
  if (state.status === "signedOut") return <Navigate to={`/signin?next=${encodeURIComponent(location.pathname + location.hash)}`} replace />;
  if (state.status === "noFamily") return <Navigate to="/onboarding" replace />;
  return <>{children(state.me)}</>;
}

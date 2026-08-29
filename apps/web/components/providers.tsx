"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";

import { supabase } from "@/lib/supabase";
import type { MeInfo } from "@/lib/api";
import { api } from "@/lib/api";

interface AuthCtx {
  session: Session | null;
  me: MeInfo | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<string | null>;
  signUp: (email: string, password: string) => Promise<string | null>;
  signOut: () => Promise<void>;
}

const Ctx = createContext<AuthCtx>({
  session: null,
  me: null,
  loading: true,
  signIn: async () => null,
  signUp: async () => null,
  signOut: async () => {},
});

export const useAuth = () => useContext(Ctx);

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () => new QueryClient({ defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } } }),
  );
  const [session, setSession] = useState<Session | null>(null);
  const [me, setMe] = useState<MeInfo | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    console.log("[auth] effect start");
    supabase.auth.getSession().then(({ data }) => {
      console.log("[auth] getSession resolved:", Boolean(data.session));
      setSession(data.session);
      setLoading(false);
    }).catch((e) => console.log("[auth] getSession err:", String(e).slice(0, 100)));
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!session) {
      setMe(null);
      return;
    }
    api<MeInfo>("/me")
      .then(setMe)
      .catch(() => setMe(null));
  }, [session]);

  const value = useMemo<AuthCtx>(
    () => ({
      session,
      me,
      loading,
      async signIn(email, password) {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        return error?.message ?? null;
      },
      async signUp(email, password) {
        const { error } = await supabase.auth.signUp({ email, password });
        return error?.message ?? null;
      },
      async signOut() {
        await supabase.auth.signOut();
      },
    }),
    [session, me, loading],
  );

  return (
    <QueryClientProvider client={queryClient}>
      <Ctx.Provider value={value}>{children}</Ctx.Provider>
    </QueryClientProvider>
  );
}

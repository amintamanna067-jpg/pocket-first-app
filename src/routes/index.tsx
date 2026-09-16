import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { BookOpen, Chrome, LoaderCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export const Route = createFileRoute("/")({
  head: () => ({ meta: [
    { title: "Study Shelf — Learn from your own notes" },
    { name: "description", content: "Turn notes and documents into clear concepts, recall questions, and spaced-repetition flashcards." },
    { property: "og:title", content: "Study Shelf — Learn from your own notes" },
    { property: "og:description", content: "Turn notes and documents into clear concepts, recall questions, and flashcards." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: Index,
});

function Index() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"sign-in" | "sign-up">("sign-in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(true);
  const [message, setMessage] = useState("");
  useEffect(() => { void supabase.auth.getUser().then(({ data }) => { if (data.user) void navigate({ to: "/study", replace: true }); else setBusy(false); }); }, []);
  async function submit(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setMessage("");
    const result = mode === "sign-in" ? await supabase.auth.signInWithPassword({ email, password }) : await supabase.auth.signUp({ email, password });
    setBusy(false);
    if (result.error) return setMessage(result.error.message);
    if (mode === "sign-up" && !result.data.session) return setMessage("Check your email to confirm your account, then sign in.");
    await navigate({ to: "/study", replace: true });
  }
  async function forgot() { if (!email) return setMessage("Enter your email first."); const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${window.location.origin}/reset-password` }); setMessage(error?.message ?? "Check your email for a password reset link."); }
  if (busy) return <main className="grid min-h-dvh place-items-center bg-background"><LoaderCircle className="animate-spin text-primary" aria-label="Loading" /></main>;
  return <main className="grid min-h-dvh bg-background lg:grid-cols-[minmax(0,1.05fr)_minmax(380px,.95fr)]"><section className="hidden bg-primary p-12 text-primary-foreground lg:flex lg:flex-col lg:justify-between"><div className="flex items-center gap-3 text-lg font-bold"><span className="grid h-10 w-10 place-items-center rounded-md bg-primary-foreground text-primary"><BookOpen /></span>Study Shelf</div><div className="max-w-xl"><h1 className="text-5xl font-bold leading-tight">Learn from the material that matters to you.</h1><p className="mt-5 text-lg leading-8 opacity-80">Clear concepts, practical examples, recall questions, and flashcards—organized for every course.</p></div><p className="text-sm opacity-70">Your study history stays connected to your account.</p></section><section className="flex min-w-0 items-center justify-center p-4 sm:p-8"><div className="w-full max-w-sm"><div className="mb-10 flex items-center gap-3 lg:hidden"><span className="grid h-10 w-10 place-items-center rounded-md bg-primary text-primary-foreground"><BookOpen /></span><span className="font-bold">Study Shelf</span></div><p className="text-sm font-semibold text-primary">{mode === "sign-in" ? "WELCOME BACK" : "CREATE ACCOUNT"}</p><h1 className="mt-2 text-3xl font-bold">{mode === "sign-in" ? "Continue studying" : "Start your study shelf"}</h1><p className="mt-2 text-sm text-muted-foreground">{mode === "sign-in" ? "Sign in to sync your topics and progress." : "Use your email or Google account."}</p><Button variant="outline" className="mt-7 h-12 w-full" onClick={() => lovable.auth.signInWithOAuth("google", { redirect_uri: window.location.origin })}><Chrome />Continue with Google</Button><div className="my-5 flex items-center gap-3 text-xs text-muted-foreground"><span className="h-px flex-1 bg-border" />OR<span className="h-px flex-1 bg-border" /></div><form onSubmit={submit} className="space-y-4"><label className="block"><span className="mb-2 block text-sm font-medium">Email</span><Input className="h-12" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></label><label className="block"><span className="mb-2 block text-sm font-medium">Password</span><Input className="h-12" type="password" minLength={8} autoComplete={mode === "sign-in" ? "current-password" : "new-password"} value={password} onChange={(e) => setPassword(e.target.value)} required /></label>{mode === "sign-in" && <button type="button" className="min-h-11 text-sm font-medium text-primary" onClick={forgot}>Forgot password?</button>}<Button className="h-12 w-full" disabled={busy}>{busy ? "Please wait…" : mode === "sign-in" ? "Sign in" : "Create account"}</Button></form>{message && <p className="mt-4 rounded-md bg-muted p-3 text-sm">{message}</p>}<button className="mt-6 min-h-11 w-full text-sm text-muted-foreground" onClick={() => { setMode(mode === "sign-in" ? "sign-up" : "sign-in"); setMessage(""); }}>{mode === "sign-in" ? "New here? Create an account" : "Already have an account? Sign in"}</button></div></section></main>;
}

import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export const Route = createFileRoute("/reset-password")({
  head: () => ({ meta: [
    { title: "Reset password — Study Shelf" },
    { name: "description", content: "Choose a new Study Shelf password." },
    { property: "og:title", content: "Reset password — Study Shelf" },
    { property: "og:description", content: "Choose a new Study Shelf password." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: ResetPassword,
});

function ResetPassword() {
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(event: React.FormEvent) {
    event.preventDefault(); setBusy(true);
    const { error } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (error) return setMessage(error.message);
    await navigate({ to: "/study" });
  }
  return <main className="grid min-h-dvh place-items-center bg-background p-4"><form onSubmit={submit} className="w-full max-w-sm space-y-5 rounded-lg border bg-card p-6 shadow-sm"><div><p className="text-sm font-semibold text-primary">STUDY SHELF</p><h1 className="mt-2 text-2xl font-bold">Choose a new password</h1></div><Input className="h-11" type="password" minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="New password" required /><Button className="h-11 w-full" disabled={busy}>{busy ? "Updating…" : "Update password"}</Button>{message && <p className="text-sm text-destructive">{message}</p>}</form></main>;
}

import { useEffect, useState } from "react";
import { ArrowLeft, ArrowRight, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { isSupabaseConfigured } from "@/lib/supabase";
import { probeConnection, type Connection } from "@/lib/connection";
import { CheckCircle2, CircleAlert, CircleSlash, Loader2 } from "lucide-react";
import { Brand } from "@/components/brand";
import { Card } from "@/components/ui/card";
import { ThemeToggle } from "@/components/theme-toggle";
import { Eyebrow } from "@/features/marketing/components/Eyebrow";
import { cn } from "@/lib/utils";
import type { Account } from "@/features/ledger/types";

type Props = {
  accounts: Account[];
  signIn: (id: string) => void;
  signInWithPin?: (account: Account, pin: string) => Promise<string | null>;
};

export function SignInScreen({ accounts, signIn, signInWithPin }: Props) {
  const [picked, setPicked] = useState<Account | null>(null);
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [connection, setConnection] = useState<Connection>({ state: "checking" });

  // Answers "is the backend actually wired up?" without anyone opening devtools.
  useEffect(() => {
    let cancelled = false;
    void probeConnection().then(result => { if (!cancelled) setConnection(result); });
    return () => { cancelled = true; };
  }, []);

  // Without Supabase there is nothing to authenticate against, so picking a name is enough.
  const needsPin = isSupabaseConfigured && Boolean(signInWithPin);

  async function submitPin(event: React.FormEvent) {
    event.preventDefault();
    if (!picked || !signInWithPin) return;
    setBusy(true);
    const message = await signInWithPin(picked, pin);
    setBusy(false);
    if (message) { setError(message); setPin(""); return; }
  }

  if (picked && needsPin) {
    return (
      <div className="min-h-dvh bg-app">
        <header className="flex items-center justify-between gap-4 border-b border-line px-[clamp(22px,4vw,55px)] py-5">
          <Brand />
          <ThemeToggle />
        </header>
        <div className="mx-auto max-w-125 px-[clamp(22px,4vw,55px)] py-10 md:py-16">
          <button
            onClick={() => { setPicked(null); setPin(""); setError(null); }}
            className="mb-6 inline-flex items-center gap-2 border-0 bg-transparent text-sm2 text-subtle hover:text-brandtext"
          >
            <ArrowLeft className="size-4" aria-hidden="true" /> Not you?
          </button>
          <Eyebrow>Sign in</Eyebrow>
          <h2 className="m-0 mb-6 font-serif text-[clamp(28px,3.4vw,44px)] leading-none font-medium tracking-[-1.5px]">
            Hello {picked.name},
            <br />
            <em className="font-medium text-accent">enter your PIN.</em>
          </h2>
          <Card className="gap-0 rounded-none border-line bg-panel p-4.5 shadow-none min-[431px]:p-6">
            <form onSubmit={submitPin} className="grid gap-3">
              <Input
                autoFocus
                aria-label={`PIN for ${picked.name}`}
                value={pin}
                onChange={e => { setPin(e.target.value.replace(/\D/g, "").slice(0, 4)); setError(null); }}
                inputMode="numeric"
                type="password"
                placeholder="••••"
                className="h-auto rounded-[3px] border-field-line bg-field p-4 text-center font-serif text-3xl2 tracking-[0.5em]"
              />
              {error && <p className="m-0 text-center text-sm2 text-neg">{error}</p>}
              <Button
                type="submit"
                disabled={pin.length < 4 || busy}
                className="h-12 w-full gap-2.5 bg-accent text-md2 font-semibold text-on-accent hover:bg-accent-hover"
              >
                {busy ? "Checking…" : "Sign in"}
                <ArrowRight className="size-4.5" aria-hidden="true" />
              </Button>
            </form>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-dvh bg-app">
      <header className="flex items-center justify-between gap-4 border-b border-line px-[clamp(22px,4vw,55px)] py-5">
        <Brand />
        <ThemeToggle />
      </header>

      <div className="mx-auto max-w-160 px-[clamp(22px,4vw,55px)] py-10 md:py-16">
        <Eyebrow>Who is on the counter?</Eyebrow>
        <h2 className="m-0 mb-6 font-serif text-[clamp(32px,4vw,54px)] leading-none font-medium tracking-[-2px]">
          Choose your
          <br />
          <em className="font-medium text-accent">name to start.</em>
        </h2>

        <ConnectionNote connection={connection} />

        <Card className="gap-0 rounded-none border-line bg-panel p-4.5 shadow-none min-[431px]:p-6">
          <div className="grid gap-2.5">
            {accounts.map(account => (
              <button
                key={account.id}
                onClick={() => (needsPin ? setPicked(account) : signIn(account.id))}
                className="grid w-full grid-cols-[auto_1fr_auto] items-center gap-3.5 rounded border border-line bg-field p-4 text-left text-ink transition-all hover:-translate-y-0.5 hover:border-brandtext"
              >
                <span className="grid size-10.5 place-items-center rounded-full bg-info-soft text-info">
                  <User className="size-5" aria-hidden="true" />
                </span>
                <strong className="text-md2">{account.name}</strong>
                <ArrowRight className="size-4.5" aria-hidden="true" />
              </button>
            ))}
          </div>
          <p className="m-0 mt-4 text-center text-xs2 text-faint">
            Names are managed from the Team screen.
          </p>
        </Card>
      </div>
    </div>
  );
}

const notes: Record<Connection["state"], { Icon: typeof CheckCircle2; tone: string; title: string; body: string }> = {
  local: {
    Icon: CircleSlash, tone: "border-line bg-band text-subtle",
    title: "Local only", body: "No backend configured. Everything is saved on this device."
  },
  checking: {
    Icon: Loader2, tone: "border-line bg-band text-subtle",
    title: "Checking connection…", body: "Contacting Supabase."
  },
  connected: {
    Icon: CheckCircle2, tone: "border-pos-line bg-pos-soft text-pos",
    title: "Connected to Supabase", body: "Sales and products sync across devices."
  },
  "no-schema": {
    Icon: CircleAlert, tone: "border-warn-line bg-warn-soft text-accent",
    title: "Connected, but no tables yet", body: "Run supabase/setup.sql in the SQL editor to finish setup."
  },
  unreachable: {
    Icon: CircleAlert, tone: "border-warn-line bg-warn-soft text-neg",
    title: "Cannot reach Supabase", body: "Working locally until the connection returns."
  }
};

function ConnectionNote({ connection }: { connection: Connection }) {
  // Healthy states say nothing: a permanent "all is well" banner is just noise. Only
  // the states that need action are worth interrupting for.
  if (connection.state === "connected" || connection.state === "local" || connection.state === "checking") return null;
  const note = notes[connection.state];
  const detail = connection.state === "unreachable" ? connection.detail : note.body;
  return (
    <div className={cn("mb-4 flex items-start gap-3 rounded border px-4 py-3", note.tone)}>
      <note.Icon className="mt-0.5 size-4.5 shrink-0" aria-hidden="true" />
      <span className="flex flex-col gap-0.5">
        <strong className="text-sm2">{note.title}</strong>
        <small className="text-sm2 opacity-90">{detail}</small>
      </span>
    </div>
  );
}

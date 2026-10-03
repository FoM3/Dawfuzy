import { useEffect, useState } from "react";
import { Crown, LogOut, ShieldCheck, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Eyebrow } from "@/features/marketing/components/Eyebrow";
import { isSupabaseConfigured } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import { isAdminRole, type Account, type AuditEntry } from "@/features/ledger/types";

const fieldLabel = "text-xs2 font-bold tracking-[1.4px] text-subtle uppercase";
const fieldInput = "h-auto rounded-[3px] border-field-line bg-field p-3.5 text-md2 text-ink";

type Props = {
  account: Account;
  rename: (name: string) => Promise<string | null>;
  changePin: (pin: string) => Promise<string | null>;
  signOut: () => void;
};

export function AccountScreen({ account, rename, changePin, signOut }: Props) {
  const [name, setName] = useState(account.name);
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const isAdmin = isAdminRole(account.role);

  // A rename elsewhere (an admin editing you) should show through, not be overwritten.
  useEffect(() => setName(account.name), [account.name]);

  const pinChanged = isSupabaseConfigured && pin.length > 0;
  const nameChanged = name.trim() !== account.name;
  const invalidPin = pinChanged && pin.length < 4;

  async function save() {
    setBusy(true);
    setError(null);
    if (nameChanged) {
      const message = await rename(name.trim());
      if (message) { setError(message); setBusy(false); return; }
    }
    if (pinChanged) {
      const message = await changePin(pin);
      if (message) { setError(message); setBusy(false); return; }
    }
    setPin("");
    setBusy(false);
  }

  return (
    <div className="mx-auto max-w-[1450px] px-[clamp(22px,4vw,55px)] pt-9 pb-[calc(var(--nav-height)+var(--safe-bottom)+32px)] lg:pb-15">
      <div className="mb-6 lg:mb-8">
        <Eyebrow>Your account</Eyebrow>
        <h2 className="m-0 font-serif text-[clamp(32px,4vw,54px)] leading-none font-medium tracking-[-2px]">
          Signed in as
          <br />
          <em className="font-medium text-accent">{account.name}.</em>
        </h2>
      </div>

      <section className="grid items-start gap-4 lg:grid-cols-[1fr_360px]">
        <Card className="gap-0 rounded-none border-line bg-panel p-4.5 shadow-none min-[431px]:p-6">
          <div className="mb-5.5">
            <p className="m-0 mb-1.25 text-xs2 font-bold tracking-[1.4px] text-subtle">YOUR DETAILS</p>
            <h3 className="m-0 font-serif text-2xl2 font-medium">Name and PIN</h3>
          </div>

          <div className="grid gap-4 sm:max-w-115">
            <div className="grid gap-2">
              <Label htmlFor="my-name" className={fieldLabel}>Name</Label>
              <Input
                id="my-name"
                value={name}
                onChange={e => { setName(e.target.value); setError(null); }}
                className={fieldInput}
              />
              <span className="text-sm2 text-subtle">
                This is what everyone picks on the sign-in screen. Sales you already recorded
                keep the name you had at the time.
              </span>
            </div>

            {isSupabaseConfigured && (
              <div className="grid gap-2">
                <Label htmlFor="my-new-pin" className={fieldLabel}>New PIN</Label>
                <Input
                  id="my-new-pin"
                  value={pin}
                  onChange={e => { setPin(e.target.value.replace(/\D/g, "").slice(0, 4)); setError(null); }}
                  inputMode="numeric"
                  placeholder="••••"
                  className={`${fieldInput} max-w-50 text-center font-serif text-xl2 tracking-[0.4em]`}
                />
                <span className="text-sm2 text-subtle">Leave empty to keep your current PIN.</span>
              </div>
            )}

            {error && <p className="m-0 text-sm2 text-neg">{error}</p>}

            <Button
              onClick={() => void save()}
              disabled={busy || invalidPin || (!nameChanged && !pinChanged)}
              className="h-12 w-fit bg-accent px-6 text-md2 font-semibold text-on-accent hover:bg-accent-hover"
            >
              {busy ? "Saving…" : "Save changes"}
            </Button>
          </div>
        </Card>

        <Card className="gap-0 rounded-none border-line bg-panel p-4.5 shadow-none min-[431px]:p-6">
          <div className="mb-5.5">
            <p className="m-0 mb-1.25 text-xs2 font-bold tracking-[1.4px] text-subtle">THIS DEVICE</p>
            <h3 className="m-0 font-serif text-2xl2 font-medium">Session</h3>
          </div>

          <div className="mb-5 flex items-center gap-3">
            <span className={cn("grid size-10.5 shrink-0 place-items-center rounded-full", isAdmin ? "bg-pos-soft text-pos" : "bg-info-soft text-info")}>
              {isAdmin ? <ShieldCheck className="size-5" aria-hidden="true" /> : <User className="size-5" aria-hidden="true" />}
            </span>
            <div className="min-w-0">
              <strong className="block truncate text-md2 font-semibold">{account.name}</strong>
              <span className="inline-flex items-center gap-1.5 text-sm2 text-subtle capitalize">
                {account.role === "superadmin" && <Crown className="size-3" aria-hidden="true" />}
                {account.role === "superadmin" ? "owner" : account.role}
              </span>
            </div>
          </div>

          <Button
            variant="outline"
            onClick={signOut}
            aria-label={`Sign out ${account.name}`}
            className="h-12 w-full gap-2.5 border-line text-md2 text-neg hover:border-neg hover:text-neg"
          >
            <LogOut className="size-4.5" aria-hidden="true" />
            Sign out
          </Button>
          <p className="m-0 mt-3 text-center text-xs2 text-faint">
            Nothing is kept on this device once you sign out.
          </p>
        </Card>
      </section>

    </div>
  );
}

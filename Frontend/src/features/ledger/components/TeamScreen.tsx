import { FormEvent, useState } from "react";
import { Crown, Eye, EyeOff, KeyRound, PencilLine, Plus, ShieldCheck, User, UserCheck, UserX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Eyebrow } from "@/features/marketing/components/Eyebrow";
import { formatDay } from "@/lib/ledger";
import { isSupabaseConfigured } from "@/lib/supabase";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";
import { isAdminRole, type Account, type Role } from "@/features/ledger/types";


const fieldLabel = "text-xs2 font-bold tracking-[1.4px] text-subtle uppercase";
const fieldInput = "h-auto rounded-[3px] border-field-line bg-field p-3.5 text-md2 text-ink";
const th = "px-4 py-3 text-left text-xs2 font-bold tracking-[1.4px] text-subtle uppercase whitespace-nowrap";
const td = "px-4 py-4 text-md2 align-middle";

const roleCopy: Record<Role, string> = {
  superadmin: "The owner. Everything, plus resetting other people's PINs",
  admin: "Sees every screen, including profit and products",
  user: "Records sales and views history only"
};

type Props = {
  accounts: Account[];
  currentId: string;
  addAccount: (name: string, role: Role, pin?: string) => boolean | Promise<boolean>;
  setActive: (id: string, active: boolean) => void;
  updatePerson: (id: string, name: string, role: Role) => Promise<string | null>;
  currentRole: Role;
  changePin: (targetId: string, pin: string, isSelf: boolean) => Promise<string | null>;
};

export function TeamScreen({ accounts, currentId, addAccount, setActive, updatePerson, currentRole, changePin }: Props) {
  const isOwner = currentRole === "superadmin";
  const [confirmDisable, setConfirmDisable] = useState<Account | null>(null);
  const [editTarget, setEditTarget] = useState<Account | null>(null);
  const [editName, setEditName] = useState("");
  const [editRole, setEditRole] = useState<Role>("user");
  const [editError, setEditError] = useState<string | null>(null);
  const [savingEdit, setSavingEdit] = useState(false);

  async function submitEdit() {
    if (!editTarget) return;
    setSavingEdit(true);
    const message = await updatePerson(editTarget.id, editName, editRole);
    setSavingEdit(false);
    if (message) { setEditError(message); return; }
    setEditTarget(null);
  }

  const [pinTarget, setPinTarget] = useState<Account | null>(null);
  const [newPin, setNewPin] = useState("");
  const [pinError, setPinError] = useState<string | null>(null);
  const [savingPin, setSavingPin] = useState(false);

  async function submitPin() {
    if (!pinTarget) return;
    setSavingPin(true);
    const message = await changePin(pinTarget.id, newPin, pinTarget.id === currentId);
    setSavingPin(false);
    if (message) { setPinError(message); return; }
    setPinTarget(null);
    setNewPin("");
  }

  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [role, setRole] = useState<Role>("user");
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  // PINs are hidden by default so they are not on display over someone's shoulder.
  const [showPins, setShowPins] = useState(false);

  const duplicate = name.trim().length > 0 && accounts.some(a => a.name.trim().toLowerCase() === name.trim().toLowerCase());
  const adminCount = accounts.filter(a => isAdminRole(a.role) && !a.disabledAt).length;

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    const saved = await addAccount(name.trim(), role, pin);
    setBusy(false);
    if (saved) {
      setName("");
      setRole("user");
      setPin("");
      setOpen(false);
    }
  }

  return (
    <div className="mx-auto max-w-[1450px] px-[clamp(22px,4vw,55px)] pt-9 pb-[calc(var(--nav-height)+var(--safe-bottom)+32px)] lg:pb-15">
      <div className="mb-6 flex flex-col justify-between gap-5 sm:flex-row sm:items-end lg:mb-8">
        <div>
          <Eyebrow>Team</Eyebrow>
          <h2 className="m-0 font-serif text-[clamp(32px,4vw,54px)] leading-none font-medium tracking-[-2px]">
            Who can use
            <br />
            <em className="font-medium text-accent">the ledger.</em>
          </h2>
        </div>
        <Button onClick={() => setOpen(true)} className="h-12 shrink-0 gap-2.5 px-5 text-md2 font-semibold">
          <Plus className="size-4.5" aria-hidden="true" />
          Add person
        </Button>
      </div>

      <Card className="gap-0 overflow-hidden rounded-none border-line bg-panel p-0 shadow-none">
        <div className="flex items-center justify-between gap-3 border-b border-line px-4.5 py-4 min-[431px]:px-6">
          <h3 className="m-0 font-serif text-2xl2 font-medium">People</h3>
          <div className="flex items-center gap-3">
            {accounts.some(a => a.pin) && (
              <button
                type="button"
                onClick={() => setShowPins(v => !v)}
                className="inline-flex items-center gap-1.5 rounded border border-line bg-field px-3 py-2 text-sm2 whitespace-nowrap text-subtle transition-colors hover:border-brandtext hover:text-brandtext"
              >
                {showPins ? <EyeOff className="size-3.5" aria-hidden="true" /> : <Eye className="size-3.5" aria-hidden="true" />}
                {showPins ? "Hide PINs" : "Show PINs"}
              </button>
            )}
            <span className="text-xs2 whitespace-nowrap text-subtle">{accounts.length} accounts</span>
          </div>
        </div>

        <div className="w-full min-w-0 overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b border-line bg-band">
                <th className={cn(th, "w-12 text-right")}>#</th>
                <th className={th}>Name</th>
                <th className={th}>Role</th>
                <th className={th}>PIN</th>
                <th className={th}>Added</th>
                <th className={cn(th, "relative text-right")}>
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {accounts.map((account, index) => {
                const isAdmin = isAdminRole(account.role);
                const isSelf = account.id === currentId;
                // Never strand the shop without an admin, and never let anyone delete themselves.
                const lockedReason =
                  isSelf ? "This is you"
                  : account.role === "superadmin" ? "The owner"
                  : isAdmin && adminCount === 1 ? "The only admin"
                  : isAdmin && !isOwner ? "Owner only"
                  : null;
                // Editing follows the same shape: your own row always, the owner's row
                // only by the owner, and another admin's only by the owner.
                const canEdit = isSelf || (account.role !== "superadmin" && (isOwner || !isAdmin));
                return (
                  <tr key={account.id} className="border-b border-line-soft last:border-b-0">
                    <td className={cn(td, "text-right text-sm2 tabular-nums text-faint")}>{index + 1}</td>
                    <td className={cn(td, "min-w-45", account.disabledAt && "opacity-60")}>
                      <div className="flex items-center gap-3">
                        <span className={cn("grid size-9 shrink-0 place-items-center rounded-full", isAdmin ? "bg-pos-soft text-pos" : "bg-info-soft text-info")}>
                          {isAdmin ? <ShieldCheck className="size-4.5" aria-hidden="true" /> : <User className="size-4.5" aria-hidden="true" />}
                        </span>
                        <div className="min-w-0">
                          <strong className="block font-semibold">{account.name}</strong>
                          {isSelf && <span className="text-sm2 text-subtle">Signed in</span>}
                          {account.disabledAt && <span className="text-sm2 text-neg">Disabled</span>}
                        </div>
                      </div>
                    </td>
                    <td className={cn(td, "whitespace-nowrap")}>
                      <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs2 uppercase", isAdmin ? "bg-pos-soft text-pos" : "bg-info-soft text-info")}>
                        {account.role === "superadmin" && <Crown className="size-3" aria-hidden="true" />}
                        {account.role === "superadmin" ? "owner" : account.role}
                      </span>
                    </td>
                    <td className={cn(td, "whitespace-nowrap")}>
                      {account.pin ? (
                        <span className={cn("font-serif text-lg2 tracking-[0.3em]", !showPins && "text-subtle")}>
                          {showPins ? account.pin : "••••"}
                        </span>
                      ) : (
                        <span className="text-sm2 text-faint">—</span>
                      )}
                    </td>
                    <td className={cn(td, "whitespace-nowrap text-subtle")}>{formatDay(account.createdAt)}</td>
                    <td className={cn(td, "text-right")}>
                      <span className="inline-flex items-center justify-end gap-2">
                        {canEdit && (
                          <button
                            type="button"
                            onClick={() => { setEditTarget(account); setEditName(account.name); setEditRole(account.role); setEditError(null); }}
                            aria-label={`Edit ${account.name}`}
                            className="inline-flex items-center gap-1.5 rounded border border-line bg-field px-3 py-2 text-sm2 whitespace-nowrap text-ink transition-colors hover:border-brandtext"
                          >
                            <PencilLine className="size-3.5" aria-hidden="true" /> Edit
                          </button>
                        )}
                        {(isSelf || isOwner) && (
                          <button
                            type="button"
                            onClick={() => { setPinTarget(account); setNewPin(""); setPinError(null); }}
                            aria-label={`Change PIN for ${account.name}`}
                            className="inline-flex items-center gap-1.5 rounded border border-line bg-field px-3 py-2 text-sm2 whitespace-nowrap text-brandtext transition-colors hover:border-brandtext"
                          >
                            <KeyRound className="size-3.5" aria-hidden="true" /> PIN
                          </button>
                        )}
                        {lockedReason ? (
                          <span className="text-sm2 whitespace-nowrap text-faint">{lockedReason}</span>
                        ) : account.disabledAt ? (
                          <button
                            type="button"
                            onClick={() => setActive(account.id, true)}
                            aria-label={`Enable ${account.name}`}
                            className="inline-flex items-center gap-1.5 rounded border border-line bg-field px-3 py-2 text-sm2 whitespace-nowrap text-pos transition-colors hover:border-pos"
                          >
                            <UserCheck className="size-3.5" aria-hidden="true" /> Enable
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setConfirmDisable(account)}
                            aria-label={`Disable ${account.name}`}
                            className="inline-flex items-center gap-1.5 rounded border border-line bg-field px-3 py-2 text-sm2 whitespace-nowrap text-neg transition-colors hover:border-neg"
                          >
                            <UserX className="size-3.5" aria-hidden="true" /> Disable
                          </button>
                        )}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      <AlertDialog open={!!confirmDisable} onOpenChange={o => !o && setConfirmDisable(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="font-serif text-2xl2 font-medium">
              Disable {confirmDisable?.name}?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-md2 text-subtle">
              They will not be able to sign in, and their name disappears from the sign-in
              screen. Sales they already recorded stay in the history with their name on them.
              You can switch them back on at any time.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="h-12 text-md2">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => { if (confirmDisable) setActive(confirmDisable.id, false); setConfirmDisable(null); }}
              className="h-12 bg-neg text-md2 font-semibold text-white hover:bg-neg/90"
            >
              Disable
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!editTarget} onOpenChange={o => !o && setEditTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="font-serif text-2xl2 font-medium">
              {editTarget?.id === currentId ? "Your details" : `Edit ${editTarget?.name}`}
            </AlertDialogTitle>
            <AlertDialogDescription className="text-md2 text-subtle">
              The name is what they pick on the sign-in screen. Sales they already recorded
              keep the name they had at the time.
            </AlertDialogDescription>
          </AlertDialogHeader>

          <div className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="edit-name" className={fieldLabel}>Name</Label>
              <Input
                id="edit-name"
                value={editName}
                onChange={e => { setEditName(e.target.value); setEditError(null); }}
                className={fieldInput}
              />
            </div>

            {/* Only the owner moves people between roles, and the owner's own role is fixed. */}
            {isOwner && editTarget?.role !== "superadmin" && (
              <div className="grid gap-2">
                <span className={fieldLabel}>Role</span>
                {(["user", "admin"] as const).map(option => (
                  <button
                    type="button"
                    key={option}
                    aria-pressed={editRole === option}
                    onClick={() => { setEditRole(option); setEditError(null); }}
                    className={cn(
                      "grid grid-cols-[auto_1fr] items-center gap-3 rounded border p-3.5 text-left transition-colors",
                      editRole === option
                        ? "border-brandtext bg-select shadow-[0_0_0_1px_var(--brandtext)_inset]"
                        : "border-line bg-field hover:border-hover-line"
                    )}
                  >
                    <span className={cn("grid size-9 place-items-center rounded-full", option === "admin" ? "bg-pos-soft text-pos" : "bg-info-soft text-info")}>
                      {option === "admin" ? <ShieldCheck className="size-4.5" aria-hidden="true" /> : <User className="size-4.5" aria-hidden="true" />}
                    </span>
                    <span>
                      <strong className="block text-md2 capitalize">{option}</strong>
                      <small className="text-sm2 text-subtle">{roleCopy[option]}</small>
                    </span>
                  </button>
                ))}
              </div>
            )}

            {editError && <p className="m-0 text-sm2 text-neg">{editError}</p>}
          </div>

          <AlertDialogFooter>
            <AlertDialogCancel className="h-12 text-md2">Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={savingEdit || editName.trim().length === 0}
              onClick={event => { event.preventDefault(); void submitEdit(); }}
              className="h-12 bg-accent text-md2 font-semibold text-on-accent hover:bg-accent-hover"
            >
              {savingEdit ? "Saving…" : "Save changes"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!pinTarget} onOpenChange={o => !o && setPinTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="font-serif text-2xl2 font-medium">
              {pinTarget?.id === currentId ? "Change your PIN" : `Reset ${pinTarget?.name}'s PIN`}
            </AlertDialogTitle>
            <AlertDialogDescription className="text-md2 text-subtle">
              {pinTarget?.id === currentId
                ? "You will use this the next time you sign in."
                : "Tell them the new PIN directly; it is not sent anywhere."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="grid gap-2">
            <Label htmlFor="new-pin" className={fieldLabel}>
              New 4-digit PIN
            </Label>
            <Input
              id="new-pin"
              value={newPin}
              onChange={e => { setNewPin(e.target.value.replace(/\D/g, "").slice(0, 4)); setPinError(null); }}
              inputMode="numeric"
              placeholder="0000"
              className={`${fieldInput} text-center font-serif text-xl2 tracking-[0.4em]`}
            />
            {pinError && <p className="m-0 text-sm2 text-neg">{pinError}</p>}
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel className="h-12 text-md2">Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={newPin.length < 4 || savingPin}
              onClick={event => { event.preventDefault(); void submitPin(); }}
              className="h-12 bg-accent text-md2 font-semibold text-on-accent hover:bg-accent-hover"
            >
              {savingPin ? "Saving…" : "Save PIN"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="right" className="w-full gap-0 bg-app data-[side=right]:w-full data-[side=right]:sm:max-w-192">
          <SheetHeader className="border-b border-line">
            <SheetTitle className="font-serif text-2xl2 font-medium">Add person</SheetTitle>
            <SheetDescription className="text-sm2 text-subtle">
              They pick their name on the sign-in screen. There is no password.
            </SheetDescription>
          </SheetHeader>

          <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col">
            <div className="min-h-0 flex-1 overflow-y-auto px-4 py-5">
              <div className="grid gap-2">
                <Label htmlFor="person-name" className={fieldLabel}>
                  Name
                </Label>
                <Input
                  id="person-name"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  required
                  placeholder="e.g. Ama"
                  className={fieldInput}
                />
                {duplicate && <p className="m-0 text-sm2 text-neg">Someone already uses this name.</p>}
              </div>

              {isSupabaseConfigured && (
                <div className="mt-5 grid gap-2">
                  <Label htmlFor="person-pin" className={fieldLabel}>
                    4-digit PIN
                  </Label>
                  <Input
                    id="person-pin"
                    value={pin}
                    onChange={e => setPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
                    inputMode="numeric"
                    required
                    placeholder="0000"
                    className={`${fieldInput} text-center font-serif text-xl2 tracking-[0.4em]`}
                  />
                  <span className="text-sm2 text-subtle">They type this to sign in. Tell it to them directly.</span>
                </div>
              )}

              <div className="mt-5 grid gap-2">
                <span className={fieldLabel}>Role</span>
                {(["user", "admin"] as const).map(option => (
                  <button
                    type="button"
                    key={option}
                    aria-pressed={role === option}
                    onClick={() => setRole(option)}
                    className={cn(
                      "grid grid-cols-[auto_1fr] items-center gap-3 rounded border p-3.5 text-left transition-colors",
                      role === option
                        ? "border-brandtext bg-select shadow-[0_0_0_1px_var(--brandtext)_inset]"
                        : "border-line bg-field hover:border-hover-line"
                    )}
                  >
                    <span className={cn("grid size-9 place-items-center rounded-full", option === "admin" ? "bg-pos-soft text-pos" : "bg-info-soft text-info")}>
                      {option === "admin" ? <ShieldCheck className="size-4.5" aria-hidden="true" /> : <User className="size-4.5" aria-hidden="true" />}
                    </span>
                    <span>
                      <strong className="block text-md2 capitalize">{option}</strong>
                      <small className="text-sm2 text-subtle">{roleCopy[option]}</small>
                    </span>
                  </button>
                ))}
              </div>
            </div>

            <SheetFooter className="flex-row gap-2 border-t border-line">
              <Button type="button" variant="outline" onClick={() => setOpen(false)} className="h-12 flex-1 text-md2">
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={duplicate || busy || (isSupabaseConfigured && pin.length < 4)}
                className="h-12 flex-1 bg-accent text-md2 font-semibold text-on-accent hover:bg-accent-hover"
              >
                {busy ? "Adding…" : "Add person"}
              </Button>
            </SheetFooter>
          </form>
        </SheetContent>
      </Sheet>
    </div>
  );
}

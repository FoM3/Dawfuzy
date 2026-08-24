import { FormEvent, useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Toaster } from "@/components/ui/sonner";
import { LedgerHeader } from "@/features/ledger/components/LedgerHeader";
import { LedgerMobileNav, LedgerSidebar } from "@/features/ledger/components/LedgerNav";
import { NewEntryScreen } from "@/features/ledger/components/NewEntryScreen";
import { SignInScreen } from "@/features/ledger/components/SignInScreen";
import { TeamScreen } from "@/features/ledger/components/TeamScreen";
import { OverviewScreen } from "@/features/ledger/components/OverviewScreen";
import { AuditScreen } from "@/features/ledger/components/AuditScreen";
import { AccountScreen } from "@/features/ledger/components/AccountScreen";
import { ProductsScreen } from "@/features/ledger/components/ProductsScreen";
import { SalesHistoryScreen } from "@/features/ledger/components/SalesHistoryScreen";
import { seedAccounts, seedProducts, seedTransactions } from "@/features/ledger/data/mock-data";
import { clockTime, money, today, toNumber } from "@/lib/format";
import { isSupabaseConfigured, supabase } from "@/lib/supabase";
import { probeConnection } from "@/lib/connection";
import { changeMyName, changeMyPin, createPerson, currentAccount, resetPinFor, setPersonActive, signInWithPin, signOutRemote, updatePersonDetails } from "@/features/ledger/data/auth";
import { enqueue, flushOutbox, pullPeople, pullProducts, pushAudit, pushProduct, readOutbox, writeOutbox, type SyncState } from "@/lib/sync";
import { deleteSale, updateSale, useSalesByProduct } from "@/features/ledger/data/queries";
import { formatDay } from "@/lib/ledger";
import { useKeyboardInset } from "@/lib/use-keyboard-inset";
import type { Account, AuditAction, AuditEntry, LedgerScreen, Product, ProductDraft, Role, Transaction } from "@/features/ledger/types";
import { isAdminRole, userScreens } from "@/features/ledger/types";

type LedgerProps = {
  screen: LedgerScreen;
  setScreen: (screen: LedgerScreen) => void;
};

// screen/setScreen come from App so the URL stays the source of truth across refreshes.
export function Ledger({ screen, setScreen }: LedgerProps) {
  useKeyboardInset();
  const queryClient = useQueryClient();
  // Nothing here is cached on the device. The seeds are only a starting shape for the
  // first paint and for running without Supabase; the server overwrites them on refresh.
  const [products, setProducts] = useState<Product[]>(seedProducts);
  const [transactions, setTransactions] = useState<Transaction[]>(seedTransactions);
  const [accounts, setAccounts] = useState<Account[]>(seedAccounts);
  const [audit, setAudit] = useState<AuditEntry[]>([]);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [restoringSession, setRestoringSession] = useState(isSupabaseConfigured);
  const [sync, setSync] = useState<SyncState>(isSupabaseConfigured ? "pending" : "local");

  const account = accounts.find(a => a.id === sessionId) ?? null;
  const isAdmin = account ? isAdminRole(account.role) : false;

  // Resolve the sync badge on its own, regardless of whether a Supabase session exists.
  // Without this it sits on "Syncing" forever when signed in against local data only.
  useEffect(() => {
    if (!isSupabaseConfigured) return;
    let cancelled = false;
    void probeConnection().then(result => {
      if (cancelled) return;
      if (result.state === "connected") setSync(readOutbox().length ? "pending" : "synced");
      else if (result.state === "local") setSync("local");
      else if (result.state === "unreachable") setSync(navigator.onLine ? "error" : "offline");
      else setSync("error"); // reachable, but the schema is not there yet
    });
    return () => { cancelled = true; };
  }, []);

  // Restore the Supabase session on reload, then merge the server data into the local cache.
  useEffect(() => {
    if (!supabase) return;
    let cancelled = false;
    void (async () => {
      const remote = await currentAccount();
      if (cancelled) return;
      if (!remote) {
        // Nobody signed in: ask for a PIN, but still pull the name list, which the people
        // view exposes to anon precisely for this screen.
        try {
          const people = await pullPeople(supabase!, false);
          if (!cancelled && people.length) setAccounts(people);
        } catch {
          // Offline or unreachable: the sign-in screen falls back to the seeded owner.
        }
        if (!cancelled) setRestoringSession(false);
        return;
      }
      setAccounts(current => [remote, ...current.filter(a => a.id !== remote.id)]);
      setSessionId(remote.id);
      setRestoringSession(false);
      await refresh(isAdminRole(remote.role));
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Drain the outbox as soon as the connection returns.
  useEffect(() => {
    if (!supabase) return;
    // refresh, not just flush: a session restored while offline falls back to the lowest
    // role, so coming back online is when it can be corrected.
    const onOnline = () => void refresh(isAdmin);
    const onOffline = () => setSync("offline");
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => { window.removeEventListener("online", onOnline); window.removeEventListener("offline", onOffline); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [transactions, sessionId]);

  // A user landing on an admin screen (bookmark, shared link, demotion) is sent somewhere they may go.
  useEffect(() => {
    if (account && !isAdminRole(account.role) && !userScreens.includes(screen)) setScreen("entry");
  }, [account, screen, setScreen]);
  const [productId, setProductId] = useState(products[0].id);
  const [quantity, setQuantity] = useState("1");
  const selected = products.find(product => product.id === productId) ?? products[0];

  const quantityValue = toNumber(quantity);

  // Units sold per product, all time; the sale picker sorts by this so the busy sellers
  // stay on top. Rolled up server-side, since the rows themselves are no longer all here.
  const soldByProduct = useSalesByProduct("", "", Boolean(sessionId));
  const popularity = useMemo(() => {
    const counts: Record<string, number> = {};
    if (isSupabaseConfigured) {
      const byName = new Map(products.map(p => [p.name, p.id]));
      for (const row of soldByProduct.data ?? []) {
        const id = byName.get(row.name);
        if (id) counts[id] = row.units;
      }
      return counts;
    }
    for (const t of transactions) {
      if (t.type === "sale" && t.productId) counts[t.productId] = (counts[t.productId] ?? 0) + t.quantity;
    }
    return counts;
  }, [soldByProduct.data, products, transactions]);

  // Sales and the audit trail are paged by their own screens, so this only pulls the
  // small, whole-of-shop lists that every screen needs.
  async function refresh(asAdmin: boolean) {
    if (!supabase) return;
    if (!navigator.onLine) { setSync("offline"); return; }
    try {
      const [remoteProducts, people] = await Promise.all([
        pullProducts(supabase, asAdmin),
        pullPeople(supabase, asAdmin)
      ]);
      if (remoteProducts.length) setProducts(remoteProducts);
      if (people.length) setAccounts(people);
      await flush();
    } catch {
      setSync("error");
    }
  }

  async function flush() {
    if (!supabase) return;
    if (!navigator.onLine) { setSync("offline"); return; }
    try {
      const { sent } = await flushOutbox(supabase, transactions, sessionId);
      // Rows reached the server, so every rollup and page built from them is now stale.
      if (sent) void queryClient.invalidateQueries({ queryKey: ["sales"] });
      setSync(readOutbox().length ? "pending" : "synced");
    } catch {
      setSync("error");
    }
  }

  async function signInRemote(target: Account, pin: string): Promise<string | null> {
    const { error, account: signed } = await signInWithPin(target.name, pin, target.email);
    if (error || !signed) return error ?? "Could not sign in";
    setAccounts(current => [signed, ...current.filter(a => a.id !== signed.id)]);
    setSessionId(signed.id);
    // Everyone lands on New sale: recording one is what the shop opens the app to do.
    setScreen("entry");
    await refresh(isAdminRole(signed.role));
    return null;
  }

  function signIn(id: string) {
    setSessionId(id);
    setScreen("entry");
  }

  /**
   * Nothing one person saw should outlive their session. The till is shared, so the next
   * person to sign in must not inherit cached sales, cost prices, profit, the audit trail
   * or anybody's PIN, whether or not their role would let them see it.
   */
  async function signOut() {
    // Drain first: queued sales are stamped with the live session, so anything still
    // waiting would otherwise be dropped or credited to whoever signs in next.
    await flush();
    const stranded = readOutbox().length;
    if (stranded > 0) {
      toast.error(`${stranded} ${stranded === 1 ? "sale is" : "sales are"} still unsent and will be lost`);
    }

    setSessionId(null);
    setScreen("entry");
    queryClient.clear();
    setTransactions([]);
    setAudit([]);
    writeOutbox([]);
    // Names stay for the sign-in list; PINs must not.
    setAccounts(current => current.map(a => ({ ...a, pin: undefined })));
    void signOutRemote();
  }

  // Every admin action gets a row. The actor name is copied in, so the trail survives
  // that person later being removed.
  function record(action: AuditAction, subject: string, detail: string) {
    const actor = accounts.find(a => a.id === sessionId);
    const entry: AuditEntry = {
      id: crypto.randomUUID(),
      action,
      actorId: sessionId ?? "unknown",
      actorName: actor?.name ?? "Unknown",
      subject,
      detail,
      date: today(),
      time: clockTime()
    };
    setAudit(current => [...current, entry]);
    if (supabase) {
      void pushAudit(supabase, entry)
        .then(() => queryClient.invalidateQueries({ queryKey: ["audit"] }))
        .catch(() => setSync("error"));
    }
  }

  // Self-service goes through the browser; resetting someone else needs the Edge Function.
  async function changePin(targetId: string, pin: string, isSelf: boolean): Promise<string | null> {
    if (!isSupabaseConfigured) {
      setAccounts(accounts.map(a => (a.id === targetId ? { ...a, pin } : a)));
      return null;
    }
    const message = isSelf ? await changeMyPin(pin) : await resetPinFor(targetId, pin);
    if (message) return message;
    setAccounts(accounts.map(a => (a.id === targetId ? { ...a, pin } : a)));
    toast.success(isSelf ? "Your PIN was changed" : "PIN reset");
    return null;
  }

  async function addAccount(name: string, role: Role, pin?: string) {
    if (!name) {
      toast.error("Give the person a name");
      return false;
    }
    if (accounts.some(a => a.name.trim().toLowerCase() === name.toLowerCase())) {
      toast.error("Someone already uses this name");
      return false;
    }
    if (isSupabaseConfigured) {
      if (!pin || pin.length < 4) {
        toast.error("Give them a 4-digit PIN");
        return false;
      }
      const { error, id } = await createPerson(name, pin, role);
      if (error || !id) {
        toast.error(error ?? "Could not add that person");
        return false;
      }
      setAccounts([...accounts, { id, name, role, pin, createdAt: today() }]);
      record("person.added", name, `Role: ${role}`);
      toast.success(`${name} can now sign in`);
      return true;
    }
    setAccounts([...accounts, { id: crypto.randomUUID(), name, role, pin, createdAt: today() }]);
    record("person.added", name, `Role: ${role}`);
    toast.success(`${name} can now sign in`);
    return true;
  }

  /**
   * Corrects or removes a recorded sale. Sales are append-only apart from this, so every
   * correction is written to the audit trail: the figure can change, but not quietly.
   */
  async function correctSale(sale: Transaction, next: { quantity: number; productId: string } | null) {
    const message = next ? await updateSale(sale.id, next.quantity, next.productId) : await deleteSale(sale.id);
    if (message) return message;

    if (next) {
      const item = products.find(p => p.id === next.productId);
      const changes = [
        sale.quantity !== next.quantity ? `Quantity ${sale.quantity} → ${next.quantity}` : null,
        item && sale.productId !== next.productId ? `Item ${sale.item} → ${item.name}` : null
      ].filter(Boolean) as string[];
      record("sale.updated", `${item?.name ?? sale.item} · ${formatDay(sale.date)}`, changes.join(" · "));
      toast.success("Sale corrected");
    } else {
      record("sale.deleted", `${sale.item} · ${formatDay(sale.date)}`, `Was ${sale.quantity} × ${money(sale.unitPrice)}`);
      toast.success("Sale removed");
    }

    setTransactions(current => current.filter(t => t.id !== sale.id));
    void queryClient.invalidateQueries({ queryKey: ["sales"] });
    return null;
  }

  /** An admin editing someone's name or role. The server decides who is allowed to. */
  async function updatePerson(id: string, name: string, role: Role): Promise<string | null> {
    const target = accounts.find(a => a.id === id);
    if (!target) return "No such person";

    const clean = name.trim();
    if (!clean) return "Give the person a name";
    if (accounts.some(a => a.id !== id && a.name.trim().toLowerCase() === clean.toLowerCase())) {
      return "Someone already uses this name";
    }
    if (clean === target.name && role === target.role) return null;

    if (isSupabaseConfigured) {
      const message = id === sessionId && role === target.role
        ? await changeMyName(clean)
        : await updatePersonDetails(id, clean, role);
      if (message) return message;
    }

    setAccounts(accounts.map(a => (a.id === id ? { ...a, name: clean, role } : a)));
    const changes = [
      target.name !== clean ? `Name ${target.name} → ${clean}` : null,
      target.role !== role ? `Role ${target.role} → ${role}` : null
    ].filter(Boolean) as string[];
    record("person.updated", clean, changes.join(" · "));
    toast.success(`${clean} updated`);
    return null;
  }

  /** Disabling keeps the row, so past sales and the audit trail stay attributed. */
  async function toggleAccountActive(id: string, active: boolean) {
    const target = accounts.find(a => a.id === id);
    if (!target || id === sessionId) return;
    if (target.role === "superadmin") return;
    if (!active && isAdminRole(target.role) && accounts.filter(a => isAdminRole(a.role) && !a.disabledAt).length === 1) return;

    if (isSupabaseConfigured) {
      const message = await setPersonActive(id, active);
      if (message) {
        toast.error(message);
        return;
      }
    }
    setAccounts(accounts.map(a => (a.id === id ? { ...a, disabledAt: active ? null : new Date().toISOString() } : a)));
    record(active ? "person.enabled" : "person.disabled", target.name, `Was ${target.role}`);
    toast.success(active ? `${target.name} can sign in again` : `${target.name} disabled`);
  }

  function selectProduct(id: string) {
    setProductId(id);
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    if (quantityValue < 1) return toast.error("Enter a quantity of at least 1");

    // Snapshot both prices so a later product edit cannot rewrite this sale's profit.
    const entry: Transaction = {
      id: crypto.randomUUID(),
      type: "sale",
      productId: selected.id,
      item: selected.name,
      quantity: quantityValue,
      unitPrice: selected.price,
      costPrice: selected.costPrice,
      amount: quantityValue * selected.price,
      date: today(),
      time: clockTime(),
      recordedById: sessionId ?? undefined,
      recordedBy: account?.name
    };
    const nextTransactions = [...transactions, entry];
    setTransactions(nextTransactions);
    setQuantity("1");
    if (supabase) {
      enqueue(entry.id);
      setSync("pending");
      void flushOutbox(supabase, nextTransactions, sessionId)
        .then(() => setSync(readOutbox().length ? "pending" : "synced"))
        .catch(() => setSync(navigator.onLine ? "error" : "offline"));
    }
    toast.success("Sale saved and totals updated");
  }

  function validateDraft(draft: ProductDraft, ignoreId?: string) {
    if (!draft.name) {
      toast.error("Give the product a name");
      return false;
    }
    if (products.some(p => p.id !== ignoreId && p.name.trim().toLowerCase() === draft.name.toLowerCase())) {
      toast.error("A product with this name already exists");
      return false;
    }
    if (draft.price <= 0) {
      toast.error("Set a selling price above zero");
      return false;
    }
    return true;
  }

  function addProduct(draft: ProductDraft) {
    if (!validateDraft(draft)) return false;
    const product: Product = {
      // Random id, never derived from the name: renaming a product must not change its identity.
      id: crypto.randomUUID(),
      name: draft.name,
      description: draft.description,
      pack: draft.pack,
      costPrice: draft.costPrice,
      price: draft.price,
      stock: 0,
      reorderAt: 10
    };
    setProducts([...products, product]);
    if (supabase) void pushProduct(supabase, product).catch(() => setSync("error"));
    record("product.added", product.name, `${product.pack} · sells at ${money(product.price)}`);
    toast.success(`${product.name} added to the catalogue`);
    return true;
  }

  // Only future sales see the new prices; past transactions keep their own snapshot.
  function updateProduct(id: string, draft: ProductDraft) {
    if (!validateDraft(draft, id)) return false;
    const before = products.find(p => p.id === id);
    const nextProducts = products.map(p => (p.id === id ? { ...p, ...draft } : p));
    setProducts(nextProducts);
    if (before) {
      const changes = [
        before.name !== draft.name ? `Name ${before.name} → ${draft.name}` : null,
        before.price !== draft.price ? `Selling price ${money(before.price)} → ${money(draft.price)}` : null,
        before.costPrice !== draft.costPrice ? `Cost ${money(before.costPrice)} → ${money(draft.costPrice)}` : null,
        before.pack !== draft.pack ? `Sold as ${before.pack} → ${draft.pack}` : null,
        before.description !== draft.description ? "Description updated" : null
      ].filter(Boolean) as string[];
      if (changes.length) record("product.updated", draft.name, changes.join(" · "));
    }
    const updated = nextProducts.find(p => p.id === id);
    if (supabase && updated) void pushProduct(supabase, updated).catch(() => setSync("error"));
    toast.success(`${draft.name} updated`);
    return true;
  }

  // Avoid flashing the sign-in screen while the stored session is being restored.
  if (restoringSession) return <div className="min-h-dvh bg-app" />;

  if (!account) {
    return (
      <SignInScreen accounts={accounts.filter(a => !a.disabledAt)} signIn={signIn} signInWithPin={signInRemote} />
    );
  }

  return (
    <div className="grid min-h-dvh bg-app lg:grid-cols-[230px_1fr]">
      <LedgerSidebar screen={screen} setScreen={setScreen} role={account.role} />
      <main className="min-w-0">
        <LedgerHeader screen={screen} account={account} sync={sync} editAccount={() => setScreen("account")} />
        {screen === "overview" && isAdmin && (
          <OverviewScreen
            transactions={transactions}
            products={products}
            people={accounts}
            isAdmin={isAdmin}
            accountName={account.name}
          />
        )}
        {screen === "entry" && (
          <NewEntryScreen
            products={products}
            selected={selected}
            productId={productId}
            selectProduct={selectProduct}
            quantity={quantity}
            setQuantity={setQuantity}
            quantityValue={quantityValue}
            submit={submit}
            popularity={popularity}
            canSeeProfit={isAdmin}
          />
        )}
        {screen === "history" && (
          <SalesHistoryScreen
            transactions={transactions}
            products={products}
            people={accounts}
            isAdmin={isAdmin}
            currentId={account.id}
            currentName={account.name}
            correctSale={correctSale}
          />
        )}
        {screen === "products" && isAdmin && <ProductsScreen products={products} addProduct={addProduct} updateProduct={updateProduct} />}
        {screen === "audit" && isAdmin && <AuditScreen audit={audit} />}
        {screen === "account" && (
          <AccountScreen
            account={account}
            audit={audit}
            rename={name => updatePerson(account.id, name, account.role)}
            changePin={pin => changePin(account.id, pin, true)}
            signOut={signOut}
          />
        )}
        {screen === "team" && isAdmin && (
          <TeamScreen
            accounts={accounts}
            currentId={account.id}
            currentRole={account.role}
            addAccount={addAccount}
            setActive={toggleAccountActive}
            updatePerson={updatePerson}
            changePin={changePin}
          />
        )}
      </main>
      <LedgerMobileNav screen={screen} setScreen={setScreen} role={account.role} />
      {/* Top, not bottom: the mobile tab bar sits over the bottom of the screen and was
          covering the confirmation that a sale had saved. */}
      <Toaster position="top-center" offset={{ top: "calc(var(--safe-top) + 12px)" }} />
    </div>
  );
}

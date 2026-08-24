import { emailForName, passwordForPin, provisioningClient, supabase } from "@/lib/supabase";
import type { Account, Role } from "@/features/ledger/types";

/**
 * Supabase speaks in terms of email auth, which is an implementation detail here: the
 * addresses are synthetic and no mail is ever meant to be sent. Translate the errors
 * people actually hit into the setting that causes them.
 */
export function explainAuthError(error: { code?: string; message?: string } | null): string {
  const code = error?.code ?? "";
  const message = error?.message ?? "";

  if (code === "over_email_send_rate_limit" || /email rate limit/i.test(message)) {
    return 'Supabase is still trying to send confirmation emails. Turn off "Confirm email" under Authentication → Providers → Email, then try again.';
  }
  if (code === "email_address_invalid" || /invalid.*email/i.test(message)) {
    return "Supabase rejected the generated address. Allow the dawfuzy.local domain, or turn off email confirmation.";
  }
  if (code === "user_already_exists" || /already registered|already been registered/i.test(message)) {
    return "That name is already taken. Pick a different one.";
  }
  if (code === "email_not_confirmed" || /not confirmed/i.test(message)) {
    return 'This account was created while "Confirm email" was on, so it can never sign in. Delete it under Authentication → Users and add the person again.';
  }
  if (code === "invalid_credentials" || /invalid login/i.test(message)) {
    return "That PIN does not match";
  }
  if (code === "PGRST202" || /could not find the function/i.test(message)) {
    return "This needs the latest supabase/setup.sql. Run it in the SQL editor, then try again.";
  }
  if (/schema cache|could not find the table/i.test(message)) {
    return "The database tables do not exist yet. Run supabase/setup.sql in the SQL editor.";
  }
  if (code === "PGRST116" || /cannot coerce the result/i.test(message)) {
    return "Signed in, but this account has no profile row yet. Reload to finish setting it up.";
  }
  if (code === "23505" || /duplicate key/i.test(message)) {
    return "That name is already taken. Pick a different one.";
  }
  if (/fetch|network/i.test(message)) {
    return "Could not reach Supabase. Check the connection and try again.";
  }
  return message || "Could not complete that";
}

/**
 * Signs in an existing person by name + PIN.
 *
 * The address comes from the people view when it is known. Deriving it from the current
 * name only works until somebody is renamed, at which point the derived address stops
 * matching the one the account was created with.
 */
export async function signInWithPin(name: string, pin: string, email?: string): Promise<{ error?: string; account?: Account }> {
  if (!supabase) return { error: "Supabase is not configured" };

  const { data, error } = await supabase.auth.signInWithPassword({
    email: email || emailForName(name),
    password: passwordForPin(pin)
  });
  if (error || !data.user) return { error: explainAuthError(error) };

  // maybeSingle, not single: a missing row is an expected state for accounts created
  // before the trigger existed, and single() turns that into a PGRST116 error.
  const { data: profile } = await supabase.from("profiles").select("*").eq("id", data.user.id).maybeSingle();
  if (profile) {
    // A disabled account may still hold valid credentials, so refuse it here and drop
    // the session rather than leaving them signed in.
    if (profile.disabled_at) {
      await supabase.auth.signOut();
      return { error: "This account has been disabled. Ask an admin to switch it back on." };
    }
    return {
      account: {
        id: profile.id, name: profile.name, role: profile.role,
        pin: profile.pin || undefined, email: data.user.email ?? undefined,
        disabledAt: profile.disabled_at, createdAt: (profile.created_at ?? "").slice(0, 10)
      }
    };
  }

  // Orphaned auth user: create the missing profile as a plain user.
  const { data: created, error: createError } = await supabase
    .from("profiles")
    .insert({ id: data.user.id, name, role: "user" })
    .select()
    .maybeSingle();
  if (!created) {
    return { error: createError ? explainAuthError(createError) : "This account has no profile yet. Ask an admin to re-add you." };
  }
  return { account: { id: created.id, name: created.name, role: created.role, createdAt: created.created_at } };
}

export async function signOutRemote() {
  await supabase?.auth.signOut();
}

/**
 * Creates a person without disturbing the admin's session, by running the sign-up on a
 * second client. The trigger always makes them a 'user'; promotion is a separate
 * update that only an admin's own session is allowed to perform.
 */
export async function createPerson(name: string, pin: string, role: Role): Promise<{ error?: string; id?: string }> {
  if (!supabase) return { error: "Supabase is not configured" };
  const provisioner = provisioningClient();
  if (!provisioner) return { error: "Supabase is not configured" };

  const { data, error } = await provisioner.auth.signUp({
    email: emailForName(name),
    password: passwordForPin(pin),
    options: { data: { name } }
  });
  if (error || !data.user) return { error: explainAuthError(error) };

  // The trigger always creates the profile as 'user', so the PIN and any promotion are
  // applied here from the caller's own session. .select() matters: an update that RLS
  // filters to zero rows reports no error, so without it a blocked promotion looks
  // like a success and the person silently stays a plain user.
  const patch: Record<string, string> = { pin };
  if (role !== "user") patch.role = role;

  const { data: patched, error: patchError } = await supabase
    .from("profiles")
    .update(patch)
    .eq("id", data.user.id)
    .select("role, pin")
    .maybeSingle();

  if (patchError) return { error: explainAuthError(patchError) };
  if (!patched) {
    return {
      error: `${name} was created, but their role and PIN could not be saved. You need to be signed in as an admin to do that.`
    };
  }
  if (role !== "user" && patched.role !== role) {
    return { error: `${name} was created as a user; only an admin can grant the ${role} role.` };
  }
  return { id: data.user.id };
}

/** Changes your own display name. The sign-in address is unaffected. */
export async function changeMyName(name: string): Promise<string | null> {
  if (!supabase) return null;
  const { error } = await supabase.rpc("set_my_name", { new_name: name });
  return error ? explainAuthError(error) : null;
}

/** An admin editing someone else's name and role. The server enforces who may do what. */
export async function updatePersonDetails(id: string, name: string, role: Role): Promise<string | null> {
  if (!supabase) return null;
  const { error } = await supabase.rpc("set_person_details", { target: id, new_name: name, new_role: role });
  return error ? explainAuthError(error) : null;
}

/** Disables or re-enables a person. The profile row is kept either way. */
export async function setPersonActive(id: string, active: boolean): Promise<string | null> {
  if (!supabase) return null;
  const { error } = await supabase.rpc("set_person_active", { target: id, active });
  return error ? explainAuthError(error) : null;
}

/** Restores the signed-in person after a reload. */
export async function currentAccount(): Promise<Account | null> {
  if (!supabase) return null;

  // getSession reads the stored token without a network round trip. getUser would ask
  // the server, so a reload with no signal used to return null and strand the person on
  // the PIN screen, which they cannot pass while offline either.
  const { data: { session } } = await supabase.auth.getSession();
  const user = session?.user;
  if (!user) return null;

  const { data: profile, error } = await supabase.from("profiles").select("*").eq("id", user.id).maybeSingle();
  if (profile) {
    if (profile.disabled_at) {
      await supabase.auth.signOut();
      return null;
    }
    return {
      id: profile.id,
      name: profile.name,
      role: profile.role,
      pin: profile.pin || undefined,
      email: user.email ?? undefined,
      disabledAt: profile.disabled_at,
      createdAt: (profile.created_at ?? "").slice(0, 10)
    };
  }

  // The row could not be read, most likely because there is no connection. Stay signed
  // in at the lowest privilege rather than logging them out; RLS decides what they can
  // actually touch, so an optimistic role here grants nothing on the server.
  if (error) {
    const name = typeof user.user_metadata?.name === "string" ? user.user_metadata.name : "Signed in";
    return { id: user.id, name, role: "user", createdAt: "" };
  }

  // Reached the server and there genuinely is no profile: that is the orphan case.
  return null;
}

/** Changes your own PIN. Both the auth password and the stored PIN must move together. */
export async function changeMyPin(pin: string): Promise<string | null> {
  if (!supabase) return "Supabase is not configured";
  if (!/^\d{4}$/.test(pin)) return "PIN must be exactly four digits";

  const { error: passwordError } = await supabase.auth.updateUser({ password: passwordForPin(pin) });
  if (passwordError) return explainAuthError(passwordError);

  const { error: pinError } = await supabase.rpc("set_my_pin", { new_pin: pin });
  if (pinError) return explainAuthError(pinError);
  return null;
}

/**
 * Resets somebody else's PIN. Only the owner may do this. set_pin_for moves the stored
 * pin and the auth password together, so there is no Edge Function to deploy.
 */
export async function resetPinFor(targetId: string, pin: string): Promise<string | null> {
  if (!supabase) return "Supabase is not configured";
  if (!/^\d{4}$/.test(pin)) return "PIN must be exactly four digits";

  const { error } = await supabase.rpc("set_pin_for", { target: targetId, new_pin: pin });
  return error ? explainAuthError(error) : null;
}

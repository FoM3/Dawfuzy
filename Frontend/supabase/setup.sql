-- Dawfuzy Water Ledger: the Supabase schema.
-- Run this once in the Supabase SQL editor.
--
-- Design notes:
--  * Sales are append-only and carry their own price snapshot, so syncing a queued
--    sale is idempotent and editing a product never rewrites history.
--  * Cost price is the sensitive column. Users must not merely be prevented from
--    rendering it; it must never reach their device. That is what the *_public
--    views below are for.

-- crypt() and gen_salt() live in the extensions schema on Supabase and are not always
-- on the path. set_pin_for below needs them, so create the extension up front.
create extension if not exists pgcrypto with schema extensions;

-- ---------------------------------------------------------------- profiles ----
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null unique,
  role text not null default 'user' check (role in ('superadmin', 'admin', 'user')),
  -- The PIN in clear text so an admin can look it up and tell staff. Combined with the
  -- fixed suffix this IS the auth password, so it is readable only by an admin or by
  -- the owner of the row (see profiles_select below), and never by the sign-in list.
  pin text not null default '',
  -- The synthetic address the account signs in with. Captured once at creation and never
  -- rewritten, because names are editable: deriving the address from the current name
  -- locks a person out the moment anybody renames them.
  login_email text not null default '',
  -- Set instead of deleting the row: the person keeps their place in the audit trail
  -- and on past sales, but can no longer sign in.
  disabled_at timestamptz,
  created_at timestamptz not null default now()
);

-- Reads the caller's role. security definer so the policy can read profiles
-- without recursing through the profiles policy itself.
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
     where id = auth.uid() and role in ('superadmin', 'admin')
  );
$$;

-- The owner account. Only this role may reset someone else's PIN or remove an admin.
create or replace function public.is_superadmin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'superadmin');
$$;

-- New sign-ups always land as 'user'. Only an existing admin can promote someone,
-- so a rogue sign-up cannot mint itself an admin account.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, name, role, login_email)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'name', 'Unnamed'), 'user', new.email)
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------- products ----
create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text not null default '',
  pack text not null check (pack in ('Pack', 'Bag', 'Dispenser')),
  cost_price numeric(10,2) not null default 0,
  price numeric(10,2) not null default 0,
  -- Set instead of deleting: a retired product leaves the sale picker but keeps its place
  -- on every past sale and in the reports. Deleting it would orphan nothing, since a sale
  -- snapshots the name and prices, but the catalogue would stop explaining the history.
  retired_at timestamptz,
  updated_at timestamptz not null default now()
);

-- ------------------------------------------------------------------- sales ----
create table if not exists public.sales (
  id uuid primary key,                       -- generated on the device; makes retries idempotent
  -- Deliberately NOT a foreign key. A sale already carries the item name and both
  -- prices, so it stands alone; the link is advisory. An offline device must never
  -- be blocked from syncing a sale because its catalogue is a step behind.
  product_id uuid,
  item text not null,
  quantity integer not null check (quantity > 0),
  unit_price numeric(10,2) not null,
  cost_price numeric(10,2) not null,
  amount numeric(10,2) not null,
  sold_on date not null,                     -- the shop's local calendar day
  sold_at_label text not null default '',    -- the "9:42 AM" shown in the UI
  recorded_by uuid references auth.users(id) on delete set null,
  recorded_by_name text not null default '',   -- copied in so attribution survives deletion
  -- Whatever the person wants to remember about this sale: who bought it, that it was
  -- paid later, a damaged pack. Free text, always optional, never parsed.
  note text not null default '',
  created_at timestamptz not null default now()
);

create index if not exists sales_sold_on_idx on public.sales (sold_on desc);


-- ------------------------------------------------- upgrade existing installs ----
-- create table if not exists cannot add columns to a table that already exists, so
-- bring an older project up to date before anything below depends on these.
alter table public.profiles add column if not exists pin text not null default '';
alter table public.profiles add column if not exists disabled_at timestamptz;
alter table public.profiles add column if not exists login_email text not null default '';

-- Backfill the address for accounts made before this column existed. Reads auth.users
-- once, here, rather than exposing it through a view.
update public.profiles p
   set login_email = u.email
  from auth.users u
 where u.id = p.id and coalesce(p.login_email, '') = '';
alter table public.sales    add column if not exists recorded_by_name text not null default '';
alter table public.products add column if not exists retired_at timestamptz;
alter table public.sales    add column if not exists note text not null default '';

-- The sortable half of sold_at_label. History is ordered by it, so a day's sales read in
-- the order they were rung up; created_at cannot do that, because a batch of back-entered
-- sales all lands at once and a text label sorts "10:05 AM" before "7:50 AM".
alter table public.sales    add column if not exists sold_at time;

-- Backfill from the label, falling back to when the row arrived for anything unparseable.
update public.sales
   set sold_at = case
                   when sold_at_label ~ '^\s*\d{1,2}:\d{2}\s*[AaPp][Mm]\s*$'
                     then to_timestamp(trim(sold_at_label), 'HH12:MI AM')::time
                   when sold_at_label ~ '^\s*\d{1,2}:\d{2}\s*$'
                     then to_timestamp(trim(sold_at_label), 'HH24:MI')::time
                   else created_at::time
                 end
 where sold_at is null;

alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add  constraint profiles_role_check
  check (role in ('superadmin', 'admin', 'user'));


-- ------------------------------------------------ products.id -> uuid ----
-- Earlier versions used readable slugs ('voltic-500'). Those cannot be cast to uuid,
-- so the rows are cleared and reinserted below with their new ids. Guarded, so this
-- is a no-op once the column is already uuid.
do $migrate$
begin
  if exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'products'
       and column_name = 'id' and data_type <> 'uuid'
  ) then
    alter table public.sales drop constraint if exists sales_product_id_fkey;
    delete from public.sales;
    delete from public.products;

    -- A view pins the type of every column it selects, so the ones reading id have to
    -- go first. Both are recreated further down, so this is not a loss.
    drop view if exists public.products_public;
    drop view if exists public.sales_public;

    alter table public.products alter column id drop default;
    alter table public.products alter column id type uuid using gen_random_uuid();
    alter table public.products alter column id set default gen_random_uuid();

    alter table public.sales alter column product_id type uuid using null::uuid;
  end if;
end $migrate$;

-- The product link is advisory, not a foreign key: a device that is offline while the
-- catalogue changes would otherwise be permanently unable to sync its sales.
alter table public.sales drop constraint if exists sales_product_id_fkey;
create index if not exists sales_product_idx on public.sales (product_id);
create index if not exists sales_day_time_idx on public.sales (sold_on desc, sold_at desc);

-- Derived here rather than sent by the app, so a phone running an older bundle still files
-- its sales in the right order, and adding the column can never reject an insert.
create or replace function public.sales_set_sold_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.sold_at is null then
    new.sold_at := case
                     when new.sold_at_label ~ '^\s*\d{1,2}:\d{2}\s*[AaPp][Mm]\s*$'
                       then to_timestamp(trim(new.sold_at_label), 'HH12:MI AM')::time
                     when new.sold_at_label ~ '^\s*\d{1,2}:\d{2}\s*$'
                       then to_timestamp(trim(new.sold_at_label), 'HH24:MI')::time
                     else coalesce(new.created_at, now())::time
                   end;
  end if;
  return new;
end;
$$;

drop trigger if exists sales_sold_at on public.sales;
create trigger sales_sold_at before insert on public.sales
  for each row execute function public.sales_set_sold_at();

-- Staff read the catalogue through products_public, which carries no cost, so their device
-- has none to send and posts zero. Stamped from the catalogue here, which keeps cost off
-- the staff device while still recording it. A zero cost is never meaningful to this shop.
create or replace function public.sales_set_cost()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if coalesce(new.cost_price, 0) = 0 and new.product_id is not null then
    new.cost_price := coalesce((select p.cost_price from public.products p where p.id = new.product_id), 0);
  end if;
  return new;
end;
$$;

drop trigger if exists sales_cost on public.sales;
create trigger sales_cost before insert on public.sales
  for each row execute function public.sales_set_cost();

-- Sales recorded before that trigger existed have no cost, so they report their whole
-- value as profit. Fill them from the catalogue.
update public.sales s
   set cost_price = p.cost_price
  from public.products p
 where p.id = s.product_id and coalesce(s.cost_price, 0) = 0;
-- History can be narrowed to one person, so the name is worth an index of its own.
create index if not exists sales_recorded_by_name_idx on public.sales (recorded_by_name);

-- --------------------------------------------------------------------- RLS ----
alter table public.profiles enable row level security;
alter table public.products enable row level security;
alter table public.sales   enable row level security;

-- profiles: everyone signed in can see who exists; only admins may change roles.
-- Tightened from "everyone": the row now carries the PIN, so a plain user may read
-- only their own. The pre-auth name list uses the public.people view, which omits it.
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles for select to authenticated
  using (public.is_admin() or id = auth.uid());

-- Self-heal: a signed-in account with no profile row (created before this schema
-- existed) may create its own, but only ever as 'user'. Promotion stays admin-only.
drop policy if exists profiles_insert_self on public.profiles;
create policy profiles_insert_self on public.profiles for insert to authenticated
  with check (id = auth.uid() and role = 'user');

drop policy if exists profiles_update_admin on public.profiles;
create policy profiles_update_admin on public.profiles for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- Admins may remove users; only the superadmin may remove another admin, and nobody
-- may remove themselves or the superadmin.
drop policy if exists profiles_delete_admin on public.profiles;
create policy profiles_delete_admin on public.profiles for delete to authenticated
  using (
    id <> auth.uid()
    and role <> 'superadmin'
    and (public.is_superadmin() or (public.is_admin() and role = 'user'))
  );

-- products / sales base tables: admins only, because both expose cost_price.
drop policy if exists products_admin_all on public.products;
create policy products_admin_all on public.products for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists sales_select_admin on public.sales;
create policy sales_select_admin on public.sales for select to authenticated
  using (public.is_admin());

-- Anyone signed in may record a sale, and must stamp it as themselves.
drop policy if exists sales_insert on public.sales;
create policy sales_insert on public.sales for insert to authenticated
  with check (recorded_by = auth.uid());


-- --------------------------------------------------------------- audit log ----
-- Append-only trail of admin actions. actor_name is copied in rather than joined,
-- so removing a person never erases what they did.
create table if not exists public.audit_log (
  id uuid primary key,
  action text not null,
  actor_id uuid references auth.users(id) on delete set null,
  actor_name text not null,
  subject text not null,
  detail text not null default '',
  happened_on date not null,
  happened_at_label text not null default '',
  created_at timestamptz not null default now()
);

create index if not exists audit_log_created_idx on public.audit_log (created_at desc);

alter table public.audit_log enable row level security;

-- Only admins may read the trail; anyone signed in may append to it, and only as
-- themselves. No update or delete policy exists, so the log cannot be rewritten.
drop policy if exists audit_select_admin on public.audit_log;
create policy audit_select_admin on public.audit_log for select to authenticated
  using (public.is_admin());

drop policy if exists audit_insert on public.audit_log;
create policy audit_insert on public.audit_log for insert to authenticated
  with check (actor_id = auth.uid());

-- ------------------------------------------------------------- pin changes ----
-- Anyone may change their own PIN. Written as a security-definer function so the
-- update is confined to the pin column: a plain UPDATE policy could not stop someone
-- editing their own role at the same time.
create or replace function public.set_my_pin(new_pin text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if new_pin !~ '^[0-9]{4}$' then
    raise exception 'PIN must be exactly four digits';
  end if;
  update public.profiles set pin = new_pin where id = auth.uid();
end;
$$;

-- Only the superadmin may reset someone else's PIN.
--
-- The stored pin is just a copy an admin can read back and tell staff. The credential
-- that actually signs somebody in is the auth password, so the two have to move
-- together or the reset silently does nothing. Writing the password needs privileges
-- the browser does not have, which is what security definer buys here; it is the same
-- work the owner bootstrap block at the foot of this file does by hand.
create or replace function public.set_pin_for(target uuid, new_pin text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_superadmin() then
    raise exception 'Only the owner may change another person''s PIN';
  end if;
  if new_pin !~ '^[0-9]{4}$' then
    raise exception 'PIN must be exactly four digits';
  end if;
  if not exists (select 1 from public.profiles where id = target) then
    raise exception 'No such person';
  end if;

  update public.profiles set pin = new_pin where id = target;

  update auth.users
     set encrypted_password = extensions.crypt(new_pin || '-dawfuzy', extensions.gen_salt('bf'))
   where id = target;
end;
$$;

grant execute on function public.set_my_pin(text)          to authenticated;
grant execute on function public.set_pin_for(uuid, text)   to authenticated;

-- --------------------------------------------------------- enable/disable ----
-- Confined to the disabled_at column, and mirrors the delete rules: nobody may disable
-- themselves or the owner, and only the owner may disable another admin.
create or replace function public.set_person_active(target uuid, active boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  target_role text;
begin
  if not public.is_admin() then
    raise exception 'Only an admin may enable or disable someone';
  end if;
  if target = auth.uid() then
    raise exception 'You cannot disable your own account';
  end if;

  select role into target_role from public.profiles where id = target;
  if target_role is null then
    raise exception 'No such person';
  end if;
  if target_role = 'superadmin' then
    raise exception 'The owner cannot be disabled';
  end if;
  if target_role = 'admin' and not public.is_superadmin() then
    raise exception 'Only the owner may disable an admin';
  end if;

  update public.profiles
     set disabled_at = case when active then null else now() end
   where id = target;
end;
$$;

grant execute on function public.set_person_active(uuid, boolean) to authenticated;

-- ------------------------------------------------------------ edit details ----
-- Anyone may change their own display name. Confined to the name column, so nobody can
-- ride along and edit their own role at the same time.
create or replace function public.set_my_name(new_name text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  new_name := trim(new_name);
  if length(new_name) = 0 then
    raise exception 'Give yourself a name';
  end if;
  if exists (select 1 from public.profiles where lower(name) = lower(new_name) and id <> auth.uid()) then
    raise exception 'Someone already uses this name';
  end if;
  update public.profiles set name = new_name where id = auth.uid();
end;
$$;

-- An admin editing somebody else. Mirrors the disable rules: only the owner may touch
-- another admin, and only the owner may move anyone between roles.
create or replace function public.set_person_details(target uuid, new_name text, new_role text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  target_role text;
begin
  if not public.is_admin() then
    raise exception 'Only an admin may edit someone';
  end if;

  new_name := trim(new_name);
  if length(new_name) = 0 then
    raise exception 'Give the person a name';
  end if;
  if new_role not in ('superadmin', 'admin', 'user') then
    raise exception 'Unknown role %', new_role;
  end if;

  select role into target_role from public.profiles where id = target;
  if target_role is null then
    raise exception 'No such person';
  end if;
  if target_role = 'superadmin' and target <> auth.uid() then
    raise exception 'Only the owner may edit the owner';
  end if;
  if target_role = 'superadmin' and new_role <> 'superadmin' then
    raise exception 'The owner role cannot be given up here';
  end if;
  if target_role = 'admin' and target <> auth.uid() and not public.is_superadmin() then
    raise exception 'Only the owner may edit an admin';
  end if;
  if new_role <> target_role and not public.is_superadmin() then
    raise exception 'Only the owner may change someone''s role';
  end if;
  if exists (select 1 from public.profiles where lower(name) = lower(new_name) and id <> target) then
    raise exception 'Someone already uses this name';
  end if;

  update public.profiles set name = new_name, role = new_role where id = target;
end;
$$;

grant execute on function public.set_my_name(text)                     to authenticated;
grant execute on function public.set_person_details(uuid, text, text)  to authenticated;

-- Guards the security-definer functions below. They bypass RLS by design, so an
-- anonymous caller has to be refused explicitly.
create or replace function public.require_signed_in()
returns void
language plpgsql
stable
as $$
begin
  if auth.uid() is null then
    raise exception 'Sign in first';
  end if;
end;
$$;

-- --------------------------------------------------------- correcting sales ----
-- Sales are otherwise append-only: there is no update or delete policy on the table, so
-- these functions are the only way a row can change, and they carry the rules.
--
-- An admin may correct anything. Everyone else may only correct their own entry, and only
-- on the day they recorded it: fixing a slip during your shift is ordinary, rewriting last
-- month's takings is not. Every correction is written to the audit log by the app.

-- Only the quantity and the item can be corrected. Prices are never accepted from the
-- caller: they are read from the catalogue here, so nobody can rewrite what a sale was
-- worth, and a user with no sight of cost cannot move the margin.
-- Dropped first: adding an argument creates a second overload rather than replacing the
-- function, and PostgREST would then have two candidates to choose between.
drop function if exists public.update_sale(uuid, integer, uuid);

create or replace function public.update_sale(
  sale_id uuid,
  new_quantity integer,
  new_product_id uuid,
  new_note text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  row_owner   uuid;
  row_day     date;
  old_product uuid;
  chosen      record;
begin
  perform public.require_signed_in();

  select recorded_by, sold_on, product_id
    into row_owner, row_day, old_product
    from public.sales where id = sale_id;
  if row_day is null then
    raise exception 'No such sale';
  end if;
  if not public.is_admin() then
    if row_owner is distinct from auth.uid() then
      raise exception 'You can only correct sales you recorded';
    end if;
    if row_day <> current_date then
      raise exception 'Sales can only be corrected on the day they were recorded. Ask an admin.';
    end if;
  end if;

  if new_quantity < 1 then
    raise exception 'Quantity must be at least 1';
  end if;

  if new_product_id is distinct from old_product then
    select id, name, price, cost_price into chosen from public.products where id = new_product_id;
    if chosen.id is null then
      raise exception 'No such product';
    end if;
    -- The item genuinely changed, so it takes that product's prices as they stand today.
    update public.sales
       set quantity   = new_quantity,
           product_id = chosen.id,
           item       = chosen.name,
           unit_price = chosen.price,
           cost_price = chosen.cost_price,
           amount     = new_quantity * chosen.price,
           note       = coalesce(new_note, '')
     where id = sale_id;
  else
    -- Same item: keep the prices captured at the time of sale. Re-reading them from the
    -- catalogue would let a later price change silently rewrite an old sale.
    update public.sales
       set quantity = new_quantity,
           amount   = new_quantity * unit_price,
           note     = coalesce(new_note, '')
     where id = sale_id;
  end if;
end;
$$;

create or replace function public.delete_sale(sale_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  row_owner uuid;
  row_day   date;
begin
  perform public.require_signed_in();

  select recorded_by, sold_on into row_owner, row_day from public.sales where id = sale_id;
  if row_day is null then
    raise exception 'No such sale';
  end if;
  if not public.is_admin() then
    if row_owner is distinct from auth.uid() then
      raise exception 'You can only remove sales you recorded';
    end if;
    if row_day <> current_date then
      raise exception 'Sales can only be removed on the day they were recorded. Ask an admin.';
    end if;
  end if;

  delete from public.sales where id = sale_id;
end;
$$;

grant execute on function public.update_sale(uuid, integer, uuid, text) to authenticated;
grant execute on function public.delete_sale(uuid)                to authenticated;

-- ------------------------------------------------------------- aggregates ----
-- The screens page through sales 20 rows at a time, so no total can be computed from
-- the rows on screen: it would describe the page rather than the range. These roll up
-- server-side over the whole range instead.
--
-- security definer, because sales is admin-only at the base table. Profit is the reason
-- the *_public views exist, so every function here folds cost away for non-admins
-- rather than trusting the client not to render it.

create or replace function public.sales_totals(from_date date, to_date date)
returns table (revenue numeric, profit numeric, units bigint, sale_count bigint)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  perform public.require_signed_in();
  return query
    select coalesce(sum(s.amount), 0)::numeric,
           case when public.is_admin()
                then coalesce(sum((s.unit_price - s.cost_price) * s.quantity), 0)::numeric
                else 0::numeric end,
           coalesce(sum(s.quantity), 0)::bigint,
           count(*)::bigint
      from public.sales s
     where (from_date is null or s.sold_on >= from_date)
       and (to_date   is null or s.sold_on <= to_date);
end;
$$;

create or replace function public.sales_by_day(from_date date, to_date date)
returns table (sold_on date, revenue numeric)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  perform public.require_signed_in();
  return query
    select s.sold_on, coalesce(sum(s.amount), 0)::numeric
      from public.sales s
     where (from_date is null or s.sold_on >= from_date)
       and (to_date   is null or s.sold_on <= to_date)
     group by s.sold_on
     order by s.sold_on;
end;
$$;

create or replace function public.sales_by_product(from_date date, to_date date)
returns table (item text, units bigint, revenue numeric, profit numeric)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  perform public.require_signed_in();
  return query
    select s.item,
           sum(s.quantity)::bigint,
           sum(s.amount)::numeric,
           case when public.is_admin()
                then sum((s.unit_price - s.cost_price) * s.quantity)::numeric
                else 0::numeric end
      from public.sales s
     where (from_date is null or s.sold_on >= from_date)
       and (to_date   is null or s.sold_on <= to_date)
     group by s.item
     order by sum(s.amount) desc;
end;
$$;

create or replace function public.sales_by_person(from_date date, to_date date)
returns table (name text, sale_count bigint, revenue numeric)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  perform public.require_signed_in();
  return query
    select coalesce(nullif(s.recorded_by_name, ''), 'Unattributed'),
           count(*)::bigint,
           sum(s.amount)::numeric
      from public.sales s
     where (from_date is null or s.sold_on >= from_date)
       and (to_date   is null or s.sold_on <= to_date)
     group by 1
     order by sum(s.amount) desc;
end;
$$;

-- The first sale ever recorded, so "average a day" over all time divides by the real
-- number of trading days rather than by whatever happens to be loaded.
create or replace function public.sales_span()
returns table (first_sale date, last_sale date)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  perform public.require_signed_in();
  return query select min(s.sold_on), max(s.sold_on) from public.sales s;
end;
$$;

-- The same totals for one person. A separate overload rather than a third argument on the
-- original: PostgREST resolves by argument name, so replacing it would break every caller
-- that sends only the two dates.
create or replace function public.sales_totals(from_date date, to_date date, person text)
returns table (revenue numeric, profit numeric, units bigint, sale_count bigint)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  perform public.require_signed_in();
  return query
    select coalesce(sum(s.amount), 0)::numeric,
           case when public.is_admin()
                then coalesce(sum((s.unit_price - s.cost_price) * s.quantity), 0)::numeric
                else 0::numeric end,
           coalesce(sum(s.quantity), 0)::bigint,
           count(*)::bigint
      from public.sales s
     where (from_date is null or s.sold_on >= from_date)
       and (to_date   is null or s.sold_on <= to_date)
       and (person is null or person = '' or s.recorded_by_name = person);
end;
$$;

grant execute on function public.sales_totals(date, date)     to authenticated;
grant execute on function public.sales_totals(date, date, text) to authenticated;
grant execute on function public.sales_by_day(date, date)     to authenticated;
grant execute on function public.sales_by_product(date, date) to authenticated;
grant execute on function public.sales_by_person(date, date)  to authenticated;
grant execute on function public.sales_span()                 to authenticated;

-- ------------------------------------------------------------------- views ----
-- Cost-free projections. These are security definer (the Postgres default), so they
-- deliberately bypass the base-table policies above and expose only safe columns.

create or replace view public.products_public as
  -- retired_at goes last: create or replace can only append columns, never slot one in.
  select id, name, description, pack, price, updated_at, retired_at from public.products;

create or replace view public.sales_public as
  -- note goes last for the same reason retired_at does: replace can only append.
  select id, product_id, item, quantity, unit_price, amount, sold_on, sold_at_label,
         recorded_by, recorded_by_name, created_at, note, sold_at
  from public.sales;

-- The sign-in screen lists names before anyone is authenticated. Deliberately no pin,
-- and disabled people are omitted so they cannot even be selected.
--
-- The login address is carried here rather than derived from the name in the app. Names
-- are editable, addresses are not, so deriving one from the other locks people out the
-- moment they are renamed. The addresses are synthetic and cannot receive mail.
drop view if exists public.people;
create view public.people as
  select id, name, role, login_email as email
    from public.profiles
   where disabled_at is null;

-- A view cannot carry row-level policies, which is why Supabase labels these three
-- UNRESTRICTED in the table editor. Grants are the only lever, so they have to be exact.
--
-- Granting to authenticated is not enough on its own: Supabase's default privileges also
-- hand SELECT on new objects in public to anon, so the catalogue and the whole sales
-- history would be readable by anyone holding the publishable key, and that key ships in
-- the browser bundle. Take it back explicitly.
revoke all on public.products_public from anon;
revoke all on public.sales_public    from anon;
revoke all on public.audit_log       from anon;
revoke all on public.products        from anon;
revoke all on public.sales           from anon;
revoke all on public.profiles        from anon;

grant select on public.products_public to authenticated;
grant select on public.sales_public  to authenticated;

-- people stays readable while signed out, because the sign-in screen has to list the
-- names before anybody has a session. It carries no pin and no cost, and disabled people
-- are filtered out.
grant select on public.people        to anon, authenticated;

-- ------------------------------------------------------------------ set-up ----
-- 1. Authentication → Providers → Email: turn OFF "Confirm email".
--    Sign-in uses synthetic <name>@dawfuzy.local addresses that cannot receive mail.
-- 2. Create the first admin by signing up once in the app, then run the bootstrap block
--    at the foot of this file. It sets the role, the stored pin, and the sign-in
--    password together, which is the only combination that actually lets them in.
-- 3. Authentication → Rate limits: keep sign-in attempts throttled. A 4-digit PIN is
--    only 10,000 combinations, so throttling is what makes it meaningful.


-- ============================================================================
--  PRODUCTS: the shop's real catalogue
-- ============================================================================
-- Safe to re-run: existing rows are updated rather than duplicated. cost_price is
-- seeded equal to price because the price list carries no cost figures; that shows
-- zero profit until you fill them in, rather than reporting all takings as profit.

insert into public.products (id, name, description, pack, cost_price, price) values
  ('6329f001-97aa-4761-a93e-ad0abc8e0d24', 'Everpure 0.6L', '', 'Pack', 35, 35),
  ('28b512ef-e3d6-4c53-935e-5155239c553e', 'Everpure 370ml', '', 'Pack', 31, 31),
  ('f32eff4e-8f3e-4792-82ac-1b61f682d27f', 'Everpure dispenser refill', '', 'Dispenser', 22, 22),
  ('78857d64-0afe-4e1b-925d-68cf2202d2c2', 'Everpure dispenser (new)', '', 'Dispenser', 120, 120),
  ('45f11f4c-beb4-41ad-a7e9-543b7cef762e', 'Perla 500ml', '', 'Pack', 32, 32),
  ('aefe9e4d-39a0-4221-9f77-27a14640c399', 'Perla 750ml', '', 'Pack', 30, 30),
  ('c20431ae-d858-4135-b8bc-5d67d223590e', 'Perla dispenser', '', 'Dispenser', 30, 30),
  ('885582ec-1244-47bc-a4fc-5a254da6202b', 'Verna 500ml', '', 'Pack', 25, 25),
  ('dcbb8695-a81b-4d7d-95dc-22730e6cb183', 'Verna 750ml', '', 'Pack', 31, 31),
  ('dfe2ca24-ec84-4856-90fc-2e56ceaf62f5', 'Verna 24 pieces', '', 'Pack', 34, 34),
  ('a0953a07-f05b-499d-9141-1bc91fce2533', 'Verna dispenser', '', 'Dispenser', 30, 30),
  ('70806707-461f-4ed5-b113-67e79e14010b', 'Voltic 500ml', '', 'Pack', 30, 30),
  ('3e05566d-fc7f-4e7b-981d-1c551c1915cf', 'Voltic 750ml', '', 'Pack', 30, 30),
  ('90717917-2cf3-4f8b-90ce-ab92cdd38ac6', 'Voltic 1.5L', '', 'Pack', 30, 30),
  ('a882bbf0-6726-473c-a8b0-5d485f717915', 'Voltic dispenser', '', 'Dispenser', 35, 35),
  ('aa308fe8-b7a4-4a4e-bcec-1b579f18393e', 'Slimfit 500ml', '', 'Pack', 25, 25),
  ('06459da4-9015-468f-a50d-7dc23c726ed7', 'Bel-Aqua 500ml', '', 'Pack', 30, 30),
  ('eb245c84-0f0e-4674-9022-393d2445f514', 'Bel-Aqua Active', '', 'Pack', 42, 42),
  ('b9e17a83-7680-4fc9-b9e3-3499a810ba5e', 'Bel-Aqua 750ml', '', 'Pack', 35, 35)
-- do nothing, not do update: this file gets re-run to pick up schema changes, and the
-- catalogue is edited from the Products screen. Overwriting on conflict would quietly
-- reset every price a re-run touched. New installs still get the full list.
on conflict (id) do nothing;

-- ============================================================================
--  BOOTSTRAP THE OWNER: edit the two values, then run
-- ============================================================================
-- Only an admin can create an admin, so the very first one is made here by hand.
-- That is what stops anyone signing themselves up as an admin.
--
-- Add the person in the app first (sign-up works while signed out), then edit the two
-- values below and run. Everything else is derived, so there is nothing to keep in step.

do $owner$
declare
  owner_name  text := 'FoM';    -- <-- the name shown on the sign-in screen
  owner_pin   text := '1575';
  owner_id    uuid;
  owner_email text;
begin
  select id into owner_id from public.profiles where name = owner_name;
  if owner_id is null then
    raise exception 'No profile named %. Add that person in the app first.', owner_name;
  end if;

  -- Mirrors emailForName() in the app: lowercase, non-alphanumerics to dashes.
  owner_email := trim(both '-' from regexp_replace(lower(trim(owner_name)), '[^a-z0-9]+', '-', 'g'))
                 || '@dawfuzy.local';

  update public.profiles
     set role = 'superadmin', pin = owner_pin, login_email = owner_email
   where id = owner_id;

  -- The stored pin and the sign-in password are separate values; this is what makes the
  -- PIN actually work. Matched on id, and the address is rewritten to the one the app
  -- derives, so renaming the owner can never orphan their login.
  update auth.users
     set email              = owner_email,
         email_confirmed_at = coalesce(email_confirmed_at, now()),
         encrypted_password = extensions.crypt(owner_pin || '-dawfuzy', extensions.gen_salt('bf'))
   where id = owner_id;

  raise notice 'Owner % can now sign in as % with PIN %', owner_name, owner_email, owner_pin;
end $owner$;

-- Check the result.
select name, role, pin, disabled_at from public.profiles order by name;
select count(*) as products from public.products;

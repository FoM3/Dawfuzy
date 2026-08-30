-- Dawfuzy Water Ledger: sold_at ordering and per-person totals.
-- Safe to run more than once, and safe to run before or after deploying the app.
-- Already folded into setup.sql, so re-running that whole file does the same thing.

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
-- History can be narrowed to one person, so the name is worth an index of its own.
create index if not exists sales_recorded_by_name_idx on public.sales (recorded_by_name);

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

grant execute on function public.sales_totals(date, date, text) to authenticated;
grant execute on function public.sales_totals(date, date, text) to authenticated;

-- The view gains the column too. create or replace can only append, which is why sold_at
-- goes last.
create or replace view public.sales_public as
  select id, product_id, item, quantity, unit_price, amount, sold_on, sold_at_label,
         recorded_by, recorded_by_name, created_at, note, sold_at
  from public.sales;
revoke all on public.sales_public from anon;
grant select on public.sales_public to authenticated;

-- Check it: every sale should have a time, and a day should read in order.
select count(*) as sales, count(sold_at) as with_a_time from public.sales;
select sold_on, sold_at, sold_at_label, item, recorded_by_name
  from public.sales order by sold_on desc, sold_at desc limit 15;

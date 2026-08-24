-- Demo sales, so Analytics and History have something to show.
--
-- Run in the Supabase SQL editor. Spreads 60 sales over the last 20 days across the real
-- catalogue, attributed to the real people. Safe to run more than once; each run adds
-- another 60. The delete at the foot removes them again.
--
-- Profit will read zero until cost prices are filled in, because the catalogue seeds
-- cost_price equal to price. Set real costs on the Products screen and it comes alive.

insert into public.sales (
  id, product_id, item, quantity, unit_price, cost_price, amount,
  sold_on, sold_at_label, recorded_by, recorded_by_name
)
select
  gen_random_uuid(),
  p.id,
  p.name,
  q.qty,
  p.price,
  p.cost_price,
  q.qty * p.price,
  current_date - q.days_ago,
  to_char(timestamp '2000-01-01 07:30' + (q.slot * interval '43 minutes'), 'FMHH12:MI AM'),
  who.id,
  who.name
from (
  select
    (random() * 19)::int            as days_ago,
    1 + (random() * 5)::int         as qty,
    (random() * 13)::int            as slot,
    (random() * 0.999)              as product_roll,
    (random() * 0.999)              as person_roll
  from generate_series(1, 60)
) q
join lateral (
  select id, name, price, cost_price
    from public.products
   order by id
  offset floor(q.product_roll * (select count(*) from public.products))
   limit 1
) p on true
join lateral (
  select id, name
    from public.profiles
   where disabled_at is null
   order by id
  offset floor(q.person_roll * (select count(*) from public.profiles where disabled_at is null))
   limit 1
) who on true;

-- Check it landed.
select count(*) as sales, min(sold_on) as first_day, max(sold_on) as last_day from public.sales;


-- ============================================================================
--  UNDO: removes every sale, demo and real alike. There is no way to tell them
--  apart, so only run this while the ledger is still just a sandbox.
-- ============================================================================
-- delete from public.sales;

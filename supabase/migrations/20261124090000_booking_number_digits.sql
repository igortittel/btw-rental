-- Booking numbers without the "BTW-" prefix: <year><sequence>, e.g. 20260043. The number
-- is then also the payment reference (variabilný symbol, at most 10 digits) – the same
-- digits variableSymbol() already used, so references of existing bookings do not change.

create or replace function private.next_booking_number(p_at timestamptz) returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_year integer := extract(year from p_at at time zone 'Europe/Bratislava')::integer;
  v_n integer;
begin
  insert into public.booking_counters as c (year, last_number) values (v_year, 1)
  on conflict (year) do update set last_number = c.last_number + 1
  returning last_number into v_n;
  return v_year::text || lpad(v_n::text, 4, '0');
end;
$$;

-- Existing bookings get the same digits. The number is otherwise immutable
-- (bookings_before_write), so that trigger is switched off for this one update.
alter table public.bookings disable trigger bookings_before_write;
update public.bookings set number = regexp_replace(number, '\D', '', 'g') where number ~ '\D';
alter table public.bookings enable trigger bookings_before_write;

comment on column public.bookings.number is 'Booking number = payment reference: <year><sequence>, e.g. 20260001 (at most 10 digits).';

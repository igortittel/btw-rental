# Fáza 1 – DB schéma, RLS, migrácie, seed, typy

Stav: aplikované na Supabase projekt **btw** (`wlkdhdkflbswjjdobsfs`, eu-west-1) 16. 11. 2026.

## Súbory

| Súbor | Obsah |
|---|---|
| `supabase/migrations/20261116095900_retire_prototype.sql` | odstavenie objektov prototypu; staré tabuľky presunuté do schémy `legacy_prototype` |
| `supabase/migrations/20261116100000_schema.sql` | enumy, 28 tabuliek, indexy, `EXCLUDE` obmedzenia |
| `supabase/migrations/20261116100100_functions.sql` | pomocné funkcie (schéma `private`), triggery, RPC |
| `supabase/migrations/20261116100200_rls.sql` | RLS politiky |
| `supabase/migrations/20261116100300_public_api.sql` | verejné views `public_*` |
| `supabase/migrations/20261116100400_storage.sql` | storage buckety a politiky |
| `supabase/migrations/20261116100500_drop_legacy_prototype.sql` | zmazanie testovacích dát prototypu (schéma `legacy_prototype`) |
| `supabase/seed.sql` | generovaný seed (`scripts/build-seed.py` z `supabase/seed/vehicles.json`) |
| `supabase/tests/` | stub Supabase pre lokálny Postgres + 61 testov správania |
| `types/database.ts` | typy vygenerované zo Supabase |

## Odchýlky od návrhu v zadaní (sekcia 12)

| Zadanie | Riešenie | Dôvod |
|---|---|---|
| `profiles.is_blacklisted`, `blacklist_note` | tabuľka `customer_internal` | zákazník číta vlastný riadok `profiles`; interné príznaky by sa k nemu dostali |
| `bookings.internal_note` | tabuľka `booking_notes` (autor, čas) | to isté; navyše história poznámok |
| `profiles.id` = FK na `auth.users` | bez FK | anonymizácia ruší Auth účet, profil s dokladmi musí zostať |
| `email_log.to` | `recipient` | `to` je rezervované slovo |
| `features.group` | `group_key` + štvrtá skupina `included` | rezervované slovo; „služby v cene“ |
| – | `bookings.blocked_until`, `buffer_minutes` | `return_at + buffer` nie je immutable výraz, pre `EXCLUDE` ho udržiava trigger |
| – | `bookings.customer_snapshot` | údaje zákazníka v čase rezervácie (doklady, anonymizácia) |
| – | `vehicles.variant`, `power_hp`, `gears`, `drivetrain` | údaje z importu, `variant` je súčasť slugu |
| – | `settings.is_public` | whitelist kľúčov pre `public_settings` |

## Kľúčové pravidlá vynútené v databáze

- **Dvojitá rezervácia:** `bookings_no_overlap` – `EXCLUDE USING gist (vehicle_id, tstzrange(pickup_at, blocked_until))` pre stavy `confirmed`, `modified`, `active`. Buffer (default 4 h, per vozidlo) je súčasťou rozsahu. Stav `new` neblokuje.
- **Blokácie:** potvrdená rezervácia nesmie prekrývať `availability_blocks` a naopak (triggery, chyba `23P01`).
- **Prechody stavov:** trigger povolí len `new → confirmed|cancelled`, `confirmed → modified|active|cancelled`, `modified → confirmed|cancelled`, `active → completed`. Každá zmena sa zapíše do `booking_status_history` (kto, odkiaľ, kam, poznámka).
- **Číslo rezervácie:** `BTW-RRRR-NNNN`, počítadlo per rok (`booking_counters`), rok podľa `Europe/Bratislava`.
- **Protokoly:** po podpise (`signed_at`) nemenné vrátane fotiek a poškodení; povolené je len jednorazové doplnenie `pdf_path`.
- **Audit log:** trigger na 20 tabuľkách, ukladá len zmenené stĺpce; append-only.
- **Kategórie:** rezervované slugy (`admin`, `rezervacia`, `moj-ucet`, `en`…) odmieta `CHECK`.
- **VIN:** veľké písmená a číslice bez pomlčiek (URL sa delí podľa poslednej pomlčky), unikátny.

## RLS

RLS je zapnuté na všetkých 28 tabuľkách. Roly sú v tabuľke `staff_roles` a overuje ich funkcia `private.is_staff(min_role)` – nie JWT metadáta, ktoré si používateľ vie prepísať.

| Kto | Čítanie | Zápis |
|---|---|---|
| `anon` | žiadna tabuľka; len views `public_vehicles`, `public_categories`, `public_locations`, `public_price_tiers`, `public_settings` a RPC `vehicle_availability`, `is_vehicle_available` | nič |
| zákazník | vlastný profil, vlastné rezervácie, ich doplnky, históriu stavov, súhlasy, dokumenty, **podpísané** protokoly a **schválené** vyúčtovanie | vlastný profil (okrem `type`, `email`, `anonymized_at` – stráži trigger); všetko ostatné cez server |
| `operator` | všetko prevádzkové | rezervácie (update), protokoly, interné poznámky, návrh vyúčtovania |
| `manager` | + | vozidlá, fotky, výbava, ceny, príplatky, miesta, blokácie, kategórie, zákazníci, dokumenty, vyúčtovanie, vytvorenie rezervácie |
| `owner` | + audit log | zamestnanci, nastavenia |
| `service_role` | obchádza RLS – len serverový kód (vytvorenie rezervácie s cenou spočítanou na serveri, emaily, cron) | |

Interné údaje, ktoré sa na verejné endpointy nedostanú: ŠPZ, číslo poistnej zmluvy, interné poznámky, blacklist, bankové údaje, notifikačné emaily.

Storage: `vehicle-images` verejný; `protocols`, `protocol-media`, `documents` privátne. Zákazník k privátnym súborom pristupuje len cez krátkodobé signed URL zo servera.

## Hlásenia Supabase Security Advisor (zámerné)

- **Security Definer View** (5× `public_*`): zámer – views sprístupňujú whitelist stĺpcov bez prístupu `anon` k tabuľkám (požiadavka zadania „verejné čítanie cez views / RPC“). Od 17. 11. 2026 majú API roly na views len SELECT (`20261120090000_read_only_public_views.sql`, pozri `docs/SECURITY.md`).
- **Security definer funkcie volateľné anon/authenticated**: `vehicle_availability`, `is_vehicle_available` vracajú len obsadené intervaly bez osobných údajov; `change_booking_status` si rolu overuje vnútri.
- **Leaked password protection vypnutá**: zapnúť v Supabase → Authentication (rieši Fáza 2).

## Ako overiť

Lokálne (ľubovoľný Postgres 15+):

```bash
createdb btw_test
```

```bash
for f in supabase/tests/00_supabase_stub.sql supabase/migrations/*.sql supabase/seed.sql supabase/tests/01_behaviour.sql; do psql -v ON_ERROR_STOP=1 -d btw_test -f "$f"; done
```

Na Supabase (SQL editor): `select name, category_slug, price_from_cents from public_vehicles order by sort_order;` vráti 7 vozidiel po 7 900 centov.

## Čo ešte nie je

- **Fotky nie sú v Supabase Storage.** V DB sú cesty (`<slug>/main.webp`…), súbory ležia v `supabase/seed/images/`. Nahrá ich skript vo Fáze 2/3 – potrebuje `SUPABASE_SERVICE_ROLE_KEY`.
- **Owner účet** (`scripts/seed-owner.ts`) je súčasť Fázy 2.
- VIN (`TESTBTW0000000001`–`7`) a ŠPZ (`BT001TW`–`BT007TW`) sú testovacie hodnoty.

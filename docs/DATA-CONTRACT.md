# DATA-CONTRACT – BTW

Jediný zdroj pravdy o tom, ako si btw-admin, btw-rental a btw-web vymieňajú dáta.
Originál žije v `btw-admin/docs/DATA-CONTRACT.md`. V btw-rental a btw-web je jeho kópia v `docs/DATA-CONTRACT.md` – needitovať, len synchronizovať z btw-admin.

Verzia: **0.2** (návrh, objekty z bodov 3–5 vzniknú vo Fáze 2) · Supabase projekt: **btw** (jeden pre celú firmu)

| Verzia | Dátum | Zmena |
|---|---|---|
| 0.1 | 2026-11 | prvý návrh |
| 0.2 | 2026-11-28 | výnimka `service_role` pre rental (7), sekcia prihlásený zákazník (3.2), `v_public_categories` / `v_public_locations` / `v_public_settings`, ceny vo `v_public_vehicles`, bucket `vehicle-images`, kanonická doména `https://btw.sk`, roly = úroveň + moduly (8), 3 triedy transferu (9) |

---

## 1. Architektúra

| Repo | Vercel projekt | Doména | Úloha |
|---|---|---|---|
| btw-admin | btw-admin | admin.btw.sk | Správa celej firmy (2FA). **Vlastník schémy DB.** |
| btw-rental | btw-rental | rental.btw.sk | Verejný web a rezervácie prenájmu, klientska zóna |
| btw-web | btw-web | btw.sk | Hlavný web, preprava osôb, zoznam vozidiel |

Kanonická doména hlavného webu je **`https://btw.sk`** (bez `www`). Všetky URL v kontrakte (`booking_url`, odkazy z e-mailov) používajú tento tvar.

Pravidlá:
- Migrácie (`supabase/migrations`) existujú **iba v btw-admin**.
- btw-rental a btw-web **nečítajú tabuľky priamo**. Čítajú len pohľady a volajú len funkcie z tohto dokumentu.
- `service_role` kľúč má btw-admin (len na serveri). **Jediná výnimka** je btw-rental pre toky v bode 7. btw-web ho nemá nikdy.
- Weby používajú publishable/anon kľúč, rental navyše prihláseného klienta (zákaznícka zóna).
- Na základných tabuľkách je zapnuté RLS. Rola `anon` k nim nemá prístup, má ho iba ku kontraktovým objektom.

## 2. Moduly v databáze

| Modul | Obsah | Kto spravuje |
|---|---|---|
| Spoločné | zákazníci (firma / objednávateľ / pasažier), vozidlá, zamestnanci a ich moduly, audit log | admin |
| Prenájom (`rental`) | rezervácie, cenníky, protokoly, výbava, platby, doklady | admin (+ rental zapisuje rezervácie cez RPC) |
| Preprava (`transfer`) | triedy transferu, objednávky jázd, vodiči, cenník prepravy | admin (+ btw.sk zapisuje objednávky cez RPC) |

Vozidlo je jedna tabuľka pre oba moduly (`vehicles.for_rental`, `vehicles.for_transfer`). Dostupnosť sa kontroluje naprieč modulmi, aby jedno auto nebolo v rovnakom čase v prenájme aj na jazde.

Zákazník transferu nemá prihlásenie. Ukladá sa tak, aby sa dalo doplniť neskôr: e-mail je identifikátor, väzba na `auth.users` je voliteľná.

## 3. Čítanie (views)

Stĺpce sa dopĺňajú (nový stĺpec nič nerozbije). **Premenovanie alebo zmazanie stĺpca je breaking change** – viď bod 6.
Ceny sú vždy v centoch s DPH (`*_cents`, integer), čas `timestamptz`.

### 3.1 Verejné (rola `anon`)

| Objekt | Používa | Účel |
|---|---|---|
| `v_public_vehicles` | rental, web | Autá na prenájom: id, slug, VIN, názov, kategória (slug + názov), technické údaje, osoby, batožina, prevodovka, palivo, popis, **ceny** (`price_from_cents`, `prices` = pásma `min_days`/`max_days`/`price_per_day_cents`), depozit a limity, príplatky, výbava, fotky, `detail_url` (absolútna URL detailu na rental.btw.sk) |
| `v_public_categories` | rental, web | Aktívne kategórie áut (slug, názov SK/EN, poradie) |
| `v_public_locations` | rental | Miesta odovzdania a vrátenia (bez interných poznámok) |
| `v_public_settings` | rental, web | Verejné nastavenia (`settings.is_public`): kontakty, podmienky prenájmu, predvolené limity |
| `v_public_transport_classes` | web | Business Class, First Class, Business Van: slug, názov, popis (príklady áut), max. osôb, max. batožín, fotka, poradie, `booking_url` (`https://btw.sk/rezervacie?trieda={slug}`) |
| `v_public_vehicle_availability` | rental | Obsadené intervaly áut pre kalendár (vehicle_id, od, do) – bez osobných údajov, bez nepotvrdených rezervácií, vrátane jázd prepravy |

Nikdy v nich nie je ŠPZ, interná poznámka, blacklist ani osobný údaj.

### 3.2 Prihlásený zákazník (rola `authenticated`, len vlastné riadky)

Zákaznícka zóna na rental.btw.sk. Každý objekt vracia iba riadky, kde zákazník = `auth.uid()`.

| Objekt | Účel |
|---|---|
| `v_my_profile` | vlastný profil (meno, kontakt, fakturačné údaje, súhlasy marketingu, IBAN na vrátenie) |
| `v_my_bookings` | zoznam a detail vlastných rezervácií vrátane cenového snapshotu, príplatkov, stavu platieb a platobných pokynov (IBAN firmy) |
| `v_my_booking_documents` | doklady k vlastným rezerváciám (id, typ, číslo, suma, dátum) – súbor cez `/api/documents/[id]` |
| `v_my_booking_protocols` | podpísané protokoly k vlastným rezerváciám (bez rozpracovaných) |
| `v_my_booking_settlements` | potvrdené vyúčtovania (`approved_at` nie je prázdne) |

| RPC | Účel |
|---|---|
| `update_my_profile(...)` | úprava vlastného profilu |
| `request_my_account_deletion()` | žiadosť o vymazanie účtu |
| `cancel_my_booking(p_booking_id, p_reason)` | storno (poplatok počíta DB) |
| `update_my_booking(p_booking_id, p)` | úprava rezervácie zákazníkom (nová = prepíše, potvrdená → `modified`) |
| `my_booking_plate(p_booking_id)` | ŠPZ vlastnej rezervácie v čase pred vydaním |

## 4. Zápis (RPC)

| Funkcia | Volá | Účel |
|---|---|---|
| `create_rental_booking(...)` | rental (anon alebo prihlásený) | Vytvorí rezerváciu prenájmu, overí dostupnosť a cenu, zapíše súhlasy. Bez `service_role`. |
| `create_transport_order(...)` | web (anon) | Vytvorí objednávku prepravy z formulára btw.sk (zákazník podľa e-mailu, bez účtu) |

Funkcie validujú vstup na strane DB. Frontendy nesmú zapisovať priamo do tabuliek. Odpoveď neobsahuje interné údaje (blacklist, poznámky).

## 5. Ostatné toky

- **Fotky:** Supabase Storage, bucket **`vehicle-images`** (verejné čítanie). Nahráva iba admin. Fotky tried transferu v tom istom buckete pod `transport-classes/<slug>/`.
- **E-maily:** Resend. Servisné e-maily rentalu z `info@rental.btw.sk`.
- **Dispečerská appka:** _otvorené – rozhodne sa pred Fázou 4._

## 6. Zmena kontraktu

1. Zmena sa robí iba v btw-admin: migrácia + úprava tohto dokumentu + zvýšenie verzie.
2. Breaking change (premenovanie/zmazanie stĺpca, zmena parametrov RPC) = najprv sa pridá nová verzia (`v_public_vehicles_v2`), weby sa prepnú, potom sa stará zmaže.
3. Po zmene sa skopíruje `DATA-CONTRACT.md` a vygenerované typy (`types/supabase.ts`) do btw-rental a btw-web.

## 7. Výnimka: `service_role` v btw-rental

Rental smie použiť `service_role` **iba na serveri** (`import 'server-only'`, nikdy `NEXT_PUBLIC_*`) a **iba** pre tieto toky. Nový súbor alebo nová tabuľka = zmena kontraktu.

| Tok | Súbory (btw-rental) | Objekty |
|---|---|---|
| Tvorba účtu zákazníka pri rezervácii | `lib/booking/actions.ts` | Auth Admin API (`createUser`, `deleteUser` pri zlyhaní), `profiles` (vytvorenie / dohľadanie podľa e-mailu) |
| Odkazy na nastavenie a obnovu hesla | `lib/auth/tokens.ts`, `lib/auth/actions.ts` | `auth_tokens`, RPC `consume_auth_token`, Auth Admin API (`updateUserById` – heslo), `profiles.password_set` |
| Rate limit | `lib/auth/rate-limit.ts` | RPC `check_rate_limit` (`rate_limits`) |
| Odoslanie e-mailov | `lib/email/send.ts`, `lib/booking/notify.ts`, `lib/account/actions.ts` (len volanie notify) | zápis `email_log`; čítanie podkladov pre e-mail cez RPC `email_booking_context(p_booking_id)` (len `service_role`, vznikne vo Fáze 2) |
| Klient | `lib/supabase/admin.ts` | – |

Všetko ostatné (rezervácia, úprava a storno, čítanie zóny, nastavenia, blacklist) ide cez body 3 a 4. Blacklist sa vyhodnocuje v databáze a do rentalu sa nevracia.

## 8. Zamestnanci, roly a moduly

- Úroveň (`staff_roles.role`): **`owner > manager > operator`** (hierarchia, overuje `private.is_staff(min_role, module)`).
- Moduly (`staff_roles.modules`): `rental`, `transfer`. **Owner má všetky moduly** bez ohľadu na stĺpec.
- Dispečer = `operator` alebo `manager` s modulom `transfer`. Prenájom = s modulom `rental`.
- Spoločné dáta (vozidlá, zákazníci) vidí zamestnanec s ktorýmkoľvek modulom; nastavenia firmy, zamestnancov a audit log len owner.
- Prístup do admin.btw.sk vždy len s overeným druhým faktorom (`aal2`).

## 9. Triedy transferu (počiatočné dáta)

| slug | Názov | Popis | Max. osôb | Max. batožín |
|---|---|---|---|---|
| `business-class` | Business Class | Mercedes-Benz E-Class, BMW 5 a iné | 4 | 3 |
| `first-class` | First Class | Mercedes-Benz S-Class, BMW 7 a iné | 4 | 3 |
| `business-van` | Business Van | Mercedes-Benz V-Class, Hyundai Staria Luxury a iné | 8 | 3 |

Staré adresy na btw.sk (WordPress) → 301 na `booking_url`: `mercedes-benz-e-class-bmw-5-a-ine` → `business-class`, `mercedes-benz-s-class-bmw-5-a-ine` → `first-class`, `mercedes-benz-v-class-a-ine` → `business-van`.

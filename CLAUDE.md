# BTW Rental – pracovné poznámky pre Claude Code

Rezervačný systém pre prenájom vozidiel BY THE WAVE, s.r.o. (rental.btw.sk).

- **Zadanie:** [`docs/ZADANIE.md`](docs/ZADANIE.md) – čítaj ako prvé, najmä sekciu 14 (fázy).
- **Čo je hotové a prečo:** `docs/ANALYSIS.md` (Fáza 0), `docs/PHASE-1.md` … `docs/PHASE-7.md`.

## Stav

| Fáza | Stav |
|---|---|
| 0 Analýza, import vozidiel, design tokeny | hotová, schválená |
| 1 DB schéma, RLS, seed, typy | hotová, schválená |
| 2 Auth, role, odkaz na nastavenie hesla | hotová, schválená |
| 3 Admin: vozidlá, fotky, výbava, ceny, príplatky, miesta, blokácie, nastavenia | hotová, schválená |
| 4 Verejný katalóg, detail, kalendár dostupnosti | hotová, schválená |
| 5 Rezervačný formulár, `calculatePrice`, testy, emaily 1–2 | hotová, schválená |
| 6 Admin rezervácie: zoznam, timeline, detail, stavy, manuálna rezervácia, emaily 3 a 6 | hotová, schválená, v `main` |
| 7 Zákaznícka zóna: countdown, detail, úprava → `modified`, storno, profil; e-maily 4–5 a schvaľovanie úprav | hotová, schválená, v `main` |
| 8 Protokoly (schéma poškodení, fotky, podpisy, PDF), vyúčtovanie | **ďalšia na rade** |
| 9–10 | nezačaté |

Pri dokončení fázy aktualizuj túto tabuľku a napíš `docs/PHASE-N.md`.

## Ako pracujeme

- **Po každej fáze sa zastav**, zhrň zmeny, napíš, ako to otestovať na preview, a počkaj na schválenie.
- Komunikácia a UI texty po slovensky; kód, tabuľky a premenné po anglicky.
- Vývoj na vetve, ktorú určí session; push → Vercel preview. PR nevytváraj, kým o to používateľ nepožiada. Fázy 0–7 sú zlúčené v `main` (PR #1–#3); novšie fázy sú na vetve session, kým klient nepožiada o zlúčenie.
- Repo `igortittel/btw-web` nečítaj ani neupravuj.
- Heslá a kľúče nikdy do kódu, dokumentácie ani commitu.

## Rozhodnutia prijaté nad rámec zadania

- **Existujúci prototyp bol odstránený**, schéma je postavená nanovo.
- **Tlačidlá:** biely text na zlatej (voľba klienta, hoci nespĺňa WCAG AA 4,5 : 1).
- **Názvy vozidiel** v oficiálnom zápise (`Mercedes-Benz E 220 d`).
- **Výbava má štyri skupiny:** Komfort, Technické, Bezpečnosť a „V cene prenájmu“.
- **VIN a ŠPZ v seede sú testovacie** (`TESTBTW0000000001`–`7`, `BT001TW`–`BT007TW`); reálne doplní klient v admine.
- **Odkaz na nastavenie hesla** používa vlastné tokeny (`auth_tokens`), lebo Supabase tokeny platia najviac 24 h a zadanie žiada 72 h.
- **Interné údaje sú v samostatných tabuľkách** (`customer_internal`, `booking_notes`), nie ako stĺpce v `profiles` / `bookings`.
- **Presmerovanie na kanonickú URL vozidla je 308**, nie 301 (obmedzenie Next.js App Routera).
- **Funkcie na Verceli bežia v `dub1`** (`vercel.json`), vedľa Supabase v `eu-west-1`.
- **Seed skripty (owner, fotky) bežia pred každým buildom** (`vercel-build`), sú idempotentné.
- **Dni prenájmu sa počítajú podľa miestnych hodín** (nie uplynutého času), aby zmena letného/zimného času nepridala ani neubrala deň.
- **Strop príplatku (`max_charge`) platí na jeden kus** za celý prenájom.
- **Neprihlásený formulár neprepisuje profil existujúceho účtu**; údaje z formulára sú v `bookings.customer_snapshot`.
- **Rezervácia sa zapisuje cez RPC `create_booking`** (jedna transakcia, len service role).
- **Nepotvrdené rezervácie sa verejne nezobrazujú** (klient si „čaká na potvrdenie“ v kalendári neželá); `/api/availability` vracia len obsadené intervaly.
- **Kategórie v katalógu sú jednovýberové** (čipy); URL `?kategoria=a,b` sa stále číta, ale UI ju nevytvára.
- **Pristavenie na vlastnú adresu:** adresa v `bookings.pickup_custom_address` / `return_custom_address`, štandardné miesto ostáva ako východisko. **V Bratislave bez poplatku; mimo Bratislavy ručné spracovanie** (BTW zákazníka kontaktuje) – rozhodnutie klienta, žiadny automatický výpočet podľa km. Príznak je v `price_snapshot.delivery_outside_city`.
- **Stavy v admine:** jedným ťuknutím Potvrdiť / Vydať / Ukončiť (`NEXT_STATUSES`), zrušenie zvlášť kvôli storno poplatku (`cancelBookingAction`, `lib/cancellation.ts`). Prechody stráži databáza; `lib/booking-status.ts` je ich kópia pre UI.
- **Úprava rezervácie má tri režimy ceny** – ponechať (predvolené), podľa cenníka, vlastná s dôvodom. Úprava nikdy potichu neprepočíta dohodnutú cenu.
- **Úprava zákazníkom:** nová rezervácia sa prepíše, potvrdená ide do `modified` s návrhom v `pending_change` (riadok drží pôvodné údaje a blokuje pôvodný termín). Schválenie / zamietnutie: `resolve_booking_change`. Pri ručne dohodnutej cene a po lehote sa online upraviť nedá (`customerEditBlock`).
- **Storno poplatok pri storne zákazníkom počíta databáza** (`private.cancellation_fee_cents`), `lib/cancellation.ts` je to isté pravidlo pre zobrazenie a pre zamestnanca. Pri zmene pravidla treba zmeniť obe a testy na oboch stranách.
- **Žiadosť o vymazanie účtu** sa len zaznamená (`profiles.deletion_requested_at`); vykonanie je Fáza 9.
- **Server akcie, po ktorých sa má prejsť inam, vracajú `redirectTo`** a klient urobí `window.location.assign`. `redirect()` v akcii volanej cez `await` s `.catch` sa na klientovi prejaví ako zamietnutý promise a navigácia sa stratí (chyba z Fázy 5).
- **Odkazy s kotvou (`#sekcia`) na inú stránku píš ako `<a href>`**, nie `next/link` – klientska navigácia na prednačítanú trasu s kotvou nedobehne.
- **`useFormAction` posiela aj stlačené tlačidlo** (`name`/`value`); formuláre s viacerými tlačidlami sa na to spoliehajú. Server pri neznámej hodnote musí vrátiť chybu, nie zvoliť predvolenú vetvu.
- **Admin navigácia:** `components/admin/admin-nav.tsx` – horná lišta + „Viac“, na mobile spodná lišta. Nové sekcie pridávaj do `primary` / `secondary` v `app/admin/layout.tsx`.

## Čo ešte chýba od klienta

- `RESEND_API_KEY` + overená doména `rental.btw.sk` v Resend → dovtedy sa e-maily neodosielajú (zapíšu sa do `email_log` ako `failed`; zamestnancom vie odkaz na heslo vygenerovať owner v admine).
- Cloudflare Turnstile: `NEXT_PUBLIC_TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY` → po nastavení oboch sa zapne sám (formulár aj prihlásenie); dovtedy honeypot, minimálny čas vyplnenia a rate limit.
- IBAN / SWIFT (v Nastaveniach je placeholder – kým ním je, potvrdzujúci e-mail bankové údaje neukáže), DNS pre `rental.btw.sk`.
- Odložené zo skorších fáz: 2FA pre zamestnancov, úprava číselníka výbavy, alt texty fotiek, obrazovka audit logu (Fáza 9), EN preklady obsahu a Lighthouse (Fáza 10).

## Infraštruktúra

| Čo | Hodnota |
|---|---|
| Supabase projekt | `btw`, ref `wlkdhdkflbswjjdobsfs`, eu-west-1 (cez Supabase MCP konektor) |
| Vercel | tím `igortittels-projects` (`team_tKyxRtkRIInsaFXlnwp9EpJf`), projekt `btw-rental` |
| Vercel env | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_SITE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SEED_OWNER_PASSWORD` |
| Owner účet | firemný e-mail BTW (hodnota je v `scripts/seed-owner.ts`) |
| Cloud prostredie | `btw-rental` – povolené hosty: `www.btw.sk`, `btw.sk`, `wp.btw.sk`, `wlkdhdkflbswjjdobsfs.supabase.co` |

## Príkazy

```bash
npm install
```

```bash
npm test
```

```bash
npm run typecheck
```

```bash
npm run build
```

`npm run build` je čistý build; `npm run vercel-build` navyše spúšťa seed skripty a je určený pre Vercel.

## Databáza

- Migrácie sú v `supabase/migrations/`. **Každú novú migráciu ulož do repa aj aplikuj na Supabase** (MCP `apply_migration`), potom obnov `types/database.ts` (MCP `generate_typescript_types`).
- Seed: `supabase/seed.sql` sa generuje (`python3 scripts/build-seed.py`), ručne ho neupravuj.
- SQL testy správania: `supabase/tests/` – bežia na lokálnom Postgrese so stubom Supabase, postup je v `docs/PHASE-1.md` (Postgres 16 je v cloud prostredí v `/usr/lib/postgresql/16/bin`; dátový adresár musí vlastniť používateľ `postgres`). Ak je výstup `generate_typescript_types` príliš veľký, doplň novú funkciu do `types/database.ts` ručne v rovnakom tvare. Zmenu existujúcej funkcie možno na Supabase aplikovať aj `do` blokom, ktorý upraví `pg_get_functiondef()` a overí, že hľadaný text našiel; v repe musí byť vždy celá definícia.
- Roly sa overujú cez `private.is_staff(min_role)` nad tabuľkou `staff_roles`, nikdy cez JWT metadáta.
- Verejný web číta len views `public_*` a RPC (`lib/catalog.ts`); na verejné endpointy nesmie ísť ŠPZ, interné poznámky ani blacklist.

## Konvencie v kóde

- **Peniaze** v centoch (integer, s DPH). Vstup a výstup cez `lib/format.ts` (`parseEuroToCents`, `formatEuro`).
- **Čas** ako `timestamptz`, zobrazenie a vstupy v `Europe/Bratislava` cez `lib/time.ts` (`zonedLocalToUtc`, `formatDateTime`).
- **Nastavenia** cez `lib/settings.ts` (typovaná schéma + defaulty zo zadania).
- **Admin akcie** cez `staffAction(minRole, …)` z `lib/admin/action.ts` – kontroluje rolu, používa session klienta (RLS + audit log) a po úspechu obnoví cache katalógu.
- **Dátumové polia** cez `DateField` (`components/ui/date-field.tsx`) a selecty s `SELECT_CHEVRON_STYLE` – inak na iOS pretekajú a šípky sú mimo poľa.
- **Krížové pravidlá formulára** (telefón podľa predvoľby, firma) sú v `customerRuleErrors()`; Zod `superRefine` beží až po platnosti všetkých polí, preto ju formulár volá aj priamo.
- **Formuláre** cez `ActionForm` (`components/admin/ui.tsx`) alebo `useFormAction` – nesmú po chybe stratiť vyplnené údaje.
- **Service role klient** (`lib/supabase/admin.ts`) len v serverovom kóde a až po kontrole oprávnení.
- **URL vozidla** cez `lib/vehicle-url.ts`; vozidlo sa hľadá podľa VIN.
- **Cena** vždy cez `calculatePrice()` z `lib/pricing.ts` (aj pre manuálnu rezerváciu v admine); klient cenu neposiela.
- **E-maily** sú React Email šablóny v `emails/`, odosielanie cez `lib/email/booking-emails.ts` → `sendEmail` (zápis do `email_log`). E-maily k uloženej rezervácii skladá `lib/booking/notify.ts` z jej snapshotu. Náhľad: `/admin/emaily` – novú šablónu tam vždy pridaj.
- **Záznam rezervácie** (stĺpce + cenový snapshot) vždy cez `buildBookingRecord()` z `lib/booking/record.ts` – používa ho web, manuálna rezervácia aj úprava.
- **Zoznam rezervácií a export** zdieľajú filtre v `lib/booking/list-query.ts`.
- **Zákaznícka zóna** číta cez session klienta (RLS); vozidlo berie z verejného katalógu, lebo zákazník tabuľku `vehicles` nečíta. Akcie sú v `lib/account/actions.ts`; e-maily z nich idú cez service role v `after()`.
- **Preklady** v `messages/sk.json` a `messages/en.json`; admin je len po slovensky a mimo locale routingu.
- Žiadne nové UI knižnice s vlastným vizuálom; Radix primitíva sú v poriadku.

## Overovanie v prehliadači

Lokálne nie je `SUPABASE_SERVICE_ROLE_KEY` (vo Verceli je Sensitive a nedá sa prečítať), takže toky, ktoré ho potrebujú (nastavenie hesla cez odkaz, pozvanie zamestnanca, vytvorenie rezervácie cez service role), sa lokálne otestovať nedajú – povedz to otvorene a nechaj ich overiť klienta na preview.

Čo sa lokálne dá:

1. `.env.local` s `NEXT_PUBLIC_SUPABASE_URL` a publishable kľúčom (MCP `get_publishable_keys`).
2. `npm run build`, potom `next start`. V cloud prostredí musí serverový `fetch` ísť cez proxy: spusti build aj server s `NODE_USE_ENV_PROXY=1` a `NODE_EXTRA_CA_CERTS=/root/.ccr/ca-bundle.crt`. Pred novým štartom zabi aj proces `next-server`, inak ostane obsadený port.
3. Prihlásenie testuj dočasnými účtami `e2e-…@btw-rental.test` vytvorenými cez SQL (`auth.users` + `auth.identities`, heslo cez `extensions.crypt`), rolu im daj v `staff_roles`. **Po teste ich zmaž** (aj z `profiles`) a klientovi o nich povedz.
4. Preview nasadenia sú za Vercel prihlásením, Playwrightom sa na ne nedostaneš.

Audit log je nemazateľný; testovacie zápisy v ňom ostávajú.

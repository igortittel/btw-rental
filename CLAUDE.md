# BTW Rental – pracovné poznámky pre Claude Code

Rezervačný systém pre prenájom vozidiel BY THE WAVE, s.r.o. (rental.btw.sk).

- **Zadanie:** [`docs/ZADANIE.md`](docs/ZADANIE.md) – čítaj ako prvé, najmä sekciu 14 (fázy).
- **Čo je hotové a prečo:** `docs/ANALYSIS.md` (Fáza 0), `docs/PHASE-1.md` … `docs/PHASE-10.md`.
- **Pred spustením:** [`docs/RELEASE-CHECKLIST.md`](docs/RELEASE-CHECKLIST.md). Vercel Hobby a Supabase Free stačia, kým sa web nezverejní (rozhodnutie klienta 19. 11. 2026); pred ostrým spustením to prehodnotiť.

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
| 8 Protokoly (schéma poškodení, fotky, podpisy, PDF), vyúčtovanie, e-maily 8 a 10 | hotová, schválená, v `main` (klient ešte testuje preberací protokol a vyúčtovanie) |
| 9 Platby a depozit, doklady, denný cron, zákazníci + GDPR, audit log, 2FA | hotová, schválená, v `main` (18. 11. 2026) |
| 10 EN, SEO, doména, E2E, výkon, bezpečnostný review | hotová, schválená, v `main` (19. 11. 2026) – ostáva DNS a kroky z `docs/RELEASE-CHECKLIST.md` |

Pri dokončení fázy aktualizuj túto tabuľku a napíš `docs/PHASE-N.md`.

## Ako pracujeme

- **Po každej fáze sa zastav**, zhrň zmeny, napíš, ako to otestovať na preview, a počkaj na schválenie.
- Komunikácia a UI texty po slovensky; kód, tabuľky a premenné po anglicky.
- Vývoj na vetve, ktorú určí session; push → Vercel preview. PR nevytváraj, kým o to používateľ nepožiada. Fázy 0–8 sú zlúčené v `main` (PR #1–#5), Fázy 9 a 10 priamym pushom na `main` (na žiadosť klienta); ďalšie zmeny sú na vetve session, kým klient nepožiada o zlúčenie.
- Repo `igortittel/btw-web` nečítaj ani neupravuj.
- Heslá a kľúče nikdy do kódu, dokumentácie ani commitu.

## Rozhodnutia prijaté nad rámec zadania

- **Existujúci prototyp bol odstránený**, schéma je postavená nanovo.
- **Tlačidlá:** biely text na zlatej (voľba klienta, hoci nespĺňa WCAG AA 4,5 : 1; potvrdené znova vo Fáze 10).
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
- **Protokol mení stav rezervácie:** podpis odovzdávacieho → Prebiehajúca, preberacieho → Ukončená (`sign_protocol`). Rýchle akcie „Odovzdať / Prevziať vozidlo“ otvárajú protokol; zmena stavu bez protokolu je len výnimka v detaile. Opravná verzia stav nemení.
- **Podpísaný protokol je nemenný** (triggery z Fázy 1); oprava = nová verzia so `supersedes_id`, platná je najvyššia podpísaná. Po podpise sa smie len raz pripojiť `pdf_path`.
- **PDF protokolu** cez `@react-pdf/renderer` (`lib/pdf/`), písmo a logo vložené v `lib/pdf/assets.generated.ts`. pdfkit treba na Verceli pribaliť cez `outputFileTracingIncludes` v `next.config.js`, inak PDF zlyhá.
- **Palivo** sa zadáva v osminách, ukladá v % (`eighthsToPercent`).
- **Vyúčtovanie:** meškanie = každý ďalší začatý deň po tolerancii × denná sadzba rezervácie (rovnaké počítanie dní ako cena); palivo zadáva zamestnanec; každé nové poškodenie má vlastnú sumu (`settlements.damage_items`). Zákazník vidí len potvrdené (`approved_at`); upravuje a potvrdzuje manager+.
- **E-mail 10 má dve časti:** preberací protokol s PDF hneď po podpise, vyúčtovanie až po jeho potvrdení.
- **Uniknuté heslá** kontroluje aplikácia (`lib/auth/pwned.ts`, HIBP k-anonymita, pri výpadku prijme), lebo Supabase „Leaked password protection“ nie je na pláne dostupná. Každé nové miesto, kde sa nastavuje heslo, ju musí volať. Verejná registrácia v Supabase Auth je vypnutá.
- **Platby:** zaznamenanie cez RPC `record_payment` (operator+), vrátenie depozitu `record_deposit_return` a vrátenie platby `record_rental_refund` (manager+, depozit až po potvrdenom vyúčtovaní alebo storne), oprava `undo_payment` (manager+). Ukladá sa **zaplatená suma** (`rental_paid_cents`, `deposit_received_cents`), lebo cena sa po úhrade môže zmeniť: doplatok / preplatok = cena − (zaplatené − vrátené). Rovnaké pravidlo je v `lib/payment.ts` (`rentalOutstandingCents`, `missingPayments`…) aj v databáze (`private.rental_outstanding_cents`, `sign_protocol`). Nikdy neodvodzuj „uhradené“ len zo stavu.
- **Doklady:** PDF nahráva prehliadač priamo do bucketu `documents/<booking_id>/<uuid>.pdf`, server akcia `createDocumentAction` overí veľkosť a hlavičku PDF a zapíše riadok; inak súbor zmaže. Sťahovanie cez `/api/documents/[id]` (RLS). Fakturačný systém iKros: len rozhranie `lib/invoicing/provider.ts`.
- **Denný cron:** `vercel.json` `0 5 * * *` → `/api/cron/daily` (CRON_SECRET). E-maily 7, 9, 12 sa pred odoslaním „zaberú“ v stĺpcoch rezervácie, takže nič nejde dvakrát. Výsledok v `cron_runs`.
- **2FA (TOTP) pre všetkých zamestnancov:** admin layout pri `aal1` ukáže krok 2FA namiesto stránky; `getStaff()` vyžaduje `aal2`; v databáze `private.is_staff()` podľa `staff_mfa_enforced`. Testovacie účty zamestnancov preto potrebujú TOTP (Playwright: kód z tajomstva zobrazeného pri registrácii).
- **GDPR:** `anonymize_customer` (manager+) – bez rezervácií vymaže, inak anonymizuje profil, snapshoty rezervácií, súhlasy (IP), e-mail log a interné údaje; Auth účet potom zmaže server. Audit vypína `app.skip_audit` a zapíše jeden záznam bez osobných údajov. Zmeny `profiles` od zamestnanca sa auditujú bez hodnôt (trigger s argumentom `redact`).
- **Blacklist** sa porovnáva aj podľa e-mailu a telefónu (`lib/customers/blacklist.ts`) – detail a zoznam rezervácií, e-mail 2.
- **Kľúče v zoznamoch nesmú byť popisky, ktoré sa môžu opakovať** (napr. typ e-mailu) – duplicitné kľúče rozbili obnovu detailu rezervácie po akcii.
- **Next 16** (Fáza 10): Next 15.5 pribaľoval React 19.2-canary, ktorého plánovač po server akcii občas stratil prebudenie („Ukladám…“ navždy na detaile rezervácie). `middleware.ts` je `proxy.ts`, konfigurácia `next.config.mjs`, build `next build --webpack` (pdfkit). V server akciách `updateTag`, nie `revalidateTag`. Pri chybe „obnova po akcii nedobehne“ najprv over verziu Reactu v `node_modules/next/dist/compiled/react-dom`.
- **CSP s nonce** (`lib/csp.ts`, `proxy.ts`): skripty len s nonce + `'strict-dynamic'`. Nový externý zdroj (skript, iframe, fetch z prehliadača, obrázky) treba pridať do `buildCsp`, inak ho prehliadač zablokuje. `<script type="application/ld+json">` nonce nepotrebuje.
- **Metadáta v `<head>`** (`htmlLimitedBots: /.*/` v `next.config.mjs`) – Next by ich inak streamoval do `<body>` a Google by ignoroval canonical a hreflang.
- **Lehoty uchovávania** (`lib/retention.ts`, denný cron): e-mail log 12 mesiacov, `cron_runs` 30 dní, odkazy na heslo 7 dní, rate limit 1 deň, audit log natrvalo (rozhodnutie klienta 19. 11. 2026).
- **Výbava** sa spravuje v Admin → Viac → Výbava (`app/admin/vybava`), skupiny v `lib/features.ts`; zmazať sa dá len nepoužitá položka.
- **`Intl.DateTimeFormat` nevytváraj v cykle** – je drahý; `lib/time.ts` ho cachuje (kalendár ho predtým vytváral stovky krát a blokoval detail vozidla 2 s).
- **ESLint pravidlá React Hooks 7:** žiadny `setState` v efekte (uprav stav počas renderu), žiadne `ref.current =` v renderi (`useLayoutEffect`), žiadne `Date.now()` v renderi. Výnimky len s komentárom prečo.
- **E2E (Playwright)** v GitHub Actions proti lokálnemu Supabase (`supabase/config.toml`) – nikdy proti produkcii (`tests/e2e/support.ts` to stráži). Prihlásenie zamestnanca: TOTP z tajomstva zobrazeného pri registrácii 2FA; odkaz na heslo admin zobrazí, keď nie je e-mailová služba.
- **Číslo rezervácie = variabilný symbol:** `20260043` (rok + poradie, bez „BTW-“, max. 10 číslic) – migrácia `20261124090000_booking_number_digits.sql` mení `next_booking_number` a prečísluje existujúce. Ďakovná stránka prijíma aj starý tvar `BTW-…`. Aplikovaná v Supabase 22. 11. 2026 po nasadení `main` (DB zdieľa produkcia aj preview, preto až po nasadení kódu, ktorý nový tvar prijíma).
- **Platba na mieste:** verejný formulár ponúka len `transfer` a `cash`; `cash` sa zobrazuje ako „Platba na mieste (hotovosť alebo terminál)“. `terminal` ostáva v enume na zaznamenanie skutočnej úhrady v admine.
- **Cesta do zahraničia je povinná otázka** (Áno / Nie, kvôli poisteniu), pri „Áno“ sú povinné krajiny (`abroadRuleErrors` v `lib/booking/schema.ts`). Koncept formulára je `btw-booking-draft-v2`.
- **Dátum narodenia sa píše** (`TypedDateInput`, DD.MM.RRRR), nie vyberá v kalendári.
- **Filter počtu miest je presná zhoda** (5 / 7 / 8), nie „5+“.
- **Hlavička:** bez kategórií a bez odkazu na btw.sk (ten je v pätičke s Prepravou osôb a Transferom na Schwechat); na mobile je prihlásenie / Môj účet / jazyk len v hamburgeri.
- **Admin navigácia:** `components/admin/admin-nav.tsx` – horná lišta + „Viac“, na mobile spodná lišta. Nové sekcie pridávaj do `primary` / `secondary` v `app/admin/layout.tsx`.

## Čo ešte chýba od klienta

- Cloudflare Turnstile: `NEXT_PUBLIC_TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY` → po nastavení oboch sa zapne sám (formulár aj prihlásenie); dovtedy honeypot, minimálny čas vyplnenia a rate limit. CSP Turnstile povoľuje.
- **Reálny IBAN pred spustením:** v Nastaveniach je testovací `SK73 1100 0000 0029 0000 0042` (TATRSKBX, `is_placeholder: false`, aby sa dali testovať platobné pokyny). DNS pre `rental.btw.sk`.
- **DNS:** CNAME `rental` → `8fcb7bf5d840bb7c.vercel-dns-017.com.` vo Websupporte (doména je už vo Verceli pridaná). Potom `NEXT_PUBLIC_SITE_URL`, presmerovanie `btw-rental.vercel.app` a Supabase Auth URL – viď `docs/RELEASE-CHECKLIST.md`.
- Pred spustením celkové zmazanie testovacích údajov (klient povie kedy).
- **2FA v databáze** (`settings.staff_mfa_enforced`) a **úhrada pred odovzdaním** (`require_payment_before_pickup`) sú zapnuté od nasadenia Fázy 9 do produkcie. Kto ich vypne, oslabí ochranu – 2FA vypínať len pri výpadku Supabase MFA.

## Údaje od klienta

- **Fakturačný systém je iKros** (nie SuperFaktúra) – vo Fáze 9 len rozhranie, bez napojenia.
- **Google recenzie:** `settings.google_review_url` = `https://g.page/r/CfK31p1klMkpEBM/review`, e-mail 12 po `review_request_days` (3) dňoch.
- **Resend:** doména `rental.btw.sk` overená, `RESEND_API_KEY` je vo Verceli (Production + Preview).

## Infraštruktúra

| Čo | Hodnota |
|---|---|
| Supabase projekt | `btw`, ref `wlkdhdkflbswjjdobsfs`, eu-west-1 (cez Supabase MCP konektor) |
| Vercel | tím `igortittels-projects` (`team_tKyxRtkRIInsaFXlnwp9EpJf`), projekt `btw-rental` |
| Vercel env | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_SITE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SEED_OWNER_PASSWORD`, `RESEND_API_KEY`, `CRON_SECRET` (Production + Preview) |
| Owner účet | firemný e-mail BTW (hodnota je v `scripts/seed-owner.ts`) |
| Cloud prostredie | `btw-rental` – povolené hosty: `www.btw.sk`, `btw.sk`, `wp.btw.sk`, `wlkdhdkflbswjjdobsfs.supabase.co`; Docker obrazy Supabase sa tu stiahnuť nedajú → E2E len v GitHub Actions |
| Doména | `rental.btw.sk` pridaná vo Verceli; DNS btw.sk spravuje Websupport (prístup má klient) |
| CI | GitHub Actions: `Kvalita` (lint, typy, formát, unit testy), `E2E` (Playwright + lokálny Supabase) |

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

```bash
npm run lint && npm run format:check
```

E2E (Docker, lokálny Supabase) – postup v `docs/PHASE-10.md`, v CI sa spúšťajú samy.

`npm run build` je čistý build; `npm run vercel-build` navyše spúšťa seed skripty a je určený pre Vercel.

## Databáza

- Migrácie sú v `supabase/migrations/`. **Každú novú migráciu ulož do repa aj aplikuj na Supabase** (MCP `apply_migration`), potom obnov `types/database.ts` (MCP `generate_typescript_types`).
- Seed: `supabase/seed.sql` sa generuje (`python3 scripts/build-seed.py`), ručne ho neupravuj.
- SQL testy správania: `supabase/tests/` – bežia na lokálnom Postgrese so stubom Supabase, postup je v `docs/PHASE-1.md` (Postgres 16 je v cloud prostredí v `/usr/lib/postgresql/16/bin`; dátový adresár musí vlastniť používateľ `postgres`). Ak je výstup `generate_typescript_types` príliš veľký, doplň novú funkciu do `types/database.ts` ručne v rovnakom tvare. Zmenu existujúcej funkcie možno na Supabase aplikovať aj `do` blokom, ktorý upraví `pg_get_functiondef()` a overí, že hľadaný text našiel; v repe musí byť vždy celá definícia.
- Roly sa overujú cez `private.is_staff(min_role)` nad tabuľkou `staff_roles`, nikdy cez JWT metadáta.
- **Views v `public` sú len na čítanie:** predvolené práva Supabase dávajú `anon` aj zápis a views `public_*` obchádzajú RLS. Každý nový view musí mať `revoke insert, update, delete, truncate … from anon, authenticated` (vzor v `20261120090000_read_only_public_views.sql`, stráži `supabase/tests/05_security.sql`). Bezpečnostný audit: `docs/SECURITY.md`.
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
- **Protokoly:** model a pravidlá `lib/protocol/model.ts`, načítanie `lib/protocol/load.ts`, akcie `lib/protocol/actions.ts`, sprievodca `components/admin/protocol/`. Súbory v `protocol-media` vždy pod `<booking_id>/`, inak ich databáza odmietne.
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
5. Na reprodukciu chyby zamestnaneckej stránky: dočasný účet + TOTP tajomstvo z `auth.mfa_factors.secret` (len testovací účet), kód cez HMAC (vzor `totp()` v `tests/e2e/support.ts`).

Audit log je nemazateľný; testovacie zápisy v ňom ostávajú.

**Čísla rezervácií (`booking_counters`) pri mazaní testovacích dát nevracaj späť**, ak po testovacej vznikli ďalšie rezervácie – nové číslo by kolidovalo s existujúcim. Medzera v číslovaní nevadí.

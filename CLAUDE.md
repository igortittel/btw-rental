# CLAUDE.md – btw-rental (rental.btw.sk)

Verejný web prenájmu vozidiel BY THE WAVE: ponuka áut, rezervácia, klientska zóna.
Stack: Next.js na Vercel (projekt btw-rental), Supabase projekt **btw** (zdieľaný), Resend.

## Najdôležitejšie – dáta patria adminovi
- Databázu spravuje repozitár **btw-admin** (admin.btw.sk). Tento repozitár schému **nemení**.
- **Nevytváraj migrácie**, nemeň tabuľky, pohľady, RPC, RLS politiky ani Storage buckety. Žiadne SQL zápisy mimo kontraktu.
- Čítaj iba objekty z `docs/DATA-CONTRACT.md` (`v_public_vehicles`, `v_public_vehicle_availability`). Zapisuj iba cez `create_rental_booking`.
- `docs/DATA-CONTRACT.md` a `types/supabase.ts` sú kópie z btw-admin – **needituj ich**.
- Ak úloha vyžaduje zmenu dát alebo schémy (nový stĺpec, nové pole vo formulári ukladané do DB), **nezačínaj ju**. Napíš presne, čo treba upraviť v btw-admin, a skonči.
- Admin sa sem nevracia – administrácia je iba na admin.btw.sk.

## Bezpečnosť
- Iba publishable/anon kľúč a prihlásený klient. Nikdy `service_role`.
- Heslá a kľúče nikdy do kódu, dokumentácie ani commitu.

## Pravidlá prenájmu (pre texty a validácie vo formulári)
- Vodič min. 21 rokov, vodičský preukaz min. 6 mesiacov.
- Bez online platby – iba rezervácia; nájom a depozit 1 000 € sa platia zvlášť.
- Storno: zadarmo >72 h, 20 % 72–24 h, 100 % <24 h.
- Kategórie: Sedan, SUV, Limousine, Van. URL auta: `/{kategoria}/{nazov-vozidla}-{VIN}`.

## Štýl
- UI po slovensky (+ EN verzia webu). Brand: zlatá `#B88746`, čierna `#111111`, biela `#FFFFFF`, tenké zlaté linky.
- Tlačidlá: biely text na zlatej (voľba klienta, hoci nespĺňa WCAG AA 4,5 : 1).
- Názvy vozidiel v oficiálnom zápise (`Mercedes-Benz E 220 d`).
- Žiadne nové UI knižnice s vlastným vizuálom; Radix primitíva sú v poriadku.

---

## Prechodný stav (do dokončenia Fázy 2 projektu btw-admin)

Pravidlá vyššie sú **cieľový stav**. Kód ešte nie je prepnutý. Kým to btw-admin neurobí, platí:

- Repo ešte obsahuje `app/admin`, `supabase/migrations` a `types/database.ts`. **Nerozširuj ich** – admin a migrácie sa presúvajú do btw-admin (Fáza 1), potom sa tu zmažú a `/admin` → 301 na admin.btw.sk.
- Verejná časť dnes číta pohľady `public_vehicles`, `public_categories`, `public_locations`, `public_settings`, `public_price_tiers`, RPC `vehicle_availability` / `is_vehicle_available` a rezervácia ide cez `create_booking` so **service role** (`lib/supabase/admin.ts`). Toto sa vo Fáze 2 nahradí kontraktovými objektmi – nové miesta so service role nepridávaj.
- Pri rozpore medzi týmto oddielom a `docs/DATA-CONTRACT.md` vyhráva kontrakt; čo sa hneď nedá splniť, napíš ako úlohu pre btw-admin.

---

## Ako pracujeme
- **Po každej fáze sa zastav**, zhrň zmeny, napíš, ako to otestovať na preview, a počkaj na schválenie.
- Komunikácia a UI texty po slovensky; kód a premenné po anglicky.
- Vývoj na vetve, ktorú určí session; push → Vercel preview. PR nevytváraj, kým o to používateľ nepožiada. Na `main` len so súhlasom klienta.
- História projektu (fázy 0–10 pôvodného rentalu): `docs/ANALYSIS.md`, `docs/PHASE-1.md` … `docs/PHASE-10.md`, `docs/RELEASE-CHECKLIST.md`, `docs/SECURITY.md`.

## Rozhodnutia, ktoré platia pre verejný web
- **Presmerovanie na kanonickú URL vozidla je 308**, nie 301 (obmedzenie Next.js App Routera). Vozidlo sa hľadá podľa VIN; URL cez `lib/vehicle-url.ts`.
- **VIN a ŠPZ v seede sú testovacie** (`TESTBTW0000000001`–`7`). Keď klient doplní reálne VIN, zmenia sa URL detailov – staré adresy rieši presmerovanie podľa VIN/slugu, nikdy neskladaj URL natvrdo.
- **Funkcie na Verceli bežia v `dub1`** (`vercel.json`), vedľa Supabase v `eu-west-1`.
- **Dni prenájmu sa počítajú podľa miestnych hodín** (nie uplynutého času), aby zmena letného/zimného času nepridala ani neubrala deň.
- **Cena** vždy cez `calculatePrice()` z `lib/pricing.ts`; klient cenu neposiela, databáza ju overuje. Strop príplatku (`max_charge`) platí na jeden kus za celý prenájom.
- **Neprihlásený formulár neprepisuje profil existujúceho účtu**; údaje z formulára idú do snapshotu rezervácie.
- **Záznam rezervácie** (stĺpce + cenový snapshot) vždy cez `buildBookingRecord()` z `lib/booking/record.ts`.
- **Nepotvrdené rezervácie sa verejne nezobrazujú**; kalendár dostupnosti dostáva len obsadené intervaly, bez osobných údajov.
- **Kategórie v katalógu sú jednovýberové** (čipy); URL `?kategoria=a,b` sa stále číta, ale UI ju nevytvára. **Filter počtu miest je presná zhoda** (5 / 7 / 8).
- **Rezervované slugy** kategórií: `rezervacia`, `prihlasenie`, `nastavit-heslo`, `zabudnute-heslo`, `moj-ucet`, `admin`, `api`, `en`, `sk`, `_next`, `images`, `sitemap.xml`, `robots.txt`.
- **Pristavenie na vlastnú adresu:** v Bratislave bez poplatku, mimo Bratislavy ručné spracovanie (BTW zákazníka kontaktuje), žiadny výpočet podľa km.
- **Platba na mieste:** formulár ponúka len prevod a `cash`, ktorý sa zobrazuje ako „Platba na mieste (hotovosť alebo terminál)“.
- **Cesta do zahraničia je povinná otázka** (Áno / Nie, kvôli poisteniu), pri „Áno“ sú povinné krajiny (`abroadRuleErrors` v `lib/booking/schema.ts`). Koncept formulára je `btw-booking-draft-v2`.
- **Dátum narodenia sa píše** (`TypedDateInput`, DD.MM.RRRR), nie vyberá v kalendári.
- **Číslo rezervácie = variabilný symbol** (`20260043`, rok + poradie, bez „BTW-“). Ďakovná stránka prijíma aj starý tvar `BTW-…`.
- **Hlavička:** bez kategórií a bez odkazu na btw.sk (ten je v pätičke s Prepravou osôb a Transferom na Schwechat); na mobile je prihlásenie / Môj účet / jazyk len v hamburgeri.

## Zákaznícka zóna a účty
- Zóna číta cez session klienta (RLS); vozidlo berie z verejného katalógu, lebo zákazník tabuľku vozidiel nečíta.
- **Úprava zákazníkom:** nová rezervácia sa prepíše, potvrdená ide do `modified` s návrhom v `pending_change` (pôvodný termín ostáva blokovaný). Pri ručne dohodnutej cene a po lehote sa online upraviť nedá (`customerEditBlock`).
- **Storno poplatok** počíta databáza; `lib/cancellation.ts` je to isté pravidlo pre zobrazenie. Pri zmene pravidla treba zmeniť obe strany (DB v btw-admin) a testy.
- **Odkaz na nastavenie hesla** používa vlastné tokeny (72 h), lebo Supabase tokeny platia najviac 24 h.
- **Uniknuté heslá** kontroluje aplikácia (`lib/auth/pwned.ts`, HIBP k-anonymita, pri výpadku prijme). Každé nové miesto, kde sa nastavuje heslo, ju musí volať. Verejná registrácia v Supabase Auth je vypnutá.
- **Žiadosť o vymazanie účtu** sa len zaznamená; vykonanie (anonymizácia) robí admin.
- Prihlásenie zákazníka prenájmu ostáva na `rental.btw.sk/prihlasenie`.

## Technické pravidlá
- **Peniaze** v centoch (integer, s DPH), vstup a výstup cez `lib/format.ts` (`parseEuroToCents`, `formatEuro`).
- **Čas** ako `timestamptz`, zobrazenie a vstupy v `Europe/Bratislava` cez `lib/time.ts` (`zonedLocalToUtc`, `formatDateTime`).
- **Na verejné endpointy nesmie ísť** ŠPZ, interné poznámky ani blacklist.
- `npm run build` je čistý build; `npm run vercel-build` navyše spúšťa idempotentné seed skripty (owner, fotky) – po presune adminu sa presúvajú do btw-admin.
- **Next 16:** `middleware.ts` je `proxy.ts`, konfigurácia `next.config.mjs`, build `next build --webpack`. V server akciách `updateTag`, nie `revalidateTag`. Pri chybe „obnova po akcii nedobehne“ najprv over verziu Reactu v `node_modules/next/dist/compiled/react-dom`.
- **CSP s nonce** (`lib/csp.ts`, `proxy.ts`): skripty len s nonce + `'strict-dynamic'`. Nový externý zdroj (skript, iframe, fetch z prehliadača, obrázky) treba pridať do `buildCsp`. `<script type="application/ld+json">` nonce nepotrebuje.
- **Metadáta v `<head>`** (`htmlLimitedBots: /.*/` v `next.config.mjs`) – inak by Google ignoroval canonical a hreflang.
- **Server akcie, po ktorých sa má prejsť inam, vracajú `redirectTo`** a klient urobí `window.location.assign` (`redirect()` v akcii volanej cez `await` s `.catch` sa stratí).
- **Odkazy s kotvou (`#sekcia`) na inú stránku píš ako `<a href>`**, nie `next/link`.
- **`useFormAction` posiela aj stlačené tlačidlo** (`name`/`value`); server pri neznámej hodnote vráti chybu, nie predvolenú vetvu. Formuláre nesmú po chybe stratiť vyplnené údaje.
- **Krížové pravidlá formulára** (telefón podľa predvoľby, firma) sú v `customerRuleErrors()`; Zod `superRefine` beží až po platnosti všetkých polí, preto ju formulár volá aj priamo.
- **Dátumové polia na iOS:** `DateField` (`components/ui/date-field.tsx`) a selecty so `SELECT_CHEVRON_STYLE`.
- **`Intl.DateTimeFormat` nevytváraj v cykle** – `lib/time.ts` ho cachuje.
- **Kľúče v zoznamoch nesmú byť popisky, ktoré sa môžu opakovať.**
- **ESLint React Hooks 7:** žiadny `setState` v efekte, žiadne `ref.current =` v renderi, žiadne `Date.now()` v renderi. Výnimky len s komentárom prečo.
- **Preklady** v `messages/sk.json` a `messages/en.json`.
- **E-maily** sú React Email šablóny v `emails/`, odosielanie cez Resend z `info@rental.btw.sk` (doména overená).
- **Cloudflare Turnstile** sa zapne sám po nastavení `NEXT_PUBLIC_TURNSTILE_SITE_KEY` a `TURNSTILE_SECRET_KEY`; dovtedy honeypot, minimálny čas vyplnenia a rate limit.

## Overovanie
- Unit testy (Vitest) a E2E (Playwright) v GitHub Actions proti lokálnemu Supabase – **nikdy proti produkcii** (`tests/e2e/support.ts` to stráži).
- Lokálne: `.env.local` s `NEXT_PUBLIC_SUPABASE_URL` a publishable kľúčom, `npm run build`, `next start`. V cloud prostredí spusti build aj server s `NODE_USE_ENV_PROXY=1` a `NODE_EXTRA_CA_CERTS=/root/.ccr/ca-bundle.crt`; pred novým štartom zabi aj `next-server`.
- Preview nasadenia sú za Vercel prihlásením, Playwrightom sa na ne nedostaneš.
- Databázu zdieľa produkcia aj preview – testovacie dáta po teste zmaž a povedz o nich klientovi. Čísla rezervácií pri mazaní nevracaj späť.

## Infraštruktúra
| Čo | Hodnota |
|---|---|
| Supabase | projekt `btw`, ref `wlkdhdkflbswjjdobsfs`, eu-west-1 |
| Vercel | tím `igortittels-projects`, projekt `btw-rental` |
| Doména | `rental.btw.sk` (DNS btw.sk vo Websupporte, prístup má klient) |
| CI | GitHub Actions: `Kvalita` (lint, typy, formát, unit testy), `E2E` |

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

# Fáza 0 – Analýza (BTW Rental)

Stav k 16. 11. 2026. Tento dokument je výstupom Fázy 0. **Bez schválenia sa nepokračuje do Fázy 1.**

Rozhodnutia, ktoré potrebujem pred Fázou 1, sú zhrnuté v [sekcii 6](#6-rozhodnutia-na-schválenie).

---

## 1. Stav repa a Vercel projektu

### 1.1 Repo `igortittel/btw-rental`

Repo **nie je prázdne**. Obsahuje starší prototyp („BTW Rental admin system“, 4 commity na `main`, cca 7 400 riadkov TS/SQL):

| Oblasť | Čo tam je |
|---|---|
| Stack | Next.js 14.2.9 (App Router), React 18, Tailwind 3, Supabase (`@supabase/ssr`), Radix UI primitíva (štýl shadcn), `date-fns`, `react-day-picker`, `lucide-react` |
| Routy | `/` , `/fleet`, `/fleet/[id]`, `/auth/login` (magic link), `/dashboard` (zákazník), `/admin` (bookings, fleet, maintenance, vehicles) |
| DB | 5 migrácií: `vehicles`, `profiles`, `bookings`, `maintenance`; ceny ako `NUMERIC` v eurách, cenové hladiny a doplnky v JSONB |
| Chýba | testy, ESLint/Prettier konfigurácia, i18n, Zod, emaily, PDF, protokoly, seed skripty, `docs/` |

Prototyp sa od zadania líši v základoch, nie v detailoch:

| Téma | Prototyp | Zadanie |
|---|---|---|
| Role | `user_metadata.role = 'admin'` | tabuľka `staff_roles` (owner / manager / operator) |
| Prihlásenie | magic link / OTP | email + heslo, jednorazový odkaz na nastavenie hesla |
| Stavy rezervácie | `pending / confirmed / active / completed / cancelled` | `new / confirmed / modified / active / completed / cancelled` + história |
| Kolízie | trigger v PL/pgSQL | `EXCLUDE USING gist` + buffer |
| Peniaze | `NUMERIC` v € | centy (integer), snapshot cien |
| Kategórie | `first_class / business_class / business_van` (CHECK) | číselník Sedan / SUV / Limousine / Van |
| URL | `/fleet/[id]` | `/[kategoria]/[nazov]-[VIN]`, `next-intl` |

**Dva bezpečnostné problémy prototypu** (dôvod, prečo naň nenadväzovať):

1. **Rola admina je v `user_metadata`.** Toto pole si vie prihlásený používateľ prepísať sám (`supabase.auth.updateUser({ data: { role: 'admin' } })`). Na ňom stoja všetky RLS politiky aj middleware – ktokoľvek s účtom sa vie povýšiť na admina. Politika `auth_view_own_docs` navyše dáva každému prihlásenému čítanie všetkých dokumentov v buckete.
2. **Next.js 14.2.9** je staršia verzia ako opravené vydania pre obídenie middleware (CVE-2025-29927, opravené v 14.2.25). Ochrana `/admin` je v prototype len v middleware.

Ak je prototyp niekde nasadený s reálnymi dátami, odporúčam ho do opravy nepoužívať.

### 1.2 Vercel projekt `btw-rental`

**Neoverené.** Vercel konektor v tejto relácii nemá prístup k tímu `igortittels-projects` (API vracia 403). Vyžiadal som autorizačný odkaz, no do dopísania analýzy nebol schválený (platí 10 minút, vygenerujem nový).

Čo viem nepriamo: posledný commit na `main` je „Trigger redeploy“ a predchádzajúce dva opravujú build chyby – repo teda s veľkou pravdepodobnosťou s Vercelom prepojené je.

Po schválení prístupu overím: Git prepojenie a produkčnú vetvu, stav posledných deployov, nastavené env premenné (len názvy), domény (`rental.btw.sk` zatiaľ zrejme nepridaná).

### 1.3 Supabase

V repe nie je `supabase/config.toml` ani referencia na projekt. Neviem, či existuje Supabase projekt a či sú na ňom aplikované migrácie prototypu. Viď otázku v sekcii 6.

---

## 2. Extrahované vozidlá

### 2.1 Zdroj

Stránka `btw.sk/nase-vozidla` načítava vozidlá client-side z **WordPress GraphQL API** `https://wp.btw.sk/graphql` (post type `vozidla`, ACF skupina `popisVozidla`). Použil som priamo toto API – rovnaký dotaz, aký posiela web.

- Skript: [`scripts/import-btw-vehicles.py`](../scripts/import-btw-vehicles.py) (jednorazový, žiadna synchronizácia)
- Výstup: [`supabase/seed/vehicles.json`](../supabase/seed/vehicles.json), fotky v `supabase/seed/images/<slug>/`

API vracia 10 záznamov: **7 vozidiel na prenájom** (importované) a 3 generické položky pre transfer („Mercedes-Benz S-Class, BMW 7 a iné“ a pod.), ktoré som vynechal – preprava nie je súčasťou systému.

### 2.2 Vozidlá

| # | Vozidlo | Kategória (návrh) | Pôvodná kat. | Motorizácia | Miest | Kufre | Cena na btw.sk |
|---|---|---|---|---|---|---|---|
| 1 | Mercedes-Benz E 200 d | Sedan | Business Class | 2.0 Diesel, 145 kW (197 HP), A9, zadný náhon | 5 | 3 | od 100 € |
| 2 | Mercedes-Benz E 220 d | Sedan | Business Class | 2.0 Diesel, 145 kW (197 HP), A9, zadný náhon | 5 | 3 | od 100 € |
| 3 | Mercedes-Benz S 400 d 4MATIC | Limousine | First Class | 3.0 Diesel, 243 kW (330 HP), A9, 4×4 | 5 | – | od 210 € |
| 4 | Mercedes-Benz GLS 400 d 4MATIC | SUV | First Class | 3.0 Diesel, 243 kW (330 HP), A9, 4×4 | 7 | – | od 210 € |
| 5 | Mercedes-Benz V 250 d 4MATIC Extra-Long | Van | Business Van | 2.0 Diesel, 140 kW (190 HP), A9, 4×4 | 8 | – | od 130 € |
| 6 | Mercedes-Benz V 300 d 4MATIC Long | Van | Business Van | 2.0 Diesel, 174 kW (237 HP), A9, 4×4 | 8 | 3 | od 140 € |
| 7 | Hyundai Staria Luxury 4x4 | Van | Business Van | 2.2 CRDi, 130 kW, A8, 4×4 | 7 | 3 | od 105 € |

Všetky: diesel, automat. Ku každému vozidlu: popis (SK), výbava, „služby v cene“ a 4 fotky (1 exteriér = hlavná, 3 interiér). Fotky sú v zdroji 1000 × 1000 px (exteriér 1000 × 700), uložené ako WebP, spolu 1,9 MB.

Úpravy pri importe:
- **Názvy** som zjednotil na oficiálny zápis Mercedes-Benz (`E200d` → `E 200 d`) a pohon doplnil do variantu. S 400 d a GLS 400 d majú v zdroji uvedené „4×4“, preto `4MATIC`.
- **Výbava:** zdroj má skupiny Komfort a Technológie, skupinu **Bezpečnosť nemá**. Položky s kamerami a parkovacími senzormi som do nej presunul automaticky (kľúčové slová). Je to návrh na úpravu v admine.
- **Služby v cene** (diaľničná známka, PZP + havarijné, asistencia) zadanie v dátovom modeli nemá. Uložil som ich do `included_services` – viď sekciu 6.

### 2.3 Chýbajúce a sporné údaje

| Údaj | Stav | Riešenie v seede |
|---|---|---|
| **VIN** (všetkých 7) | na webe nie je | testovacie hodnoty `TESTBTW0000000001` – `…7`, príznak `vin_is_placeholder: true`. **Sú súčasťou URL – doplniť pred spustením.** |
| **ŠPZ** | na webe nie je | testovacie hodnoty `BT001TW` – `BT007TW` |
| **Počet kufrov** – S 400 d, GLS 400 d, V 250 d | v zdroji prázdne | `null` |
| **Výkon v HP** – Staria | v zdroji len kW | `null` |
| **Popis EN** (všetky) | zdroj je len SK | `null`; preložím vo Fáze 10 alebo doplní admin |
| **Ceny** | zdroj má „od“ ceny 100 – 210 € | podľa zadania 79 €/deň vo všetkých hladinách; pôvodná cena je v `source.price_from_eur` |
| **Hlavná fotka E 200 d a E 220 d** | rovnaký obrázok (`2.png`) | ponechané; odporúčam nahrať vlastné |
| **Hlavná fotka V 250 d** | zhodná s generickou transferovou položkou | ponechané |
| **Fotky exteriéru** | len 1 výrez na vozidlo, na čiernom pozadí | pre galériu a OG obrázok odporúčam doplniť |
| E 200 d vs. E 220 d | zhodná motorizácia (145 kW) aj výbava | pravdepodobne skopírovaný záznam – overiť |

---

## 3. Design tokeny z live btw.sk

Zdroj: computed styles a markup zo stránky `/nase-vozidla` a detailu vozidla (Playwright, 1440 px a 390 px). Screenshoty: [`desktop`](phase0/btw-sk-desktop.png), [`karty`](phase0/btw-sk-cards.png), [`mobil`](phase0/btw-sk-mobile.png). Web je Next.js + Tailwind, takže triedy sa dajú prevziať takmer 1 : 1.

### 3.1 Farby

| Token | Hodnota | Použitie na btw.sk |
|---|---|---|
| `gold` | `#B88746` | CTA, zvýraznenie v H1, ikony, focus na inputoch |
| `gold-hover` | `#A67C52` | hover na CTA |
| `black` | `#111111` | pozadie stránky a headera |
| `black-pure` | `#000000` | footer, tmavé sekcie detailu |
| `surface` | `#1A1A1A` | karty, hero detailu |
| `surface-2` | `#1D1D1D` | sekcia formulára, pozadie inputov |
| `border` | `#333333` (hover `#444444`) | orámovanie kariet a inputov |
| `border-strong` | `#666666` | neaktívny tab (outline) |
| `text` | `#FFFFFF` | nadpisy, labely |
| `text-muted` | `#CCCCCC` | navigácia, popisy, parametre |
| `text-placeholder` | `#666666` | placeholder |

**Rozdiel oproti zadaniu:** btw.sk orámováva karty sivou `#333333`. Zadanie chce **tenké linky v premium-gold** – použijem 1 px `#B88746` (v pokoji so zníženou opacitou, naplno pri hover/focus), sivú len pre inputy a oddeľovače.

### 3.2 Kontrast (WCAG 2.1 AA)

| Kombinácia | Pomer | Malý text (≥ 4,5) |
|---|---|---|
| zlatá `#B88746` na `#111111` | 5,9 : 1 | vyhovuje |
| zlatá na `#1A1A1A` | 5,5 : 1 | vyhovuje |
| `#CCCCCC` na `#111111` | 11,7 : 1 | vyhovuje |
| **biela na zlatej** (tlačidlá btw.sk) | **3,2 : 1** | **nevyhovuje** |
| `#111111` na zlatej | 5,9 : 1 | vyhovuje |
| placeholder `#666666` na `#1D1D1D` | 2,9 : 1 | nevyhovuje |

Tlačidlá na btw.sk (biely 14 px text na zlatej) AA nespĺňajú. Navrhujem **tmavý text `#111111` na zlatom tlačidle** a placeholder `#8C8C8C`. Je to jediná viditeľná odchýlka od btw.sk – viď sekciu 6.

### 3.3 Typografia

Font **Montserrat** (cez `next/font`, self-hosted), váhy 400 / 500 / 700.

| Prvok | Desktop | Mobil | Váha | Poznámka |
|---|---|---|---|---|
| H1 | 48 / 48 px | 36 / 40 px | 700 | `tracking-wide` (0,025em), druhý riadok zlatý |
| H2 | 36 / 40 px | 36 / 40 px | 700 | často verzálky |
| H3 (názov karty) | 18 / 28 px | 18 / 28 px | 700 | |
| Text | 16 / 24 px | 16 / 24 px | 400 | |
| Malý text, navigácia vo footeri, parametre | 14 / 20 px | 14 / 20 px | 400 | |
| Tlačidlo, label | 14 px | 14 px | 500 | |

### 3.4 Rozmery a komponenty

| Prvok | Hodnoty |
|---|---|
| Header | fixný, výška 72 px, `px-6 py-4`, pozadie `#111111`, logo 40 px, odkazy `#CCCCCC` → biela, medzery 32 px, CTA vpravo; pod 768 px hamburger |
| Sekcia | `px-6`, `py-20` (80 px), prvá sekcia `pt-32` kvôli headeru |
| Šírka obsahu | `max-w-6xl` (1152 px) |
| Karta vozidla | `#1A1A1A`, 1 px border, radius 12 px, padding 32 px, jemný scale 1,015 pri hover, 3 stĺpce na desktope |
| Tlačidlo primárne | výška 40 px, radius 8 px, `px-4`, zlaté |
| Tlačidlo sekundárne | podčiarknutý text `#CCCCCC` |
| Chips / taby | výška 40 px, `px-6`, plne zaoblené; aktívny biely s čiernym textom, neaktívny outline `#666666` |
| Input | výška 40 px, radius 8 px, `#1D1D1D`, border `#333333`, focus border zlatý |
| Footer | `#000000`, `py-8 px-6`, logo + 3 stĺpce odkazov (14 px) + Instagram a Facebook |

Logo je uložené v `public/images/logo.svg` (13,5 kB, prevzaté z btw.sk).

### 3.5 Header a footer pre rental.btw.sk

- **Header:** logo → `rental.btw.sk/`; odkazy Sedan, SUV, Limousine, Van (z číselníka), „btw.sk“ (späť na hlavný web), prepínač SK/EN, Prihlásenie / Môj účet; CTA „Rezervovať“.
- **Footer:** rovnaké rozloženie; odkazy na btw.sk (Služby, Preprava osôb, Kontakt), VOP a Ochrana osobných údajov (btw.sk), sociálne siete.

---

## 4. Návrh štruktúry projektu

```
app/
  [locale]/                      next-intl, SK bez prefixu, EN pod /en
    layout.tsx                   header + footer v štýle btw.sk
    page.tsx                     katalóg
    [kategoria]/page.tsx         kategória
    [kategoria]/[vozidlo]/page.tsx   detail (lookup podľa VIN, 301 na kanonickú URL)
    rezervacia/page.tsx          3-krokový formulár
    rezervacia/dakujeme/page.tsx
    prihlasenie/ | nastavit-heslo/ | zabudnute-heslo/
    moj-ucet/...                 zákaznícka zóna
  admin/...                      bez locale, vlastný layout, noindex
  api/                           cron, webhooky, signed URL
components/
  ui/                            vlastné primitíva (button, input, dialog…)
  catalog/ | booking/ | account/ | admin/ | protocol/
emails/                          React Email šablóny
lib/
  pricing.ts                     calculatePrice() – čistá funkcia
  booking-status.ts              povolené prechody
  availability.ts                kolízie, buffer
  cancellation.ts                storno pásma
  vehicle-url.ts                 slug + VIN, kanonická URL
  validation/                    Zod schémy zdieľané klient/server
  supabase/                      server, client, admin (service role len na serveri)
  auth/                          requireStaff(role), requireCustomer()
  email/ | pdf/ | settings.ts
messages/sk.json | en.json
scripts/seed-owner.ts | import-btw-vehicles.py
supabase/
  migrations/ | seed.sql | seed/vehicles.json | seed/images/
tests/unit/ | tests/e2e/
docs/
```

Technické voľby:
- **Next.js** – aktuálne podporované vydanie (nie 14.2.9), App Router, Server Actions; TypeScript strict, ESLint, Prettier, Vitest, Playwright.
- **UI:** ponechám Radix primitíva (dialog, select, checkbox, popover) – sú bez vlastného vizuálu, takže konzistenciu s btw.sk nenarušia a riešia prístupnosť. Žiadna ďalšia UI knižnica.
- **Role mimo JWT metadát:** `staff_roles` + SQL funkcia `is_staff(min_role)` používaná v RLS; kontrola aj v každej server action.
- **Rezervované slugy** kategórií: `rezervacia`, `prihlasenie`, `nastavit-heslo`, `zabudnute-heslo`, `moj-ucet`, `admin`, `api`, `en`, `sk`, `_next`, `images`, `sitemap.xml`, `robots.txt`.
- **Cron:** Vercel Cron (`/api/cron/*` s tajným kľúčom) – stavy, pripomienky, žiadosti o recenziu.

Postup s existujúcim kódom (odporúčanie): **nová schéma a nové routy podľa zadania**, z prototypu prevziať len to, čo sedí – Tailwind tokeny, UI primitíva, `CountdownTimer`, kostru galérie a kalendára. Staré migrácie `001–005` odstrániť a začať čistou sadou migrácií.

---

## 5. Čo je v tejto fáze hotové

| Súbor | Obsah |
|---|---|
| `docs/ANALYSIS.md` | tento dokument |
| `docs/phase0/*.png` | screenshoty btw.sk (desktop, karty, mobil) |
| `supabase/seed/vehicles.json` | 7 vozidiel |
| `supabase/seed/images/<slug>/` | 28 fotiek (WebP) |
| `scripts/import-btw-vehicles.py` | jednorazový import |
| `public/images/logo.svg` | logo BY THE WAVE |

Do existujúceho kódu prototypu som nezasahoval. Repo `btw-web` som nečítal ani neupravoval.

Prostredie relácie: sieť je obmedzená, preto som vytvoril cloud prostredie `btw-rental` s povolenými hostami `www.btw.sk`, `btw.sk`, `wp.btw.sk`.

---

## 6. Rozhodnutia na schválenie

1. **Existujúci prototyp** – súhlasíte s postupom „nová schéma a routy podľa zadania, staré migrácie a stránky odstrániť, prevziať len použiteľné komponenty“?
2. **Supabase** – existuje už projekt? Ak áno, sú na ňom dáta, ktoré treba zachovať, alebo ho môžem považovať za čistý (prípadne založiť nový)?
3. **Zaradenie do kategórií** – Sedan: E 200 d, E 220 d · Limousine: S 400 d · SUV: GLS 400 d · Van: V 250 d, V 300 d, Staria. Sedí to?
4. **Názvy vozidiel** – oficiálny zápis (`E 220 d`, URL `…/mercedes-benz-e-220-d-<VIN>`), alebo ako na btw.sk (`E220d`)?
5. **Služby v cene** (diaľničná známka, poistenie so spoluúčasťou, asistencia) – pridať ako štvrtú skupinu na detaile vozidla? Odporúčam áno, je to predajný argument.
6. **Text na zlatých tlačidlách** – tmavý (spĺňa AA), alebo biely ako na btw.sk (nespĺňa)?
7. **VIN a ŠPZ** – ak ich viete poslať teraz, doplním ich rovno do seedu; inak ostanú placeholdery a doplníte ich v admine.
8. **Vercel** – schváliť prístup konektora k tímu, aby som overil prepojenie projektu (pošlem nový odkaz).

Otvorené zo zadania (neblokujú Fázu 1): IBAN/SWIFT, prístup k DNS btw.sk (CNAME `rental`, záznamy pre Resend).

# Fáza 10 – EN, SEO, doména, E2E, výkon, bezpečnostný review

Rozhodnutia klienta z 19. 11. 2026: prechod na Next 16 áno; tlačidlá ostávajú biely text na zlatej; E2E v GitHub Actions s oddelenou databázou; EN preklady pripraví Claude, klient skontroluje; lehoty e-mail log 12 mesiacov, cron 30 dní, audit log natrvalo; doménu pripraví Claude, DNS nastaví klient; popisy príplatkov netreba; testovacie údaje sa zmažú naraz pred spustením.

Čo musí klient urobiť pred spustením: **[`docs/RELEASE-CHECKLIST.md`](RELEASE-CHECKLIST.md)**.

## 1. Oprava „Ukladám…“ na detaile rezervácie (známy problém z Fázy 9)

**Príčina:** chyba v Reacte `19.2.0-canary`, ktorý pribaľoval Next 15.5. Server akcia sa dokončila a odpoveď prišla celá. React začal vykresľovať novú stránku a chvíľu čakal na časť odpovede servera (React Flight). Keď prišla, plánovač prebudenie stratil: koreň ostal s „suspendovanou“ dráhou bez poslucháča a nová stránka sa nikdy nevykreslila. Preto bolo správanie náhodné, len v produkčnom builde a najčastejšie na detaile rezervácie (veľa sekcií = viac takých častí odpovede).

Zistené instrumentáciou routera a Reactu v lokálnom produkčnom builde (Playwright):

| Verzia | Výsledok |
|---|---|
| Next 15.5 (pôvodne) | zlyhalo 10 pokusov z 10 |
| React 19.3 podhodený do buildu | prešli 3 z 3 |
| **Next 16.4.6** | prešlo 6 pokusov z 6 |

**Oprava: prechod na Next 16.4.6** (React 19.3):
- `middleware.ts` → `proxy.ts`,
- `next.config.mjs`,
- build cez webpack (`next build --webpack`, pdfkit a `outputFileTracingIncludes` ostávajú overené),
- `staffAction` volá `updateTag` (okamžitá platnosť zmien v katalógu).

## 2. Kvalita kódu

- **ESLint** (flat config `eslint.config.mjs`, `next/core-web-vitals` + TypeScript) – predtým nebol nastavený. Opravené nálezy nových pravidiel React Hooks 7:
  - stav sa upravuje počas renderu namiesto `setState` v efekte,
  - „latest ref“ sa aktualizuje v `useLayoutEffect`,
  - odpočet je cez `useSyncExternalStore`,
  - `Date.now()` mimo renderu.

  Dve vedomé výnimky sú s komentárom: obnovenie rozpracovaného formulára zo `sessionStorage` a „minulé dni“ v kalendári.
- **Prettier** (`.prettierrc.json`), celý kód naformátovaný v samostatnom commite.
- Build bez varovaní, `npm run lint`, `npm run format:check`.
- **GitHub Actions „Kvalita“** pri každom pushi: lint, typy, formát, unit testy.

## 3. SEO

- Metadáta (title, description, **canonical, hreflang**) sú v `<head>` pre všetkých (`htmlLimitedBots`). Next 15.5 ich streamoval do `<body>` a Google tam canonical ani hreflang neberie.
- OG obrázok 1200 × 630 (`public/images/og.jpg`) pre katalóg a kategórie; vozidlá majú vlastnú fotku.
- schema.org **AutoRental** na úvodnej stránke (adresa, otváracie hodiny 24/7, e-mail); vozidlo (`Car` + `Offer`) naň odkazuje ako na predajcu.
- Ostáva z predošlých fáz: sitemap s hreflang, robots (preview celé zakázané), noindex pre admin, zónu, formulár, prihlásenie a filtrované varianty.
- SK/EN **404** a chybová stránka webu aj adminu.

## 4. EN mutácia

- `messages/en.json` je kompletný (503 kľúčov, rovnako ako SK), e-maily sú dvojjazyčné (od Fázy 5).
- **Obsah v DB:** migrácia `20261123090000_en_content.sql` doplnila EN názvy 52 položiek výbavy a EN popisy 7 vozidiel. Prepisuje len chýbajúce, je aplikovaná na Supabase. Kategórie, miesto a názvy príplatkov EN mali.
- **Admin → Viac → Výbava** (nové): číselník výbavy so SK/EN názvom, skupinou a poradím, počtom vozidiel; zmazať sa dá len nepoužitá položka. Upozorní na položky bez EN.
- **Popisy fotiek (alt text)** SK/EN: tlačidlo „Popis“ pri fotke vozidla.

## 5. Výkon (Lighthouse, mobil, lokálny produkčný build)

| Stránka | Pred | Po |
|---|---|---|
| detail vozidla | 62 (TBT 1 920 ms) | **90–91** (TBT 80–240 ms) |
| katalóg `/` | 86 | 91 |
| kategória `/sedan` | 94 | 89 |
| rezervácia | 96 | 88 |
| `/en` | 98 | 92 |

- **Hlavná príčina** pomalého detailu: kalendár dostupnosti vytváral `Intl.DateTimeFormat` stovky krát pri každom vykreslení (prepočet časového pásma). Formátovače sa teraz vytvárajú raz (`lib/time.ts`).
- `preload` hlavnej fotky (namiesto zastaraného `priority`) a logo so skutočným pomerom strán.
- Lokálne čísla kolíšu o ±3, lebo obrázky idú cez proxy cloud prostredia. SEO 92 lokálne je len preto, že canonical ukazuje na `rental.btw.sk`, a prístupnosť 96 je kvôli kontrastu tlačidiel (rozhodnutie klienta).
- **Na `rental.btw.sk` treba Lighthouse zopakovať** (checklist).

## 6. Prístupnosť (WCAG 2.1 AA)

- „Preskočiť na obsah“ vo verejnej časti aj v admine.
- Lighthouse prístupnosť 96 na verejných stránkach. Jediný nález je **kontrast bieleho textu na zlatej (3,18 : 1)** – vedomá výnimka klienta, zapísaná v CLAUDE.md.
- Formuláre majú popisky, chyby s `aria-invalid` / `aria-describedby` a focus na prvú chybu (od Fázy 5). Karta vozidla nemá duplicitný odkaz pre čítačky.

## 7. Bezpečnosť

Podrobne v `docs/SECURITY.md` (sekcia Fáza 10):
- **CSP s nonce** pre všetky HTML stránky (`lib/csp.ts`, `proxy.ts`). Overené bez porušení na všetkých stránkach, pri prihlásení s 2FA aj pri server akciách.
- Review všetkých server akcií a API (každá overuje rolu alebo prihlásenie; verejné sú zámerne len overenie termínu a odhlásenie).
- **Lehoty uchovávania** v dennom crone (`lib/retention.ts`):

  | Údaj | Lehota |
  |---|---|
  | e-mail log | 12 mesiacov |
  | záznamy cronu | 30 dní |
  | odkazy na heslo | 7 dní |
  | rate limit | 1 deň |
  | audit log | natrvalo |

- Security Advisor bez nových nálezov.
- **Formuláre majú `method="post"`** – ak by niekto formulár odoslal skôr, než sa načíta JavaScript (pomalé pripojenie), prehliadač by ho inak poslal metódou GET a heslo či iné údaje by skončili v URL (história prehliadača, logy). Odhalil to E2E test.

## 8. Doména `rental.btw.sk`

- Pridaná do Vercel projektu. DNS spravuje Websupport: CNAME `rental` → `8fcb7bf5d840bb7c.vercel-dns-017.com.` (postup v checkliste).
- Aplikácia je pripravená: odkazy v e-mailoch berú `NEXT_PUBLIC_SITE_URL` alebo povolené hosty (`lib/site-url.ts`), canonical a sitemap používajú `rental.btw.sk`, odosielateľ e-mailov `info@rental.btw.sk` (Resend, overené).
- Po nastavení DNS:
  - `NEXT_PUBLIC_SITE_URL` (Production),
  - presmerovanie `btw-rental.vercel.app` → `rental.btw.sk`,
  - Supabase Auth URL.

## 9. E2E testy (Playwright)

`tests/e2e/booking-lifecycle.spec.ts` – jeden súvislý príbeh rezervácie cez UI:

1. návštevník rezervuje vozidlo (3 kroky formulára),
2. majiteľ sa prihlási **s 2FA** (registrácia TOTP, kód sa vypočíta z tajomstva zobrazeného pri registrácii) a rezerváciu potvrdí,
3. zákazník si **nastaví heslo cez jednorazový odkaz** (bez e-mailovej služby ho admin zobrazí) a vidí rezerváciu v Mojom účte,
4. zákazník **upraví potvrdenú rezerváciu** → stav „Upravená“, pôvodný termín platí,
5. majiteľ **úpravu schváli** → nový termín,
6. majiteľ zaznamená **úhradu prenájmu a depozit**,
7. majiteľ vyplní a podpíše **odovzdávací protokol** (tachometer, palivo, 4 fotky, 2 podpisy) → „Prebiehajúca“.

**Kde bežia:**
- GitHub Actions `E2E` pri každom pushi a PR, alebo ručne (Actions → E2E → Run workflow).
- `supabase start` vytvorí čistú lokálnu databázu z `supabase/migrations` a `supabase/seed.sql`, potom sa spustí `next build` + `next start`.
- **Produkčná databáza sa nepoužíva.** `tests/e2e/support.ts` odmietne bežať proti `*.supabase.co`.
- Preview ani produkcia preto nepotrebujú Protection Bypass.

Lokálne (s Dockerom):

```bash
supabase start
```

```bash
eval "$(supabase status -o env)" && export NEXT_PUBLIC_SUPABASE_URL=$API_URL NEXT_PUBLIC_SUPABASE_ANON_KEY=$ANON_KEY SUPABASE_SERVICE_ROLE_KEY=$SERVICE_ROLE_KEY NEXT_PUBLIC_SITE_URL=http://localhost:3000
```

```bash
npm run build && npx playwright test
```

## Nové a zmenené súbory (hlavné)

| Súbor | Čo |
|---|---|
| `package.json`, `proxy.ts`, `next.config.mjs` | Next 16, skripty `lint`, `format`, build cez webpack |
| `eslint.config.mjs`, `.prettierrc.json`, `.prettierignore` | kvalita kódu |
| `.github/workflows/ci.yml`, `e2e.yml` | CI |
| `lib/csp.ts` | CSP s nonce |
| `lib/retention.ts`, `lib/cron/daily.ts` | lehoty uchovávania |
| `lib/time.ts` | cache formátovačov (výkon) |
| `lib/seo.ts`, `public/images/og.jpg` | OG obrázok, AutoRental |
| `app/[locale]/not-found.tsx`, `error.tsx`, `app/not-found.tsx`, `app/global-error.tsx`, `app/admin/error.tsx` | chybové stránky |
| `components/site/skip-link.tsx` | odkaz na obsah |
| `app/admin/vybava/*`, `lib/features.ts` | číselník výbavy |
| `components/admin/vehicle-images.tsx`, `app/admin/vozidla/actions.ts` | popisy fotiek |
| `supabase/migrations/20261123090000_en_content.sql` | EN obsah |
| `supabase/config.toml`, `playwright.config.ts`, `tests/e2e/*` | E2E |
| `docs/RELEASE-CHECKLIST.md`, `docs/SECURITY.md` | dokumentácia |

## Testy

- `npm test` – **196 unit testov** (pribudli lehoty uchovávania).
- `npm run lint`, `npm run typecheck`, `npm run format:check` – čisté.
- **E2E – 7 z 7 krokov prešlo** v GitHub Actions (19. 11. 2026, beh „E2E“ #6, 18 s testov, ~2,5 min celý job vrátane Supabase a buildu).
- Prehliadač lokálne: všetky verejné a admin stránky (bez chýb a porušení CSP), oprava „Ukladám…“, Výbava, EN detail.
- **Lokálne sa nedalo overiť:**
  - odoslanie e-mailov a cron (chýba service role kľúč),
  - PDF protokolu na Verceli (otestujte odovzdávací protokol na preview),
  - samotné DNS.

## Ako otestovať na preview

Vetva `claude/hopeful-hawking-utqg9v`, preview za Vercel prihlásením.

1. **„Ukladám…“:** detail rezervácie → pridajte internú poznámku, zaznamenajte platbu, nahrajte doklad – tlačidlo sa vždy vráti a stránka sa obnoví.
2. **EN:** `/en/…` detail vozidla – popis a výbava po anglicky.
3. **Výbava:** Admin → Viac → Výbava – upravte EN názov, uložte, skontrolujte EN detail vozidla.
4. **Popisy fotiek:** Admin → Vozidlá → vozidlo → Fotky → „Popis“.
5. **404:** `/neexistuje` a `/en/neexistuje`.
6. **Protokol a PDF** (Next 16 na Verceli): odovzdávací protokol testovacej rezervácie → podpis → PDF sa otvorí.
7. **Cron:** zajtra ráno panel Automatické e-maily na Prehľade (beh bez chýb; staré záznamy sa mažú podľa lehôt).

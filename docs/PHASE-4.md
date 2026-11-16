# Fáza 4 – Verejný katalóg, detail vozidla, kalendár dostupnosti

## Stránky

| URL | Obsah |
|---|---|
| `/` (EN `/en`) | katalóg všetkých vozidiel, čipy kategórií, filtre |
| `/sedan`, `/suv`, `/limousine`, `/van` | samostatné indexovateľné stránky kategórií s vlastným H1 a meta |
| `/{kategoria}/{nazov}-{VIN}` | detail: galéria, parametre, popis, výbava (4 skupiny), kalendár, cenník, príplatky, podmienky, storno podmienky |
| `/rezervacia?vozidlo={VIN}` | zatiaľ zástupná stránka (formulár je Fáza 5) |
| `/sitemap.xml`, `/robots.txt` | SEO |
| `/api/availability` | obsadené intervaly pre kalendár (bez osobných údajov) |

## Ako to funguje

- **Dáta** idú výhradne cez verejné views `public_*` anonymným klientom (`lib/catalog.ts`). Katalóg je v cache 5 minút a obnoví sa okamžite po každom uložení v admine.
- **Čipy kategórií** sú odkazy: jedna kategória vedie na jej vlastnú stránku (`/sedan`), viac naraz na `/?kategoria=sedan,suv`. Filtre (prevodovka, palivo, počet miest, termín) sú obyčajný GET formulár – fungujú aj bez JavaScriptu.
- **Filter podľa termínu** zobrazí len vozidlá voľné počas celých zvolených dní (vrátane času na prípravu) a termín prenesie do odkazu „Rezervovať“.
- **Detail sa hľadá podľa VIN.** Ak nesedí kategória, názov v URL alebo veľkosť písmen VIN, nasleduje trvalé presmerovanie na kanonickú URL.
- **Kalendár dostupnosti:** dva mesiace, dni v pásme Europe/Bratislava. Plne obsadený deň je prečiarknutý, čiastočne obsadený (deň vyzdvihnutia/vrátenia) je označený zvlášť, rezervácia čakajúca na potvrdenie má prerušovaný zlatý rámik.
- **Galéria:** posúvanie prstom, miniatúry, lightbox (šípky, Esc, swipe).
- **Prihlásenie v hlavičke** sa otvára ako modal; je to zároveň bežný odkaz na `/prihlasenie`.
- **Cena „od“** je najnižšia cenová hladina vozidla.

## SEO

- Unikátny `title` a `description`, `canonical`, `hreflang` (sk, en, x-default), Open Graph s hlavnou fotkou.
- `schema.org` `Car` + `Offer` na detaile (cena za deň s DPH, VIN, palivo, prevodovka, počet miest).
- Filtrované varianty a kombinácie viacerých kategórií sú `noindex, follow`; prázdna kategória tiež.
- `sitemap.xml`: úvod, neprázdne kategórie, vozidlá – s jazykovými alternatívami.
- `robots.txt`: na produkcii zakazuje admin, API, zónu, formulár a prihlásenie; na preview nasadeniach zakazuje všetko.

## Odchýlky a poznámky

- **Presmerovanie má stavový kód 308, nie 301.** Next.js v App Routeri vie pre trvalé presmerovanie zo stránky vrátiť len 308; vyhľadávače ho berú rovnako ako 301. Presných 301 by vyžadovalo dotaz do databázy v middleware pri každej požiadavke.
- **Stránky sa renderujú na serveri pri každej požiadavke** (hlavička závisí od prihlásenia), dáta katalógu sú v cache. Čisté ISR by vyžadovalo presunúť stav prihlásenia do klienta – zvážim pri ladení výkonu vo Fáze 10 spolu s Lighthouse.
- **EN mutácia:** rozhranie je preložené, popisy a výbava vozidiel sa zobrazujú po slovensky, kým nedoplníte EN texty (admin → vozidlo). Preklad obsahu je naplánovaný na Fázu 10.
- **ŠPZ sa na verejných stránkach nenachádza** (overené testom nad HTML detailu).

## Testy

- `npm test` – 41 unit testov (pribudli filtre katalógu a čipy kategórií).
- Prehliadačový test (52 krokov) proti Supabase: katalóg, kategórie, viac kategórií, filtre, filter termínu s blokáciou, presmerovania a 404, obsah detailu, schema.org, kalendár, galéria, modal prihlásenia, EN, sitemap, robots, mobil bez horizontálneho posuvu.

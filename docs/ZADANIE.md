# Zadanie: Rezervačný systém pre prenájom vozidiel – BY THE WAVE (btw.sk)

> Pôvodné zadanie od klienta. Jediná úprava: firemná e-mailová adresa je nahradená textom `<firemný e-mail>` (skutočná hodnota je v `scripts/seed-owner.ts` a v nastaveniach). Rozhodnutia prijaté počas vývoja a aktuálny stav sú v [`CLAUDE.md`](../CLAUDE.md) a v `docs/PHASE-*.md`.

> Zadanie pre Claude Code. Pracuj po fázach (sekcia 14). Po každej fáze sa zastav, zhrň zmeny a počkaj na schválenie.
> Komunikácia a všetky UI texty v slovenčine (EN mutácia viď 11.3). Kód, názvy tabuliek a premenných v angličtine.

---

## 0. Kontext a ciele

- BY THE WAVE, s.r.o. – prémiový prenájom vozidiel a preprava osôb, Bratislava.
- Cieľ: vlastný rezervačný systém pre **prenájom vozidiel** (náhrada za booqme.sk), ktorý celý beží na subdoméne **`rental.btw.sk`** (katalóg, rezervácia, zákaznícka zóna aj admin).
- Tri časti: **verejný katalóg + rezervácia**, **zákaznícka zóna**, **administrácia**.
- Preprava osôb (transfery) **nie je** súčasťou tohto systému. Hlavný web btw.sk sa nemení – len doň neskôr pribudnú odkazy na rental.btw.sk.

## 1. Tech stack

| Vrstva | Technológia |
|---|---|
| Framework | Next.js (App Router, TypeScript, Server Actions / Route Handlers) |
| Hosting | Vercel (preview deploy pre každý PR) |
| DB, Auth, Storage | Supabase (Postgres + RLS, Supabase Auth, Storage pre fotky/PDF) |
| Emaily | Resend + React Email šablóny |
| Validácia | Zod (zdieľané schémy klient/server) |
| UI | Tailwind CSS, komponenty v štýle btw.sk |
| PDF | `@react-pdf/renderer` (protokoly, sumár rezervácie) |
| Plánované úlohy | Supabase `pg_cron` alebo Vercel Cron |
| Anti-spam | Cloudflare Turnstile + honeypot + rate limit |
| i18n | `next-intl`, SK default, EN |

**Projekt a repo:** samostatný Vercel projekt **`btw-rental`** (https://vercel.com/igortittels-projects/btw-rental) a jeho repo. Vyvíjaj vo feature vetvách, PR → Vercel preview → merge do `main`.
- **Produkčná doména: `rental.btw.sk`** (pridať do Vercel projektu, CNAME v DNS btw.sk).
- Repo `igortittel/btw-web` **neupravuj** – sú v ňom rozpracované zmeny. Nič do neho necommituj ani z neho neimportuj.

## 2. Fáza 0 – príprava (pred akýmkoľvek kódom)

Skrátená fáza, bez analýzy GTM/analytiky a bez integrácie do btw-web.

1. Over prepojenie Vercel projektu `btw-rental` s Git repom a stav repa (prázdne / existujúci kód).
2. **Zdroj dát o vozidlách pre prvý návrh:** `https://www.btw.sk/nase-vozidla` (tab „Vozidlá na prenájom“). Vozidlá sa tam načítavajú client-side – otvor stránku v prehliadači (Playwright) alebo nájdi API endpoint v network requestoch a vytiahni pre každé vozidlo: názov, značku, model, kategóriu, motorizáciu, palivo, prevodovku, kapacitu, popis, výbavu, URL fotiek (a VIN, ak je dostupný). Ulož do `supabase/seed/vehicles.json` a fotky do `supabase/seed/images/`. Ak niečo chýba (napr. VIN), použi zreteľný placeholder a vypíš zoznam chýbajúcich údajov.
3. Toto je **jednorazový import** – ďalej sa vozidlá spravujú výhradne manuálne cez admin. Žiadna synchronizácia s btw.sk.
4. Vizuál (header, footer, typografiu, spacing, farby) prevezmi z **live btw.sk** (screenshoty, computed styles).
5. Výstup: `docs/ANALYSIS.md` – stav repa, extrahované vozidlá a chýbajúce údaje, design tokeny, návrh štruktúry projektu. **Bez schválenia nepokračuj.**

## 3. Dizajn

- Vychádzaj z btw.sk, konkrétne `https://www.btw.sk/nase-vozidla` – rovnaký header, footer, typografia, spacing. Logo v headeri vedie na rental.btw.sk, v navigácii odkaz späť na btw.sk.
- Farby: **premium-gold `#B88746`**, black `#111111`, white `#FFFFFF`. Tmavé pozadie, **tenké linky orámovania v premium-gold**.
- Tón: prémiový, profesionálny, žiadne generické/lacné formulácie.
- Mobile-first. Admin musí byť plne použiteľný na tablete/mobile (protokoly sa vypĺňajú pri aute).
- Prístupnosť WCAG 2.1 AA (kontrast zlatej na čiernej overiť pri malom texte).
- Nepoužívaj žiadne nové UI knižnice s vlastným vizuálom, ktoré by rozbili konzistenciu s webom.

## 4. Verejná časť

### 4.1 Katalóg (`rental.btw.sk/` a `rental.btw.sk/[kategoria]`)
- `rental.btw.sk/` – všetky vozidlá; `rental.btw.sk/sedan`, `/suv`, `/limousine`, `/van` – vozidlá danej kategórie (samostatné indexovateľné stránky s vlastným H1 a meta). Filter kategórie v katalógu na tieto URL priamo prelinkuje.
Karta vozidla:
- hlavná fotka, názov vozidla
- motorizácia (napr. 2.0 TDI, 150 kW), palivo, prevodovka, kapacita (počet miest; voliteľne kufre)
- cena „od XY € / deň“ = najnižšia cenová hladina vozidla (tier 15–30 dní)
- CTA „Detail“ a „Rezervovať“

Filtre (jednoduché): **kategória – Sedan / SUV / Limousine / Van** (chips, viac naraz), prevodovka, počet miest, palivo. Voliteľne filter podľa dátumu – zobrazí len dostupné vozidlá v zvolenom termíne.

### 4.2 Detail vozidla (`rental.btw.sk/[kategoria]/[nazov-vozidla]-[VIN]`)
- Príklad: `rental.btw.sk/sedan/mercedes-benz-e-220d-NVYOIJADONIA13U4283313`
- URL = `/{category.slug}/{slugify(brand + model + variant)}-{VIN}`; VIN veľkými písmenami, bez úprav. Generuje sa automaticky pri uložení vozidla, admin vidí náhľad URL.
- Vozidlo sa vyhľadáva **podľa VIN** (posledný segment za poslednou pomlčkou). Ak sa nezhoduje kategória, názvová časť alebo veľkosť písmen VIN → **301 redirect na kanonickú URL** (napr. po premenovaní alebo zmene kategórie vozidla).
- VIN je teda verejný údaj (je viditeľný aj za predným sklom); ŠPZ zostáva interná.
- galéria (viac fotiek, lightbox, swipe na mobile)
- všetky parametre z karty + krátky popis
- výbava v troch skupinách: **Komfort**, **Technické**, **Bezpečnosť**
- **kalendár dostupnosti** (obsadené dni prečiarknuté, legenda)
- **cenotvorba** (tabuľka):

| Dĺžka prenájmu | Cena / deň |
|---|---|
| 1 deň | XY € |
| 2–5 dní | XY € |
| 6–14 dní | XY € |
| 15–30 dní | XY € |
| 30+ dní | Individuálna cena |

- **cenník príplatkov** (aktívne príplatky pre dané vozidlo)
- podmienky: depozit, denný limit km, cena za km navyše, min. vek vodiča **21 rokov**, vodičský preukaz min. **6 mesiacov**, platobné metódy (prevod, terminál, hotovosť)
- CTA „Rezervovať“ → formulár s predvyplneným vozidlom
- SSR/ISR, unikátny `title`/`description`, `schema.org` (`Car` + `Offer`), Open Graph obrázok

### 4.3 Rezervačný formulár – 3 kroky
Stav formulára drž v URL/state, aby sa dalo vrátiť späť bez straty údajov. Priebežný **cenový súhrn** viditeľný počas celého procesu (na mobile sticky dole).

**Krok 1 – Termín a miesto**
- dátum + čas vyzdvihnutia, dátum + čas odovzdania
- miesto vyzdvihnutia a miesto odovzdania – **default a predvolené: Bratislava, Trenčianska 56/A** (bez príplatku). Výber sa zobrazí, len ak admin pridá ďalšie miesta (každé môže mať príplatok); inak sa miesto zobrazí len informatívne
- voliteľné pole **Cesta do zahraničia** (áno/nie + krajiny) – zahraničné cesty sú povolené, údaj slúži len ako informácia pre BTW, bez príplatku
- validácie: termín je voľný (kontrola na serveri), min. predstih (default 24 h), min. dĺžka prenájmu (default 1 deň). Prevádzka je **non-stop** – vyzdvihnutie aj odovzdanie možné kedykoľvek (24/7), bez príplatku
- 30+ dní → formulár sa prepne na **dopyt s individuálnou cenou** (rezervácia vznikne bez ceny, cenu doplní admin)

**Krok 2 – Údaje a doplnky**
- meno, priezvisko, email, telefón (s predvoľbou), poznámka
- dátum narodenia (kontrola min. veku **21 rokov** k dátumu vyzdvihnutia), povinný checkbox „Vodičský preukaz vlastním minimálne 6 mesiacov“
- prepínač **Súkromná osoba / Firma** → pri firme: názov, IČO, DIČ, IČ DPH, fakturačná adresa
- fakturačná adresa aj pre súkromnú osobu (potrebná na faktúru)
- **povinný súhlas** s vratným depozitom **1 000 €**
- **preferovaný spôsob platby** – zvlášť pre **cenu prenájmu** a zvlášť pre **depozit**, každé: Bankový prevod / Platobný terminál / Hotovosť (metódy môžu byť rôzne, napr. prenájom prevodom, depozit hotovosťou). Online platba na webe nie je.
- **povinný súhlas** s limitom **300 km / deň** (nad limit **0,62 € / km**)
- voliteľné príplatky (default hodnoty, upraviteľné v admine):
  - Strešný box – 8 € / deň
  - Autosedačka – 4 € / deň (možnosť zvoliť počet kusov)
  - Podsedák – 2 € / deň (počet kusov)
  - Druhý šofér – 5 € / deň

**Krok 3 – Sumarizácia**
- prehľad vozidla, termínu, miest, údajov, doplnkov
- rozpis ceny: prenájom (počet dní × sadzba), príplatky, miesta, **spolu s DPH** (+ základ a DPH 23 % zvlášť), depozit (zvlášť, nie je súčasť ceny), zvolené spôsoby platby pre obe položky; pri prevode informácia, že platobné údaje (IBAN, VS = číslo rezervácie) prídu v potvrdzujúcom emaile
- povinný súhlas so **VOP** (link btw.sk/vseobecne-obchodne-podmienky)
- povinný súhlas so **spracovaním osobných údajov** (link btw.sk/ochrana-osobnych-udajov)
- voliteľný marketingový súhlas (oddelený, nepredvyplnený)
- Turnstile, odoslanie → ďakovná stránka s číslom rezervácie a ďalšími krokmi

Cena sa **vždy prepočíta na serveri** – klient nikdy neposiela výslednú cenu.

### 4.4 Výpočet ceny (presne)
- Počet dní = počet začatých 24 h blokov od vyzdvihnutia; tolerancia na odovzdanie (default 59 min) sa nezapočítava ako ďalší deň. Nastaviteľné.
- Sadzba podľa celkovej dĺžky prenájmu sa aplikuje na **všetky dni** (napr. 7 dní → 7 × sadzba 6–14).
- Príplatky: `per_day` (× dni), `per_rental` (jednorazovo), voliteľne `max_charge` (strop).
- Ceny v DB v centoch (integer), uložené **s DPH**; DPH sadzba v nastaveniach.
- Výpočet je čistá funkcia `calculatePrice()` v `lib/pricing.ts` pokrytá unit testami (hraničné prípady: 1 d, 5 d, 6 d, 14 d, 15 d, 30 d, 31 d, tolerancia, prechod letného/zimného času).
- Pri vytvorení rezervácie sa uloží **snapshot** cien (sadzba, príplatky) – neskoršie zmeny cenníka neovplyvnia existujúce rezervácie.

## 5. Stavy rezervácie

| Stav | Kód | Kedy | Blokuje kalendár |
|---|---|---|---|
| Nová | `new` | default po vytvorení | nie* |
| Potvrdená | `confirmed` | potvrdí zamestnanec | **áno** |
| Upravená | `modified` | zákazník upraví potvrdenú rezerváciu | **áno** (pôvodný termín) |
| Prebiehajúca | `active` | od času vyzdvihnutia / po podpise odovzdávacieho protokolu | **áno** |
| Ukončená | `completed` | po vrátení vozidla a podpise preberacieho protokolu | nie |
| Zrušená | `cancelled` | storno zákazníkom alebo zamestnancom | nie |

\* Nová rezervácia kalendár neblokuje, ale vo verejnom kalendári sa daný termín zobrazí ako „čaká na potvrdenie“ a pri ďalšej rezervácii na rovnaký termín dostane admin upozornenie na kolíziu.

**Doplnil som stav `completed` (Ukončená)** – bez neho by rezervácia zostala navždy „Prebiehajúca“ a nedalo by sa reportovať.

Povolené prechody (vynucuj na serveri):
```
new        → confirmed | cancelled
confirmed  → modified | active | cancelled
modified   → confirmed | cancelled        (zamestnanec zmenu schváli = confirmed, alebo zamietne a vráti pôvodné údaje)
active     → completed
completed  → (koncový)
cancelled  → (koncový)
```

Pravidlá:
- `confirmed → active` automaticky cronom v čase vyzdvihnutia, alebo manuálne pri podpise odovzdávacieho protokolu.
- Pri úprave (`modified`) sa uloží pôvodná verzia aj navrhovaná zmena; admin vidí diff. Ak nový termín koliduje, systém to označí a zmenu nie je možné schváliť.
- Každá zmena stavu → záznam v `booking_status_history` (kto, kedy, z akého stavu, do akého, poznámka) + príslušný email.
- Ochrana pred dvojitou rezerváciou na úrovni DB: `EXCLUDE USING gist` nad `vehicle_id` a `tstzrange(pickup_at, return_at + buffer)` pre stavy `confirmed`, `modified`, `active` (rozšírenie `btree_gist`).
- **Buffer medzi prenájmami** (príprava, čistenie) – default 4 h, nastaviteľné per vozidlo.

## 6. Zákaznícka zóna (`/moj-ucet`)

### 6.1 Prihlásenie
- Prihlasovacie okno (modal aj samostatná stránka `/prihlasenie`): email + heslo, „Zabudnuté heslo“.
- Pri prvej rezervácii sa vytvorí účet v Supabase Auth (bez hesla) a zákazník dostane emailom **jednorazový odkaz „Nastaviť heslo“** (Supabase invite / recovery link, platnosť 72 h). Heslo sa **nikdy neposiela emailom**.
- Odkaz vedie na `/nastavit-heslo` → zákazník si zvolí vlastné heslo → je prihlásený a presmerovaný na detail rezervácie.
- Expirovaný odkaz → stránka s tlačidlom „Poslať nový odkaz“ (zadá email).
- Kým si heslo nenastaví, účet je v stave `pending` (`profiles.password_set = false`); prihlásiť sa dá aj cez „Zabudnuté heslo“, ktoré pošle rovnaký typ odkazu.
- Ak účet s emailom už existuje → rezervácia sa priradí k nemu, v emaile je len odkaz na prihlásenie.
- Pravidlá hesla: min. 10 znakov; rate limit prihlásení.

### 6.2 Prehľad
- zoznam rezervácií (aktuálne / minulé) so stavom
- detail aktuálnej rezervácie:
  - **countdown** do začiatku prenájmu (dni, hodiny, minúty); počas prenájmu countdown do odovzdania
  - pripravované vozidlo (fotka, názov, ŠPZ – zobraziť až po potvrdení, základné parametre)
  - termín od–do, miesto vyzdvihnutia a odovzdania (adresa + odkaz na mapu)
  - stav rezervácie s vysvetlením, čo nasleduje
  - rozpis ceny a doplnkov
  - **digitálny protokol** (odovzdávací a preberací) – náhľad + PDF na stiahnutie
  - **faktúra** (PDF) – keď ju admin nahrá
  - kontakty BTW (tel., email, adresa prevádzky)
  - **asistenčná služba** – default **+421 900 000 000** (nonstop; konfigurovateľné globálne aj per vozidlo, voliteľne poisťovňa a číslo poistnej zmluvy); na mobile tlačidlá „Zavolať“
  - akcie: **Upraviť rezerváciu**, **Zrušiť rezerváciu**

### 6.3 Úprava a storno zákazníkom
- Upraviť je možné: termín, miesta, doplnky, poznámku. Vozidlo nie (to cez kontakt s BTW).
- Úprava je možná len do X hodín pred vyzdvihnutím (default 48 h). Potom sa zobrazí výzva kontaktovať BTW.
- Úprava stavu `new` → zostáva `new` (len sa prepíšu údaje). Úprava stavu `confirmed` → **`modified`**, čaká na schválenie.
- **Storno podmienky** (počítané od času vyzdvihnutia, hranice a percentá nastaviteľné v admine):

| Čas storna pred vyzdvihnutím | Storno poplatok |
|---|---|
| viac ako 72 h | 0 % |
| 72 h – 24 h | 20 % z ceny rezervácie |
| menej ako 24 h | 100 % z ceny rezervácie |

- Pred potvrdením storna zákazník vidí **vypočítaný storno poplatok v €**; storno vyžaduje potvrdenie a voliteľný dôvod.
- Poplatok sa uloží do rezervácie (`cancellation_fee_cents`, `cancelled_at`, `cancelled_by`) a zobrazí v admine aj v emaile o zrušení. Storno zamestnancom: poplatok sa predvypočíta, admin ho môže upraviť alebo odpustiť (s dôvodom).
- Rezervácia s individuálnou cenou bez stanovenej ceny = storno bez poplatku.
- Storno podmienky zobraziť aj v kroku 3 formulára a na detaile vozidla.
- Profil: úprava kontaktných a fakturačných údajov, zmena hesla, žiadosť o vymazanie účtu.

## 7. Administrácia (`/admin`)

`noindex`, oddelený layout, prístup len pre zamestnancov.

### 7.1 Role a prístupy
| Rola | Práva |
|---|---|
| `owner` | všetko vrátane správy zamestnancov a nastavení |
| `manager` | rezervácie, vozidlá, príplatky, zákazníci, protokoly, faktúry |
| `operator` | rezervácie (zmena stavu, protokoly), čítanie vozidiel a zákazníkov |

- Pridanie zamestnanca: meno, email, rola → pozvánka emailom (odkaz na nastavenie hesla). Deaktivácia (nie vymazanie) zamestnanca.
- Prvý `owner` sa vytvorí seed skriptom `scripts/seed-owner.ts` (cez Supabase Admin API):
  - email: **`<firemný e-mail>`**
  - heslo: z env premennej **`SEED_OWNER_PASSWORD`** (`.env.local` lokálne, Vercel env pre preview/produkciu). **Heslo nikdy nezapisuj do kódu, seed SQL, dokumentácie ani commitu.**
  - skript je idempotentný (ak účet existuje, nič nemení)
- Každý zamestnanec si vie zmeniť heslo v admine (**Môj profil → Zmena hesla**); owner si heslo po spustení zmení sám.
- Odporúčané: 2FA (TOTP) pre zamestnancov cez Supabase MFA.

### 7.2 Dashboard
- dnešné a zajtrajšie vyzdvihnutia a odovzdania
- nové rezervácie čakajúce na potvrdenie, upravené rezervácie čakajúce na schválenie
- vozidlá aktuálne v prenájme
- jednoduché KPI: počet rezervácií, obrat a vyťaženosť vozidiel za zvolené obdobie

### 7.3 Rezervácie
- tabuľka: číslo (napr. `BTW-2026-0001`), zákazník, vozidlo, od–do, cena, stav, vytvorené; filtre (stav, vozidlo, obdobie), vyhľadávanie, export CSV
- **kalendárny pohľad** (timeline/Gantt: riadky = vozidlá, stĺpce = dni), farby podľa stavu
- detail: všetky údaje, zmena stavu (len povolené prechody), editácia všetkých polí, ručná úprava ceny s dôvodom, interné poznámky (zákazník ich nevidí), história stavov, log odoslaných emailov, protokoly, faktúra
- manuálne vytvorenie rezervácie (telefonická objednávka) – rovnaký výpočet ceny, voliteľne bez odoslania emailu
- pri `modified`: zobrazenie diffu pôvodné vs. nové, tlačidlá Schváliť / Zamietnuť

### 7.4 Vozidlá
- CRUD: názov, slug, značka, model, **kategória (Sedan / SUV / Limousine / Van)**, ŠPZ (interné), **VIN (povinný, unikátny, súčasť URL)**, motorizácia, výkon, palivo, prevodovka, počet miest, počet kufrov, popis (SK/EN), príznaky `for_rental` / `for_transfer`, aktívne / skryté, poradie zobrazenia
- fotky: upload do Supabase Storage, drag & drop poradie, hlavná fotka, automatická optimalizácia (Next Image)
- výbava: checklist z číselníka (Komfort / Technické / Bezpečnosť) + vlastné položky
- **kategórie vozidiel**: číselník v admine (default Sedan, SUV, Limousine, Van) – premenovanie, poradie, pridanie novej, skrytie; kategória sa zobrazuje na karte, v detaile a vo filtri
- cenové hladiny per vozidlo (1 / 2–5 / 6–14 / 15–30 dní; 30+ = individuálne); hranice hladín nastaviteľné globálne
- podmienky per vozidlo (prepíšu globálne): depozit, km limit/deň, cena za km navyše, min. vek, buffer
- **dostupnosť**: kalendár s blokáciami (servis, STK, súkromné použitie, iné) – blokácia má od–do a dôvod; obsadenosť z rezervácií zobrazená read-only
- asistenčné kontakty a poistenie per vozidlo

### 7.5 Príplatky
- CRUD: názov (SK/EN), popis, cena, typ (`per_day` / `per_rental`), max. počet kusov, strop ceny, aktívny
- priradenie: **globálne pre všetky vozidlá** alebo **len pre vybrané vozidlá**; override ceny na úrovni vozidla
- hromadná akcia „Aplikovať na všetky vozidlá“

### 7.6 Miesta vyzdvihnutia / odovzdania
- CRUD: názov, adresa, GPS/odkaz na mapu, príplatok, dostupné pre vyzdvihnutie / odovzdanie, aktívne

### 7.7 Zákazníci
- zoznam: meno, email, telefón, firma, počet rezervácií, obrat, posledná rezervácia; vyhľadávanie, export CSV
- detail: údaje, rezervácie, súhlasy (s dátumom a verziou VOP/GDPR), interné poznámky
- **reset hesla** → odošle zákazníkovi jednorazový odkaz na nastavenie nového hesla
- **vymazanie** (GDPR):
  - bez rezervácií → úplné vymazanie
  - s rezerváciami/faktúrami → **anonymizácia** osobných údajov (meno, email, telefón, adresa) + zrušenie Auth účtu; účtovné doklady sa zachovajú (zákonná archivácia 10 rokov)
  - akcia vyžaduje potvrdenie a zapíše sa do audit logu
- voliteľne príznak „blacklist“ s poznámkou (problémový zákazník) – upozornenie pri ďalšej rezervácii

### 7.8 Nastavenia
- môj profil: meno, email, **zmena hesla**, 2FA
- firemné údaje (pre PDF a emaily), DPH sadzba
- prevádzka 24/7 (žiadne otváracie hodiny v MVP; pripraviť len príznak pre budúce obmedzenie)
- bankové údaje pre prevod (IBAN, SWIFT, názov účtu), povolené platobné metódy
- min. predstih, min. dĺžka, tolerancia vrátenia, default buffer
- hranice cenových hladín
- storno pásma (default 72 h / 0 %, 72–24 h / 20 %, <24 h / 100 %) a lehota na úpravu, texty podmienok
- globálny depozit (1 000 €), km limit (300 km/deň), cena za km (0,62 €), min. vek (21), min. vlastníctvo VP (6 mesiacov)
- asistenčné kontakty
- notifikačné emaily pre admina (default `<firemný e-mail>`)
- verzie VOP a GDPR textov (pri zmene sa zvýši verzia, ukladá sa k súhlasu)

### 7.9 Audit log
Všetky zápisy v admine (kto, kedy, entita, akcia, zmenené polia). Read-only zobrazenie pre `owner`.

## 8. Digitálny protokol

Dva typy: **odovzdávací** (pri vyzdvihnutí) a **preberací** (pri vrátení). Vypĺňa zamestnanec v admine na tablete/mobile.

Obsah:
- vozidlo, ŠPZ, rezervácia, zákazník, dátum a čas, miesto
- stav tachometra (km), stav paliva (slider 0–100 % alebo osminy), nabitie (EV)
- čistota interiéru/exteriéru
- príslušenstvo (checklist: doklady, kľúče, autosedačky, strešný box, rezerva/sada, výstražný trojuholník, lekárnička, vesta…)
- **poškodenia**: schéma vozidla (pohľady zhora/zboku/spredu/zozadu), klik → značka + popis + fotka; pri preberacom protokole porovnanie s odovzdávacím (nové poškodenia zvýraznené)
- fotky (min. 4 povinné uhly, kamera mobilu priamo z prehliadača, kompresia pred uploadom)
- poznámka
- **podpis zákazníka a zamestnanca** (canvas), meno podpisujúceho
- vygenerované PDF → Supabase Storage → email zákazníkovi → viditeľné v zákazníckej zóne
- podpísaný protokol je **nemenný** (oprava len novou verziou s odkazom na pôvodnú)

Po preberacom protokole systém automaticky vypočíta:
- najazdené km a km nad limit (`(km_end − km_start) − limit × dni`) × cena/km
- rozdiel paliva (podklad, sumu zadá admin)
- návrh doúčtovania (km, palivo, poškodenia, meškanie) → admin potvrdí / upraví → podklad pre faktúru a vyúčtovanie depozitu

Podpis protokolu prepína stavy: odovzdávací → `active`, preberací → `completed`.

## 9. Faktúry a platby (MVP)

- **Systém rieši len rezerváciu, žiadne online platby.** Platí sa **bankovým prevodom, platobným terminálom alebo v hotovosti**.
- Rezervácia má **dve samostatné platby**, každú s vlastnou metódou a stavom (metódy sa môžu líšiť):

| Platba | Suma | Metóda | Stav |
|---|---|---|---|
| Prenájom | `total_cents` | `rental_payment_method` (`transfer` / `terminal` / `cash`) | `rental_payment_status` (`unpaid` / `paid` / `refunded` / `partially_refunded`) |
| Depozit | `deposit_cents` (1 000 €) | `deposit_payment_method` (`transfer` / `terminal` / `cash`) | `deposit_status` (`pending` / `received` / `returned` / `partially_returned`) + `deposit_returned_cents` |

- Zákazník volí preferovanú metódu pre obe platby vo formulári; admin ju môže zmeniť. Admin označuje prijatie platby (dátum, kto) a vrátenie depozitu (suma, dátum, metóda, dôvod zrážky z vyúčtovania).
- Pri prevode: potvrdzujúci email obsahuje IBAN, sumu, **variabilný symbol = číselná časť čísla rezervácie** a splatnosť; voliteľne **QR kód Pay by square**.
- V zákazníckej zóne zobraziť stav oboch platieb a pokyny k platbe.
- Dashboard: neuhradené platby pred vyzdvihnutím, depozity na vrátenie.
- Faktúru vystavuje BTW vo svojom účtovnom systéme; admin nahrá **PDF** k rezervácii (podporuj viac dokladov: zálohová, finálna, dobropis, doúčtovanie). Po nahratí email zákazníkovi + dostupné v zóne.
- Depozit: evidencia `deposit_status` (`pending` / `received` / `returned` / `partially_returned`) + suma vrátená.
- Fakturačný systém cez API (napr. SuperFaktúra) – len pripraviť rozhranie, neimplementovať teraz.

## 10. Emaily (Resend + React Email)

Brandované šablóny (čierna, zlatá #B88746, tenké zlaté linky, logo), SK/EN podľa jazyka zákazníka, plain-text verzia. Odosielateľ **`BY THE WAVE <info@rental.btw.sk>`**, reply-to `<firemný e-mail>` (overiť subdoménu `rental.btw.sk` v Resend – SPF, DKIM, DMARC záznamy v DNS). Každý odoslaný email sa loguje do `email_log` (typ, príjemca, Resend ID, stav).

| # | Udalosť | Príjemca |
|---|---|---|
| 1 | Nová rezervácia – prijatie + číslo + sumár + odkaz „Nastaviť heslo“ (nový účet) / odkaz na prihlásenie (existujúci účet) | zákazník |
| 2 | Nová rezervácia – notifikácia s odkazom do adminu | admin |
| 3 | Rezervácia potvrdená (+ .ics súbor do kalendára, platobné pokyny pre prenájom a depozit) | zákazník |
| 4 | Úprava rezervácie zákazníkom – notifikácia | admin |
| 5 | Úprava schválená / zamietnutá | zákazník |
| 6 | Rezervácia zrušená (kto, dôvod) | zákazník + admin |
| 7 | Pripomienka 24 h pred vyzdvihnutím (miesto, čas, čo si priniesť: OP, VP, depozit) | zákazník |
| 8 | Odovzdávací protokol (PDF) | zákazník |
| 9 | Pripomienka 24 h pred odovzdaním | zákazník |
| 10 | Preberací protokol (PDF) + vyúčtovanie | zákazník |
| 11 | Faktúra k dispozícii | zákazník |
| 12 | Poďakovanie + žiadosť o Google recenziu (X dní po ukončení) | zákazník |
| 13 | Reset hesla, pozvánka zamestnanca | zákazník / zamestnanec |

## 11. Nefunkčné požiadavky

### 11.1 Bezpečnosť
- RLS na všetkých tabuľkách. Zákazník vidí len svoje dáta. Admin operácie cez server s kontrolou role; `service_role` kľúč nikdy na klientovi.
- Storage bucket-y privátne (protokoly, faktúry, fotky protokolov) – prístup cez signed URL. Fotky vozidiel verejné.
- Server-side validácia všetkého (Zod), Turnstile + rate limit na formulár a login.
- Interné polia (ŠPZ, interné poznámky, blacklist) sa nikdy neposielajú na verejné endpointy.

### 11.2 Čas a dáta
- Všetky časy `timestamptz`, zobrazenie v `Europe/Bratislava`. Pozor na prechod letného/zimného času pri výpočte dní.
- Peniaze v centoch (integer).

### 11.3 Jazyky
- SK default bez prefixu (`rental.btw.sk/sedan/...`), EN s prefixom `/en` (`rental.btw.sk/en/sedan/...`) – `next-intl` s `localePrefix: 'as-needed'`, `hreflang`. EN mutácia pre expatov a dlhodobý prenájom. Texty v `messages/sk.json`, `messages/en.json`. Prekladové polia v DB (`name_sk`, `name_en` alebo JSONB).

### 11.4 SEO
- Katalóg, kategórie a detaily vozidiel indexovateľné (SSR/ISR, `sitemap.xml`, `robots.txt`, canonical, schema.org). Admin, zóna a formulár `noindex`.
- Analytika (GTM, dataLayer) je **mimo scope** tohto zadania – doplní sa neskôr.

### 11.5 Kvalita
- TypeScript strict, ESLint, Prettier.
- Unit testy: výpočet ceny, prechody stavov, dostupnosť/kolízie.
- E2E (Playwright): celý rezervačný flow, nastavenie hesla cez odkaz z emailu, úprava potvrdenej rezervácie → `modified`, potvrdenie v admine.
- Lighthouse na verejných stránkach ≥ 90.

## 12. Dátový model (Supabase) – návrh

```
profiles               id (= auth.users.id), type (customer|staff), first_name, last_name, phone,
                       date_of_birth, company_name, ico, dic, ic_dph, billing_address (jsonb),
                       locale, password_set, is_blacklisted, blacklist_note,
                       anonymized_at, created_at
staff_roles            user_id, role (owner|manager|operator), is_active, invited_by
vehicle_categories     id, slug (sedan|suv|limousine|van), name (jsonb sk/en), sort_order, is_active
vehicles               id, slug, name, brand, model, category_id, license_plate*, vin (unique, not null), engine,
                       power_kw, fuel, transmission, seats, luggage, description (jsonb sk/en),
                       for_rental, for_transfer, is_active, sort_order,
                       deposit_cents, km_limit_per_day, extra_km_cents, min_driver_age (21),
                       min_license_months (6),
                       buffer_minutes, assistance (jsonb)
vehicle_images         id, vehicle_id, storage_path, alt, sort_order, is_main
features               id, group (comfort|technical|safety), name (jsonb)
vehicle_features       vehicle_id, feature_id
price_tiers            id, min_days, max_days (null = individuálne)          -- globálne hranice
vehicle_prices         vehicle_id, tier_id, price_per_day_cents
extras                 id, name (jsonb), description, price_cents, pricing_type (per_day|per_rental),
                       max_quantity, max_charge_cents, is_global, is_active
vehicle_extras         vehicle_id, extra_id, price_override_cents, is_enabled
locations              id, name, address, map_url, surcharge_cents, for_pickup, for_return, is_active
availability_blocks    id, vehicle_id, starts_at, ends_at, reason, note, created_by
bookings               id, number, customer_id, vehicle_id, status, pickup_at, return_at,
                       pickup_location_id, return_location_id, customer_note, internal_note,
                       days, price_snapshot (jsonb), subtotal_cents, total_cents, vat_rate,
                       is_individual_price, deposit_cents,
                       rental_payment_method, rental_payment_status, rental_paid_at,
                       deposit_payment_method, deposit_status, deposit_received_at,
                       deposit_returned_cents, deposit_returned_at, km_limit_per_day, extra_km_cents, locale,
                       abroad_trip, abroad_countries, cancellation_fee_cents,
                       cancelled_at, cancelled_by, cancellation_reason,
                       pending_change (jsonb), created_by (customer|staff), created_at
                       + EXCLUDE constraint (viď sekcia 5)
booking_extras         booking_id, extra_id, name_snapshot, quantity, unit_price_cents,
                       pricing_type, total_cents
booking_status_history id, booking_id, from_status, to_status, changed_by, note, created_at
consents               id, profile_id, booking_id, type (terms|gdpr|marketing|deposit|km_limit),
                       version, granted_at, ip, user_agent
handover_protocols     id, booking_id, type (pickup|return), odometer_km, fuel_level,
                       cleanliness (jsonb), accessories (jsonb), note, customer_signature_path,
                       staff_signature_path, signed_by_name, signed_at, pdf_path, created_by,
                       supersedes_id
protocol_damages       id, protocol_id, view, x, y, description, photo_path, is_new
protocol_photos        id, protocol_id, angle, storage_path
documents              id, booking_id, type (proforma|invoice|credit_note|settlement),
                       number, storage_path, amount_cents, issued_at, uploaded_by
settlements            id, booking_id, extra_km, extra_km_cents, fuel_cents, damage_cents,
                       late_cents, other_cents, note, approved_by
settings               key, value (jsonb)
email_log              id, booking_id, type, to, resend_id, status, created_at
audit_log              id, actor_id, entity, entity_id, action, diff (jsonb), created_at
```
\* interné polia – nie vo verejných views.

Verejné čítanie cez **views / RPC** (`public_vehicles`, `vehicle_availability(vehicle_id, from, to)`), nie priamo z tabuliek. Migrácie v `supabase/migrations`, seed (`supabase/seed.sql`) s **vozidlami extrahovanými z btw.sk/nase-vozidla vo Fáze 0** (zaradenými do kategórií Sedan / SUV / Limousine / Van), **cenou 79 € / deň vo všetkých hladinách** (placeholder, reálne ceny doplní admin), kategóriami, miestom Bratislava – Trenčianska 56/A, príplatkami a storno pásmami z tohto zadania a `owner` účtom `<firemný e-mail>` (viď 7.1).

## 13. Návrh štruktúry routov

```
app/[locale]/page.tsx                              katalóg (rental.btw.sk/)
app/[locale]/[kategoria]/page.tsx                  kategória (rental.btw.sk/sedan)
app/[locale]/[kategoria]/[vozidlo]/page.tsx        detail (rental.btw.sk/sedan/mercedes-benz-e-220d-<VIN>)
app/[locale]/rezervacia/page.tsx                   3-krokový formulár (?vehicle=slug)
app/[locale]/rezervacia/dakujeme/page.tsx
app/[locale]/prihlasenie/page.tsx
app/[locale]/moj-ucet/...                          zákaznícka zóna
app/admin/...                                      administrácia (bez locale, SK)
lib/pricing.ts | lib/booking-status.ts | lib/availability.ts
emails/*.tsx                                       React Email šablóny
supabase/migrations/*.sql
```
Statické routy (`rezervacia`, `prihlasenie`, `nastavit-heslo`, `moj-ucet`, `admin`, `en`, `api`…) majú prednosť pred `[kategoria]`. Tieto slová sú **rezervované** – admin ich nesmie použiť ako slug kategórie (validácia). Neplatná kategória → 404.

## 14. Fázy implementácie

| Fáza | Obsah | Výstup na schválenie |
|---|---|---|
| 0 | Repo/Vercel, import vozidiel z btw.sk/nase-vozidla, design tokeny z live btw.sk | `docs/ANALYSIS.md` + `seed/vehicles.json` |
| 1 | DB schéma, RLS, migrácie, seed, typy (`supabase gen types`) | migrácie + popis RLS |
| 2 | Auth (zákazník, zamestnanci, role, odkaz na nastavenie hesla) | funkčné prihlásenie |
| 3 | Admin: vozidlá, fotky, výbava, ceny, príplatky, miesta, blokácie, nastavenia | naplnené vozidlá |
| 4 | Verejný katalóg + detail + kalendár dostupnosti | preview URL |
| 5 | Rezervačný formulár + `calculatePrice` + testy + emaily 1–2 | end-to-end rezervácia |
| 6 | Admin rezervácie: zoznam, timeline, detail, stavy, manuálna rezervácia, emaily 3–6 | |
| 7 | Zákaznícka zóna: countdown, detail, úprava → `modified`, storno | |
| 8 | Protokoly (schéma poškodení, fotky, podpisy, PDF), vyúčtovanie | |
| 9 | Faktúry/dokumenty, cron (stavy, pripomienky, recenzie), zákazníci + GDPR, audit log | |
| 10 | EN mutácia, SEO, doména rental.btw.sk, E2E testy, výkon, bezpečnostný review | release checklist |

Po každej fáze: zhrnutie zmien, zoznam súborov, ako to otestovať na preview.

## 15. Rozhodnuté

- Prihlásenie: jednorazový odkaz na nastavenie hesla (heslo sa neposiela emailom).
- Zahraničné cesty: povolené, bez príplatku, len informatívne pole.
- Miesto vyzdvihnutia a odovzdania: štandardne Bratislava, Trenčianska 56/A.
- Prevádzka: non-stop (24/7), bez príplatkov za čas.
- Storno: >72 h zdarma, 72–24 h 20 %, <24 h 100 %.
- Ceny: zatiaľ 79 € / deň pre všetky vozidlá a hladiny.
- Kategórie: Sedan, SUV, Limousine, Van (filter + admin číselník).
- Vodič: min. 21 rokov, vodičský preukaz min. 6 mesiacov.
- Doména: všetko beží na `rental.btw.sk`, repo a Vercel projekt `btw-rental`; btw-web sa nemení.
- URL vozidla: `rental.btw.sk/{kategoria}/{nazov-vozidla}-{VIN}`.
- Vozidlá: prvý import z btw.sk/nase-vozidla, ďalej len manuálne cez admin.
- Analytika/GTM: mimo scope.
- Owner admin: `<firemný e-mail>`, dočasné heslo cez `SEED_OWNER_PASSWORD`, po spustení ho zmení v admine.
- Emaily: odosielateľ `info@rental.btw.sk` (Resend).
- Asistenčná služba: +421 900 000 000.
- Platby: len rezervácia, bez online platby. Prenájom a depozit sú dve samostatné platby, každá prevodom, terminálom alebo v hotovosti.

## 16. Otvorené otázky

1. IBAN / SWIFT pre platbu prevodom (do nastavení v admine; seed s placeholderom).
2. Prístup k DNS btw.sk – CNAME `rental.btw.sk` na Vercel a overenie subdomény v Resend (SPF, DKIM, DMARC).

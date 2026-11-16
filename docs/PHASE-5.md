# Fáza 5 – Rezervačný formulár, `calculatePrice`, testy, e-maily 1–2

## Stránky

| URL | Obsah |
|---|---|
| `/rezervacia?vozidlo={VIN}` (EN `/en/rezervacia`) | trojkrokový formulár; `od` / `do` z filtra katalógu predvyplnia termín |
| `/rezervacia/dakujeme?cislo=BTW-…` | poďakovanie s číslom rezervácie a ďalšími krokmi |
| `/admin/rezervacie`, `/admin/rezervacie/[id]` | **len na čítanie** – zoznam a detail prijatých rezervácií (cena, súhlasy, záznam o e-mailoch) |
| `/admin/emaily` | náhľady e-mailov 1 a 2 s ukážkovými údajmi (HTML aj textová verzia) |

## Formulár

1. **Termín a miesto** – vozidlo (predvyplnené z odkazu, dá sa zmeniť), dátum a čas vyzdvihnutia a odovzdania (po 30 minútach, non-stop), miesto, cesta do zahraničia, rozbaľovací kalendár dostupnosti. Pri prechode ďalej server overí predstih, minimálnu dĺžku a či je vozidlo voľné.
2. **Údaje a doplnky** – kontakt (telefón s predvoľbou), dátum narodenia (vek ku dňu vyzdvihnutia), vodičský preukaz, súkromná osoba / firma, fakturačná adresa, doplnky s počtom kusov, spôsob platby zvlášť pre prenájom a depozit, súhlas s depozitom a limitom km, poznámka.
3. **Sumarizácia** – prehľad, rozpis ceny (základ, DPH, depozit zvlášť), storno podmienky, súhlasy s VOP a spracovaním údajov, voliteľný marketingový súhlas, odoslanie.

- **Cenový súhrn** je viditeľný celý čas: na počítači vpravo, na mobile ako lišta dole s rozbaliteľným rozpisom.
- **Údaje sa nestratia:** krok je v URL (`?krok=2`), rozpísaný formulár v `sessionStorage`. Funguje tlačidlo Späť aj obnovenie stránky; po odoslaní sa koncept zmaže.
- **Miesto** sa zobrazuje len informatívne, kým je aktívne jediné; výber (s príplatkom) sa objaví po pridaní ďalšieho v admine.
- **31 a viac dní** → formulár sa prepne na dopyt: rezervácia vznikne bez ceny (`is_individual_price`), doplnky sa uložia s jednotkovými cenami.
- **Prihlásený zákazník** má údaje predvyplnené z profilu a e-mail zamknutý na svoj účet.

## Výpočet ceny (`lib/pricing.ts`)

Čistá funkcia `calculatePrice()`; rovnaký kód počíta priebežný súhrn v prehliadači aj záväznú cenu na serveri. **Prehliadač cenu nikdy neposiela.**

- **Dni** = začaté 24-hodinové bloky od vyzdvihnutia; tolerancia (59 min) nezačína ďalší deň. Počíta sa podľa miestnych hodín (Europe/Bratislava): sobota 10:00 → nedeľa 10:00 je jeden deň aj v noc zmeny času (23 alebo 25 skutočných hodín).
- **Sadzba** hladiny podľa celkovej dĺžky platí pre všetky dni.
- **Doplnky:** `per_day` × dni × kusy, `per_rental` × kusy. **Strop `max_charge` platí na jeden kus** za celý prenájom (zadanie to bližšie neurčuje).
- **DPH:** ceny sú s DPH; základ = zaokrúhlené `spolu × 100 / (100 + sadzba)`, DPH = rozdiel, takže súčet vždy sedí.
- Do rezervácie sa ukladá **snapshot** (`price_snapshot`, `booking_extras`, depozit, limit km) – neskoršie zmeny cenníka ju nezmenia.

## Vytvorenie rezervácie

`createBookingAction` (`lib/booking/actions.ts`): validácia Zod (rovnaké schémy ako v prehliadači) → ochrana proti spamu → čerstvé dáta z databázy (nie 5-minútová cache) → cena → účet → `create_booking()` → e-maily → poďakovanie.

- **`create_booking(jsonb)`** (migrácia `20261116120000_create_booking.sql`) zapíše v jednej transakcii profil, rezerváciu, doplnky a súhlasy a znova overí dostupnosť. Volať ju môže len server (service role). Vracia aj počet iných nepotvrdených rezervácií na rovnaký termín a príznak blacklistu – pre notifikáciu.
- **Účet:** nový e-mail → účet bez hesla; existujúci e-mail → rezervácia sa priradí k nemu. **Profil existujúceho účtu sa z neprihláseného formulára neprepisuje** (inak by ktokoľvek mohol cudzí e-mail použiť na zmenu údajov); rezervácia má vlastnú kópiu údajov v `customer_snapshot`. Ak vytvorenie rezervácie zlyhá, práve vytvorený účet sa zmaže.
- **Súhlasy** (VOP, osobné údaje, depozit, limit km, vodičský preukaz, marketing áno/nie) sa ukladajú s verziou, časom, IP a prehliadačom.
- **Stav** je `new` – kalendár neblokuje, vo verejnom kalendári je „čaká na potvrdenie“.

## Ochrana proti spamu

| Vrstva | Bez kľúčov | S kľúčmi Turnstile |
|---|---|---|
| Honeypot (skryté pole) + minimálny čas vyplnenia 4 s | áno | áno |
| Rate limit: 10 rezervácií / hod na IP, 5 / hod na e-mail | áno | áno |
| Cloudflare Turnstile (formulár aj prihlásenie) | vypnuté | zapnuté |

Turnstile sa zapne sám, keď budú nastavené **obe** premenné `NEXT_PUBLIC_TURNSTILE_SITE_KEY` a `TURNSTILE_SECRET_KEY`.

## E-maily (React Email, `emails/`)

| # | Šablóna | Príjemca |
|---|---|---|
| 1 | `booking-received.tsx` – číslo, sumár, cena s DPH, platba, ďalšie kroky; nový účet dostane jednorazový odkaz „Nastaviť heslo“ (72 h), existujúci len odkaz na prihlásenie. SK / EN podľa jazyka formulára. | zákazník |
| 2 | `booking-admin-notification.tsx` – odkaz do adminu, kontakt na zákazníka, upozornenia (kolízia s inou nepotvrdenou rezerváciou, blacklist, chýbajúca cena). Odpoveď ide priamo zákazníkovi. | adresy z Nastavení |

Každý e-mail má aj textovú verziu a zapisuje sa do `email_log`. Odosielajú sa až po odpovedi zákazníkovi; neúspešný e-mail rezerváciu nikdy nezruší.

**Bez `RESEND_API_KEY`:** rezervácia vznikne normálne, e-maily sa neodošlú (v detaile rezervácie sú ako „neodoslaný – odosielanie nie je nastavené“) a ďakovná stránka e-mail nesľubuje. Zákazník si po zapnutí e-mailov vyžiada odkaz cez „Zabudnuté heslo“.

## Testy

- `npm test` – **87 unit testov** (pribudlo 46): cena (1, 5, 6, 14, 15, 30, 31 dní, tolerancia, letný/zimný čas, doplnky, strop, príplatky za miesto, DPH), validácia formulára (predstih, vek ku dňu vyzdvihnutia, firma, súhlasy), obsah oboch e-mailov.
- `supabase/tests/02_booking.sql` – **18 testov** `create_booking` na lokálnom Postgrese: uloženie, súhlasy, história, neprepísanie cudzieho profilu, kolízia a blacklist, blokovanie potvrdenou rezerváciou vrátane 4 h prípravy, atomickosť, oprávnenia.
- Prehliadač (25 krokov, lokálne proti Supabase): validácie, priebežná cena, tolerancia, prepnutie na dopyt, overenie dostupnosti, doplnky, Späť a obnovenie stránky bez straty údajov, mobil, EN.
- `EMAIL_PREVIEW_DIR=/cesta npm test` uloží vyrenderované e-maily ako HTML.

**Čo som overiť nemohol:** samotné odoslanie formulára cez web. Lokálne nie je servisný kľúč Supabase, takže posledný krok (vytvorenie účtu + zápis) beží až na Verceli. Funkciu `create_booking` som na ostrej databáze spustil v transakcii, ktorá sa vrátila späť (číslo `BTW-2026-0001` ostalo voľné). Neoverené sú aj: reálne doručenie e-mailov (chýba Resend) a Turnstile (chýbajú kľúče).

## Ako otestovať na preview

1. Katalóg → vozidlo → **Rezervovať**. Vyplňte termín aspoň 24 h dopredu, prejdite všetky tri kroky a odošlite. Použite e-mail, ktorý v systéme ešte nie je.
2. Zobrazí sa poďakovanie s číslom `BTW-2026-0001`.
3. Admin → **Rezervácie** → otvorte ju: cena, doplnky, súhlasy a dva záznamy o e-mailoch („neodoslaný“, kým nie je Resend).
4. Detail vozidla → kalendár: termín je označený ako „čaká na potvrdenie“.
5. Skúste termín na 31+ dní → formulár sa zmení na dopyt, rezervácia je bez ceny.
6. Admin → **E-maily**: náhľad oboch šablón.
7. Na mobile: lišta s cenou dole, „Rozpis ceny“.

Testovacie rezervácie sa zatiaľ nedajú zrušiť z adminu (Fáza 6); pred spustením ich zmažem z databázy.

## Poznámky

- `types/database.ts`: záznam funkcie `create_booking` je doplnený ručne v tvare, aký generuje Supabase.
- Zoznam a detail rezervácií v admine sú zámerne len na čítanie; potvrdenie, úpravy, kalendár a e-maily 3–6 sú Fáza 6.
- E-maily na heslo (reset, pozvánka) ostávajú v pôvodnej jednoduchej šablóne; do React Email ich prevediem spolu s e-mailom 13.

## Úpravy po prvom testovaní klientom

**Katalóg**
- Čipy kategórií: aktívna je vždy len jedna (Všetky / Sedan / SUV…); každá vedie na vlastnú stránku.
- Filtre sú zbalené pod „Filtre“ a otvoria sa na kliknutie (zostanú otvorené, kým je niektorý aktívny).
- Vlastné šípky v rozbaľovacích poliach; dátumové pole otvorí kalendár po kliknutí kdekoľvek do poľa.
- Karta vozidla má ikony pre palivo, prevodovku, počet miest a batožinu.

**Detail vozidla**
- Fotky interiéru vypĺňajú celý rámik; hlavná (vystrihnutá) fotka ostáva celá.
- Parametre majú popisky „Typ pohonu“ a „Batožinový priestor“.
- **Kalendár je interaktívny** a je hneď pod úvodom, nad výbavou: klik na deň vyzdvihnutia, klik na deň odovzdania → „Rezervovať tento termín“ prenesie termín do formulára. Obsadené dni sa nedajú vybrať a rozsah cez ne nejde.
- Z kalendára zmizlo „čaká na potvrdenie“; nepotvrdené rezervácie sa verejne nezobrazujú (ani v API).
- Cenník, príplatky, podmienky a storno sú štyri rovnaké karty v mriežke 2 × 2.
- Tlačidlá „Rezervovať“ sú na mobile na celú šírku.

**Formulár**
- Dátumové polia sa na mobile zmestia do karty; vysvetľujúci odsek pod termínom je preč.
- Tlačidlá sú na všetkých krokoch rovnako: na mobile na celú šírku pod sebou, hlavné hore.
- Po prechode na ďalší krok aj po odoslaní sa stránka posunie na začiatok.
- Telefón: pre +421 a +420 presne 9 číslic (úvodná nula sa ignoruje), inde 6 – 12.
- Kalendár vo formulári je tiež interaktívny a vyplní oba dátumy.
- **Pristavenie na vlastnú adresu** (vyzdvihnutie aj odovzdanie zvlášť): zákazník zadá adresu, v cene sa zobrazí „Pristavenie na adresu – podľa vzdialenosti“ a upozornenie, že poplatok mu BTW oznámi pred potvrdením. Adresa sa ukladá do `bookings.pickup_custom_address` / `return_custom_address` (migrácia `20261117090000_custom_locations.sql`), je v oboch e-mailoch a v admine; notifikácia pre BTW na to upozorní.
  - **Poplatok sa zatiaľ nepočíta automaticky.** Automatický výpočet podľa kilometrov potrebuje mapovú službu (API kľúč) a sadzbu za km – čaká na rozhodnutie klienta.

**Admin**
- Nová navigácia: úzka horná lišta (Prehľad, Rezervácie, Vozidlá, ostatné pod „Viac“, účet v menu); na mobile spodná lišta so štyrmi tlačidlami.
- **Rezervácie pre mobil:** záložky podľa stavu s počtami, filter podľa vozidla a dátumu, karty s tlačidlami **Potvrdiť / Zrušiť / Vydať vozidlo / Ukončiť**. Rovnaké tlačidlá sú v detaile. Pravidlá prechodov a ochranu pred dvojitou rezerváciou stráži databáza; kolízia pri potvrdení sa ohlási zrozumiteľne. Rezervácia bez ceny sa potvrdiť nedá.
- Prehľad ukazuje, čo treba riešiť dnes: čakajúce na potvrdenie, vozidlá v prenájme, dnešné vyzdvihnutia a odovzdania.
- Zmena stavu zatiaľ **neposiela e-mail zákazníkovi** (e-maily 3–6) a storno z adminu nepočíta storno poplatok – oboje je Fáza 6, rovnako ako úprava rezervácie a ceny.

Testy: 90 unit testov, 19 SQL testov `create_booking`, prehliadač (desktop + iPhone) vrátane zmeny stavov na testovacej rezervácii, ktorú som potom zmazal spolu s testovacím účtom.

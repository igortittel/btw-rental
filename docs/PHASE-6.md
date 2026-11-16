# Fáza 6 – Admin rezervácie: zoznam, kalendár, detail, stavy, manuálna rezervácia, e-maily

## Obrazovky

| URL | Obsah | Kto |
|---|---|---|
| `/admin` | čo treba riešiť: čakajúce na potvrdenie, úpravy na schválenie, vozidlá v prenájme, dnešné a zajtrajšie vyzdvihnutia a odovzdania; výsledky za obdobie (počet rezervácií, obrat, vyťaženosť) | operator+ |
| `/admin/rezervacie` | záložky podľa stavu, vyhľadávanie (číslo, meno, e-mail, telefón, firma), filter podľa vozidla a dátumu, rýchle zmeny stavu, export CSV | operator+ |
| `/admin/rezervacie/kalendar` | časová os: riadok = vozidlo, stĺpec = deň, 28 dní, farby podľa stavu, blokácie; na mobile sa posúva do strán | operator+ |
| `/admin/rezervacie/[id]` | všetky údaje, zmena stavu, úprava, storno, interné poznámky, história stavov, súhlasy, záznam o e-mailoch | operator+ |
| `/admin/rezervacie/[id]/upravit` | úprava termínu, vozidla, miest, zákazníka, doplnkov, platby a ceny | manager+ |
| `/admin/rezervacie/nova` | manuálna rezervácia (telefonická objednávka) | manager+ |
| `/admin/rezervacie/export` | CSV podľa rovnakých filtrov ako zoznam | operator+ |

## Stavy

- **Potvrdiť / Vydať vozidlo / Ukončiť** jedným ťuknutím v zozname aj v detaile. Povolené prechody a ochranu pred dvojitou rezerváciou vynucuje databáza; `lib/booking-status.ts` je ich kópia pre rozhranie (pokrytá testom). Kolízia pri potvrdení sa ohlási zrozumiteľne, rezervácia bez ceny sa potvrdiť nedá.
- **Potvrdenie pošle zákazníkovi e-mail 3.** Hláška po akcii povie, či e-mail odišiel.
- **Zrušenie** je v detaile (tlačidlo „Zrušiť“ v zozname tam vedie), lebo treba rozhodnúť o poplatku:
  - poplatok sa predvypočíta zo storno pásiem v Nastaveniach podľa času do vyzdvihnutia;
  - zamestnanec ho môže zmeniť alebo odpustiť, ale musí uviesť dôvod – ten sa zapíše do interných poznámok;
  - rezervácia bez ceny sa ruší bez poplatku; poplatok nemôže prevýšiť cenu;
  - uloží sa `cancellation_fee_cents`, `cancelled_at`, `cancelled_by`, dôvod; odíde e-mail 6 zákazníkovi aj BTW.

## Úprava rezervácie a cena

Upravovať sa dá rezervácia v stave Nová, Potvrdená a Prebiehajúca. Uloženie je jedna transakcia (`staff_update_booking`) a zapisuje sa do audit logu s menom zamestnanca. Stav sa úpravou nemení; presun na obsadený termín odmietne databáza.

Cena má tri režimy:

| Režim | Správanie |
|---|---|
| **Ponechať** (predvolené pri úprave) | suma ostane, aj keď sa medzitým zmenil cenník alebo iné údaje |
| **Podľa cenníka** | prepočet `calculatePrice()` z aktuálneho cenníka |
| **Vlastná cena** | suma s DPH zadaná ručne + povinný dôvod; takto sa dopĺňa aj individuálna cena pri 31+ dňoch |

E-mail zákazníka sa v úprave nemení (určuje jeho účet).

## Manuálna rezervácia

Rovnaký výpočet ceny ako na webe. Voliteľne hneď **Potvrdená** (potom musí mať cenu) alebo **Nová**; voliteľne **bez e-mailu** zákazníkovi. Podľa e-mailu sa priradí k existujúcemu účtu, inak vznikne nový účet bez hesla. Minimálny predstih, vek ani fakturačná adresa sa tu nevyžadujú. V histórii je ako autor zamestnanec.

## E-maily

| # | Šablóna | Kedy |
|---|---|---|
| 3 | `booking-confirmed.tsx` – potvrdenie, platobné pokyny zvlášť pre prenájom a depozit; pri prevode IBAN, SWIFT, variabilný symbol (číselná časť čísla rezervácie), suma a splatnosť; čo si priniesť; príloha `.ics` | po potvrdení |
| 6 | `booking-cancelled.tsx` – kto zrušil, dôvod, storno poplatok; verzia pre zákazníka (SK/EN) a pre BTW | po zrušení |

- **Kým je IBAN v Nastaveniach len vzorový, e-mail ho neukáže** – namiesto neho je veta, že platobné údaje pošlete samostatne.
- Splatnosť = potvrdenie + počet dní z Nastavení, najneskôr deň pred vyzdvihnutím.
- Náhľady všetkých šablón: Admin → Viac → E-maily.
- QR kód Pay by square (v zadaní voliteľný) zatiaľ nie je.

## Presunuté do Fázy 7

E-maily **4** (úprava zákazníkom) a **5** (úprava schválená / zamietnutá) a obrazovka s porovnaním pôvodnej a novej verzie. Stav „Upravená“ vzniká až v zákazníckej zóne, ktorá je Fáza 7 – bez nej by sa to nedalo vyskúšať. Prehľad už dlaždicu „Úpravy na schválenie“ má.

Evidencia prijatých platieb a vrátenia depozitu (zadanie, sekcia 9) je vo Fáze 9.

## Oprava chyby z Fázy 5

Po úspešnom odoslaní rezervácie mohol formulár zobraziť „Rezerváciu sa nepodarilo odoslať“, hoci rezervácia vznikla – ošetrenie chýb v prehliadači pohltilo presmerovanie na ďakovnú stránku. Akcie teraz cieľ presmerovania vracajú a prehliadač naň prejde sám. Týka sa verejného formulára aj editora v admine.

## Testy

- `npm test` – **126 unit testov** (pribudlo 35): prechody stavov, storno poplatok na hraniciach 72 h a 24 h, ručná cena, KPI, variabilný symbol, splatnosť, `.ics`, pravidlá admin formulára, e-maily 3 a 6.
- `supabase/tests/02_booking.sql` – **28 testov**: rezervácia zadaná zamestnancom, úprava (atomickosť, audit log, zákaz dvojitej rezervácie, oprávnenia).
- Prehliadač (lokálne, dočasný účet manažéra a testovacia rezervácia, oboje potom zmazané): vyhľadávanie, export, úprava s prepočtom, vlastná cena s dôvodom, poznámka, potvrdenie, časová os, storno s upraveným poplatkom, história, mobil bez pretekania.

**Čo som overiť nemohol** (lokálne chýba servisný kľúč): uloženie manuálnej rezervácie cez web a skutočné odoslanie e-mailov 3 a 6. Databázovú časť manuálnej rezervácie som overil priamo v databáze.

## Ako otestovať na preview

1. Na webe odošlite rezerváciu – po odoslaní sa má zobraziť ďakovná stránka, nie chyba.
2. Admin → Rezervácie → **Potvrdiť**. V detaile pribudne záznam o e-maile „Rezervácia potvrdená“ (neodoslaný, kým nie je Resend).
3. Detail → **Upraviť rezerváciu**: posuňte odovzdanie o deň, zvoľte „Podľa cenníka“, uložte. Potom skúste „Vlastná cena“ bez dôvodu.
4. Pridajte internú poznámku.
5. **Kalendár**: rezervácia je na časovej osi.
6. Detail → **Zrušenie rezervácie**: zmeňte poplatok bez dôvodu (odmietne), potom s dôvodom.
7. **+ Nová rezervácia**: telefonická objednávka, stav Potvrdená, bez e-mailu.
8. **Export CSV** po vyfiltrovaní.
9. Prehľad → prepnite obdobie vo „Výsledkoch“.

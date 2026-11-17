# Fáza 8 – Protokoly, PDF, vyúčtovanie, e-maily 8 a 10

Obrazovky zodpovedajú schválenej ukážke (odovzdávací a preberací protokol, PDF pre zákazníka, vyúčtovanie).

## Obrazovky

| URL | Obsah | Kto |
|---|---|---|
| `/admin/rezervacie/[id]/protokol/odovzdavaci` | sprievodca v piatich krokoch, po podpise prehľad, PDF, opravná verzia | operator+ |
| `/admin/rezervacie/[id]/protokol/preberaci` | to isté pri vrátení, s porovnaním s odovzdaním | operator+ |
| `/admin/rezervacie/[id]/vyuctovanie` | návrh doúčtovania a jeho potvrdenie | zobraziť operator+, upraviť a potvrdiť manager+ |
| `/api/protocols/[id]/pdf` | PDF podpísaného protokolu (zamestnanec ľubovoľný, zákazník len svoj) | prihlásený |

- **Detail rezervácie** má sekciu „Protokoly a vyúčtovanie“ so stavom oboch protokolov, odkazmi na PDF a vyúčtovanie.
- **Zoznam a detail rezervácie:** tlačidlá „Vydať vozidlo“ a „Ukončiť“ nahradili **„Odovzdať vozidlo“** a **„Prevziať vozidlo“**, ktoré otvoria protokol. Ak protokol pri aute nejde vyplniť, v detaile je menší odkaz „Vydať vozidlo bez protokolu“ / „Ukončiť bez protokolu“ (s potvrdením, do histórie sa zapíše „Bez protokolu“).
- **Prehľad** má zoznam „Vyúčtovania na potvrdenie“ – vrátené vozidlá bez potvrdeného vyúčtovania.
- **Zákaznícka zóna:** v detaile rezervácie pribudli podpísané protokoly (PDF) a po potvrdení aj vyúčtovanie s depozitom.

## Protokol

1. **Vozidlo a stav** – dátum a čas, tachometer, palivo v osminách (elektromobil: nabitie v %, plug-in hybrid oboje), čistota interiéru a exteriéru, pri odovzdaní voliteľne číslo vodičského preukazu a OP. Pri preberaní je pri každom údaji stav z odovzdania: najazdené km oproti limitu, chýbajúce palivo, meškanie.
2. **Príslušenstvo** – štandardný zoznam (osvedčenie, zelená karta, kľúče s počtom, trojuholník, lekárnička, vesta, rezerva) plus doplnky z rezervácie. Pri preberaní len to, čo sa odovzdalo; nevrátené je červené.
3. **Poškodenia** – päť pohľadov na schému, ťuknutie = značka, druh, popis, fotka detailu. Pri preberaní sú pôvodné značky sivé a nedajú sa meniť, nové sú červené a označené „Nové“.
4. **Fotky** – štyri povinné uhly + interiér, tachometer, ľubovoľný počet ďalších. Fotoaparát sa otvorí priamo z prehliadača, fotka sa pred nahratím zmenší na 1600 px (JPEG). Pri preberaní je odkaz na fotku z odovzdania.
5. **Kontrola a podpisy** – súhrn, poznámka, podpis prstom zákazníka aj zamestnanca, mená. Kým niečo chýba, tlačidlo „Podpísať a uzavrieť“ je vypnuté a nad ním je zoznam toho, čo treba doplniť.

- **Rozpracovaný protokol sa ukladá priebežne** (pri každom kroku a 1,5 s po zmene). Po zatvorení stránky sa dá pokračovať; zahodiť ho možno dole na stránke.
- **Podpis** (`sign_protocol`) skontroluje úplnosť, uzamkne protokol a zmení stav rezervácie: odovzdávací → Prebiehajúca, preberací → Ukončená (zápis do histórie „… protokol podpísaný“ s menom zamestnanca). Potom sa vytvorí PDF a zákazník dostane e-mail.
- **Nemennosť:** podpísaný protokol, jeho poškodenia ani fotky sa nedajú zmeniť ani zmazať (databáza). Jediná povolená zmena je jednorazové pripojenie PDF.
- **Oprava:** „Vytvoriť opravnú verziu“ otvorí kópiu (verzia 2 s odkazom na pôvodnú), ktorú treba znova podpísať so zákazníkom. Pôvodná ostáva uložená, stav rezervácie sa nemení, platná je najvyššia podpísaná verzia.
- **Ak PDF zlyhá**, podpis platí; na stránke protokolu je tlačidlo „Vytvoriť PDF“. E-mail sa dá poslať znova tlačidlom „Poslať protokol e-mailom znova“.

## PDF

`lib/pdf/protocol-pdf.tsx` (`@react-pdf/renderer`), A4: hlavička s logom BTW, prenajímateľ / nájomca / vozidlo, tabuľka stavu (pri preberaní stĺpce Pri odovzdaní / Pri prevzatí / Rozdiel), príslušenstvo, schémy poškodení so značkami a tabuľka (nové červené), fotodokumentácia, detaily poškodení, poznámka, vyhlásenie a podpisy. V päte „Podpísané elektronicky … · dokument je nemenný“.

- Písmo Montserrat (latinka + slovenská diakritika) a logo sú vložené v `lib/pdf/assets.generated.ts` (generuje `node scripts/build-pdf-assets.mjs` z `assets/fonts/` a `public/images/logo.svg`).
- Ukladá sa do privátneho bucketu `protocols`, fotky a podpisy do `protocol-media` (priečinok `<booking_id>/<protocol_id>/`).
- **Vercel:** pdfkit načítava štandardné písma cez interné importy, ktoré balenie funkcie nesleduje – v `next.config.js` sú preto výslovne v `outputFileTracingIncludes`. Bez toho PDF na Verceli zlyhá (`MODULE_NOT_FOUND …/standard-fonts/Helvetica.cjs`).

## Vyúčtovanie

Návrh (`lib/settlement.ts`, `proposeSettlement`) sa počíta z platných protokolov:

| Položka | Návrh |
|---|---|
| Kilometre nad limit | `(km pri vrátení − km pri odovzdaní) − limit × dni`, × cena za km z rezervácie |
| Palivo | rozdiel v osminách ako podklad, sumu zadá zamestnanec |
| Poškodenia | každé nové poškodenie z preberacieho protokolu má vlastnú sumu (`damage_items`) |
| Meškanie | po tolerancii (59 min) každý ďalší začatý deň × denná sadzba rezervácie; deň sa počíta rovnako ako pri cene prenájmu. Pri individuálnej cene sa suma nenavrhne. |
| Iné | suma + povinný popis; pod poľom sú pripomienky z protokolu (nevrátené príslušenstvo, znečistenie) |

- Každú sumu možno prepísať. **Uložiť návrh** – zákazník ho nevidí. **Potvrdiť vyúčtovanie** – zákazník ho vidí v zóne a dostane e-mail. **Otvoriť na úpravu** stiahne potvrdenie.
- Súčet, depozit a „Na vrátenie zákazníkovi“ / „Doplatok nad rámec depozitu“ sa prepočítavajú priamo pri písaní.
- Zápis samotného vrátenia depozitu (dátum, spôsob) je Fáza 9.

## E-maily

| # | Šablóna | Kedy |
|---|---|---|
| 8 | `protocol-signed.tsx` (odovzdávací) – PDF v prílohe, termín vrátenia, limit km, asistenčná služba | po podpise odovzdávacieho protokolu |
| 10 | `protocol-signed.tsx` (preberací) – PDF v prílohe, počet nových poškodení, informácia, že vyúčtovanie príde samostatne | po podpise preberacieho protokolu |
| 10 | `settlement.tsx` – položky, súčet, depozit, suma na vrátenie / doplatok, poznámka | po potvrdení vyúčtovania |

SK aj EN podľa jazyka rezervácie (PDF je vždy po slovensky). Náhľady: Admin → Viac → E-maily. Zápis do `email_log` ako doteraz.

## Databáza

Migrácia `20261119090000_protocols.sql` (aplikovaná aj na Supabase):

- `handover_protocols`: `driver_license_no`, `id_document_no`; jeden rozpracovaný protokol daného typu na rezerváciu, unikátne verzie.
- `protocol_damages.kind` (škrabanec, preliačina, odrenina, prasklina, iné).
- `settlements`: `damage_items`, `late_minutes`, `other_label`.
- `start_protocol` (aj opravná verzia), `save_protocol_draft` (súbory musia byť v priečinku rezervácie), `sign_protocol` (kontrola úplnosti, tachometer nie nižší ako pri odovzdaní, zmena stavu).
- Storage: zákazník môže čítať len PDF podpísaného protokolu vlastnej rezervácie; fotky a podpisy nie.

## Testy

- `npm test` – **168 unit testov** (pribudlo 25): palivo v osminách, príslušenstvo, kontrola úplnosti, návrh vyúčtovania (limit km, tolerancia meškania na hranici 59/60 min, viac dní, bez sadzby), riadky vyúčtovania, depozit, e-maily 8 a 10, vytvorenie PDF so slovenskou diakritikou.
- `supabase/tests/04_protocols.sql` – **40 testov**: kto môže začať, stav rezervácie, úplnosť pri podpise, cudzie súbory, zmena stavu a história, nemennosť (úprava, mazanie, PDF len raz), viditeľnosť pre zákazníka, porovnanie pri preberaní, tachometer, opravná verzia, zahodenie rozpracovaného, oprávnenia pri vyúčtovaní, prístup k PDF v storage.
- Prehliadač (lokálne, iPhone 13): odovzdávací protokol až po podpisy vrátane nahrávania fotiek a fotky poškodenia. **Na preview overil klient:** podpis odovzdávacieho protokolu a PDF (po oprave balenia písiem).

## Ako otestovať na preview

1. Potvrdenú rezerváciu otvorte v admine → **Odovzdať vozidlo** → Začať.
2. Vyplňte všetkých päť krokov na mobile alebo tablete (fotky cez fotoaparát), podpíšte. Rezervácia je Prebiehajúca, **Zobraziť PDF**.
3. Zatvorte stránku uprostred vypĺňania a otvorte znova – údaje ostanú.
4. **Prevziať vozidlo** → zadajte vyšší tachometer, menej paliva, vypnite vestu, pridajte poškodenie. Skontrolujte porovnania a červené značky. Podpíšte – rezervácia je Ukončená.
5. **Vyúčtovanie** → doplňte palivo a poškodenie → **Potvrdiť vyúčtovanie**.
6. Ako zákazník v `/moj-ucet` → rezervácia: protokoly (PDF) a vyúčtovanie.
7. Na podpísanom protokole skúste **Vytvoriť opravnú verziu** – v detaile rezervácie bude „verzia 2“.

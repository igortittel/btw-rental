# Fáza 7 – Zákaznícka zóna, úpravy a storno zákazníkom, schvaľovanie úprav

## Stránky (SK aj EN)

| URL | Obsah |
|---|---|
| `/moj-ucet` | aktuálne a minulé rezervácie so stavom, odkaz na profil a novú rezerváciu |
| `/moj-ucet/rezervacie/[id]` | odpočet, vozidlo, termín a miesta s odkazom na mapu, cena, platba, kontakty, asistencia, úprava, storno |
| `/moj-ucet/rezervacie/[id]/upravit` | zmena termínu, miest, doplnkov a poznámky s priebežnou cenou |
| `/moj-ucet/profil` | kontaktné a fakturačné údaje, zmena hesla, žiadosť o vymazanie účtu |

Zákazník vidí len vlastné rezervácie (RLS + výslovný filter); cudzia alebo neexistujúca rezervácia je 404.

## Detail rezervácie

- **Odpočet** do vyzdvihnutia (dni, hodiny, minúty); počas prenájmu do odovzdania.
- **ŠPZ sa zobrazí až po potvrdení** – číta sa cez `my_booking_plate()`, ktorá ju vráti len vlastníkovi potvrdenej rezervácie. Vo verejných dátach ŠPZ naďalej nie je.
- Stav s vysvetlením, čo nasleduje; rozpis ceny a doplnkov; spôsob a stav oboch platieb; pri prevode variabilný symbol.
- Kontakty BTW a asistenčná služba s tlačidlami „Zavolať“ (asistencia od potvrdenia).
- Protokoly a faktúry pribudnú vo Fázach 8 a 9.

## Úprava zákazníkom

- Meniť možno termín, miesta (vrátane pristavenia), doplnky a poznámku; vozidlo nie.
- Najneskôr **48 h pred vyzdvihnutím** (z Nastavení). Potom, pri ručne dohodnutej cene a pri rezervácii bez ceny sa zobrazí výzva kontaktovať BTW.
- Cena sa prepočíta na serveri z aktuálneho cenníka; obsadený termín sa odmietne hneď.
- **Nová** rezervácia sa prepíše a ostáva Nová.
- **Potvrdená** prejde do stavu **Upravená**: návrh je v `pending_change`, riadok drží pôvodné údaje, takže vozidlo ostáva blokované na pôvodný termín, kým zamestnanec nerozhodne. Ďalšia úprava sa dovtedy poslať nedá.
- BTW dostane e-mail 4 s porovnaním pôvodných a nových hodnôt.

## Schvaľovanie v admine

- Prehľad má dlaždicu „Úpravy na schválenie“, zoznam tlačidlo **Posúdiť úpravu**.
- Detail ukáže tabuľku Pôvodne / Navrhované a tlačidlá **Schváliť** / **Zamietnuť** (zamietnutie vyžaduje správu pre zákazníka).
- **Kolízia:** ak navrhovaný termín medzitým obsadila iná potvrdená rezervácia alebo blokácia, stránka to ohlási, schválenie je vypnuté a databáza by ho aj tak odmietla.
- Obe rozhodnutia vrátia rezerváciu do stavu Potvrdená, zapíšu sa do histórie a zákazník dostane e-mail 5.

## Storno zákazníkom

- Pred potvrdením vidí **vypočítaný poplatok v €** a storno pásma; musí zaškrtnúť súhlas, dôvod je voliteľný.
- **Záväzný poplatok počíta databáza** v okamihu zrušenia (`cancel_my_booking`) – z prehliadača sa žiadna suma neberie. Pravidlo je rovnaké ako v `lib/cancellation.ts`; zhodu na hraniciach 72 h a 24 h overujú testy na oboch stranách.
- Zrušiť možno rezerváciu Novú, Potvrdenú aj Upravenú (čakajúca úprava zanikne); prebiehajúci prenájom nie.
- Odíde e-mail 6 zákazníkovi aj BTW.

## Profil

Úprava kontaktných a fakturačných údajov (e-mail sa nemení), zmena hesla s overením aktuálneho, žiadosť o vymazanie účtu – tá sa len zaznamená (`deletion_requested_at`); vymazanie alebo anonymizáciu vykoná zamestnanec vo Fáze 9.

## E-maily

| # | Šablóna | Príjemca |
|---|---|---|
| 4 | `booking-change.tsx` → úprava od zákazníka (čaká na schválenie / zapísaná priamo), s upozornením na kolíziu | BTW |
| 5 | `booking-change.tsx` → úprava schválená / zamietnutá, platné znenie rezervácie, správa od BTW | zákazník |

Náhľady: Admin → Viac → E-maily.

## Opravy starších chýb

- **Tlačidlá „Zrušiť“ v zozname rezervácií (Fáza 6) niekedy nereagovali** – odkazy s kotvou cez klientsku navigáciu nedobehli, ak boli pri načítaní stránky viditeľné. Sú to teraz bežné odkazy.
- Formuláre s viacerými tlačidlami teraz odosielajú, ktoré bolo stlačené (zachytené pri teste schvaľovania, ešte pred nasadením).

## Databáza

Migrácia `20261118090000_customer_zone.sql`: `cancel_my_booking`, `my_booking_plate`, `customer_update_booking` (len server), `resolve_booking_change` (zamestnanci), `private.cancellation_fee_cents`, spoločný zápis `private.apply_booking_record`.

## Testy

- `npm test` – **143 unit testov** (pribudlo 17): lehota na úpravu, porovnanie zmien, zhoda storno poplatku s databázou, e-maily 4 a 5.
- `supabase/tests/03_customer_zone.sql` – **35 testov**: storno poplatok na hraniciach, cudzia rezervácia, úprava novej a potvrdenej rezervácie, blokovanie pôvodného termínu, schválenie, zamietnutie, kolízia, oprávnenia.
- Prehliadač (lokálne, dočasné účty zákazníka a operátora, potom zmazané): zoznam, detail s odpočtom a ŠPZ, formulár úpravy s cenou, storno s poplatkom 20 %, profil, heslo, žiadosť o vymazanie, EN, mobil; v admine posúdenie a schválenie úpravy.

**Čo som overiť nemohol:** odoslanie úpravy zákazníkom cez web (potrebuje servisný kľúč – stav „Upravená“ som pre test vytvoril priamo v databáze) a skutočné odoslanie e-mailov.

## Ako otestovať na preview

1. Na webe vytvorte rezerváciu a v admine ju potvrďte.
2. Zákazníkovi nastavte heslo: Prihlásenie → „Zabudnuté heslo“ pošle odkaz až po zapnutí e-mailov; dovtedy použite účet, ktorý heslo má.
3. `/moj-ucet` → rezervácia → odpočet, ŠPZ, platba.
4. **Upraviť rezerváciu** → posuňte termín → odošlite. Stav sa zmení na „Úprava čaká na schválenie“.
5. Admin → Prehľad → „Úpravy na schválenie“ → **Posúdiť úpravu** → Schváliť alebo Zamietnuť.
6. V zóne skúste **Zrušiť rezerváciu** na inej rezervácii – pozrite poplatok podľa termínu.
7. **Môj profil** → zmeňte údaje, heslo.

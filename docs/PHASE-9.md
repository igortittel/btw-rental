# Fáza 9 – Platby a depozit, doklady, denný cron, zákazníci a GDPR, audit log, 2FA

Obrazovky zodpovedajú schválenej ukážke (Artifact „BTW Rental – Fáza 9 ukážka“) a rozhodnutiam klienta z 18. 11. 2026.

## Rozhodnutia klienta

| Otázka | Rozhodnutie |
|---|---|
| Cron | Vercel Hobby, **raz denne**, `0 5 * * *` UTC = v zime 6:00–7:00, v lete 7:00–8:00 (vždy pred ôsmou). Pripomienky chodia **deň vopred**. |
| Prechod Potvrdená → Prebiehajúca | **Len podpisom odovzdávacieho protokolu**, cron stav nemení. Prehľad zvýrazní „termín vyzdvihnutia uplynul“. |
| E-mail 12 a blacklist | Zákazník na blackliste žiadosť o recenziu nedostane. |
| Pripomienka neuhradeného prevodu | Nie, zatiaľ manuálne. |
| Platby pred vyzdvihnutím | **Všetko musí byť uhradené pred vyzdvihnutím** – v zozname sú všetky spôsoby platby; odovzdávací protokol sa nedá podpísať bez úhrady prenájmu a prijatia depozitu (dajú sa zaznamenať priamo v protokole). |
| Účet na vrátenie depozitu | Nové pole v profile (`profiles.refund_iban`), vyplní zákazník alebo manažér. |
| Zrušenie záznamu o platbe | Len manažér / majiteľ, zapíše sa do audit logu. |
| QR Pay by square | Zatiaľ nie. |
| Doklady | Nahráva a maže manažér / majiteľ; zobrazujú sa pri rezervácii (nie samostatná stránka). |
| iKros | Len rozhranie (`lib/invoicing/provider.ts`), tlačidlo je skryté. |
| Anonymizácia | Manažér aj majiteľ. Ostávajú rezervácie, sumy, doklady a podpísané protokoly. |
| Blacklist | Upozornenie aj pri zhode e-mailu alebo telefónu s iným účtom, aj v e-maile 2. |
| Audit log | Len majiteľ, záznamy sa nemažú. Zmeny profilu zákazníka zamestnancom sa zapisujú bez hodnôt. |
| 2FA | **Povinné pre všetkých zamestnancov** (TOTP). |

## Obrazovky

| URL | Obsah | Kto |
|---|---|---|
| `/admin` | nové dlaždice: neuhradené pred vyzdvihnutím (14 dní), depozity na vrátenie, žiadosti o vymazanie; zoznamy k nim; „termín vyzdvihnutia uplynul“; panel Automatické e-maily (posledný beh cronu) | operator+ (žiadosti o vymazanie manager+) |
| `/admin/rezervacie/[id]` | sekcie **Platby** (prenájom, depozit, vrátenie depozitu podľa vyúčtovania, vrátenie platby pri storne, zrušenie záznamu) a **Doklady** (nahratie PDF, e-mail 11, zmazanie); upozornenie na blacklist; meno zákazníka vedie na jeho detail | zaznamenať platbu operator+, vrátiť / zrušiť manager+, doklady manager+ |
| `/admin/rezervacie` | štítky „Blacklist“ a „Neuhradené“ | operator+ |
| `/admin/rezervacie/[id]/protokol/odovzdavaci` | v poslednom kroku chýbajúce platby s formulárom na zaznamenanie | operator+ |
| `/admin/zakaznici` | zoznam s hľadaním, filtrami (blacklist, žiadosť o vymazanie, anonymizovaní), export CSV | operator+ |
| `/admin/zakaznici/[id]` | údaje, rezervácie, súhlasy, interné poznámky, blacklist, IBAN na vrátenie, odkaz na nové heslo, vymazanie / anonymizácia (potvrdenie slovom ANONYMIZOVAŤ) | čítanie operator+, úpravy manager+ |
| `/admin/audit` | audit log s filtrami (obdobie, kto, oblasť, číslo rezervácie), rozbalenie zmien | owner |
| `/admin/zamestnanci` | stav 2FA, „Zresetovať 2FA (stratený telefón)“ | owner |
| `/admin/nastavenia` | prepínač „Pred odovzdaním vozidla vyžadovať úhradu…“ | owner |
| `/moj-ucet/rezervacie/[id]` | dátum úhrady, vrátený depozit, pokyny k prevodu (IBAN, VS, suma) pri neuhradenom prevode, **Doklady** na stiahnutie | zákazník |
| `/moj-ucet/profil` | IBAN na vrátenie depozitu | zákazník |
| `/api/documents/[id]` | PDF dokladu (RLS: zamestnanec ľubovoľný, zákazník len svoj) | prihlásený |
| `/api/cron/daily` | denný beh, len s `Authorization: Bearer $CRON_SECRET` | Vercel Cron |

## Denný cron (`lib/cron/daily.ts`)

- **E-mail 7** – vyzdvihnutie od teraz do konca zajtrajška (Potvrdená / Upravená). Obsahuje čo si priniesť, depozit a neuhradený prenájom.
- **E-mail 9** – vrátenie do konca zajtrajška, ak bolo vozidlo vyzdvihnuté pred zajtrajškom.
- **E-mail 12** – Ukončená rezervácia s vrátením aspoň `review_request_days` dní dozadu (najviac 30 dní), nie blacklist, nie anonymizovaný, jeden e-mail na zákazníka za beh; len ak je vyplnený `google_review_url`.
- **Bez duplicít:** každý e-mail sa pred odoslaním „zaberie“ v databáze (`pickup_reminder_sent_at`, `return_reminder_sent_at`, `review_requested_at` sa nastaví len ak je prázdny). Pri zlyhaní odoslania sa uvoľní a skúsi sa pri ďalšom behu.
- **Upratovanie:** expirované odkazy na heslo (> 7 dní) a staré záznamy rate limitu.
- Výsledok sa zapíše do `cron_runs` a zobrazí na prehľade.

## 2FA

- Supabase MFA (TOTP). Po prihlásení heslom admin namiesto obsahu ukáže QR kód (prvé prihlásenie) alebo pole na kód. Po overení je relácia `aal2`.
- `getSessionUser()` vracia `aal`; `getStaff()` (server akcie, API) vyžaduje `aal2`; admin layout pri `aal1` zobrazí krok 2FA.
- **Databáza:** `private.is_staff()` vyžaduje `aal2`, keď je v nastaveniach `staff_mfa_enforced = true`. Na Supabase je zatiaľ **vypnuté**, aby súčasná produkcia (kód z `main` bez 2FA) fungovala. **Po zlúčení Fázy 9 do `main` treba zapnúť** (SQL: `update settings set value = 'true' where key = 'staff_mfa_enforced'`).
- Stratený telefón: majiteľ v Zamestnancoch „Zresetovať 2FA“ (zapíše sa do audit logu).

## Databáza

Migrácia `20261121090000_phase9.sql` (aplikovaná aj na Supabase):

- `bookings`: vrátenie platby (`rental_refunded_*`), kto vrátil depozit, `pickup_reminder_sent_at`, `return_reminder_sent_at`; `profiles.refund_iban`; `documents.file_name`, `emailed_at`; tabuľka `cron_runs`.
- RPC: `record_payment`, `record_deposit_return` (po potvrdenom vyúčtovaní alebo storne, suma ≤ depozit), `record_rental_refund`, `undo_payment`, `anonymize_customer` (bez rezervácií vymaže, inak anonymizuje; idempotentné; nie pri otvorenej rezervácii).
- `sign_protocol`: odovzdávací protokol vyžaduje platby (`require_payment_before_pickup`, na Supabase zatiaľ **false** z rovnakého dôvodu ako 2FA – po zlúčení zapnúť v Nastaveniach).
- Doklady: cesta musí byť `<booking_id>/…` (trigger + storage politika), zákazník číta PDF len svojich rezervácií.
- Audit: trigger na `profiles` s redakciou hodnôt; `app.skip_audit` pri anonymizácii (inak by sa osobné údaje skopírovali do nemenného logu).
- View `admin_customers` (security invoker, len zamestnanci, len na čítanie).
- Security Advisor: bez nových nálezov okrem nových RPC, ktoré si rolu overujú vo vnútri (rovnako ako doterajšie).

## E-maily

| # | Šablóna | Kedy |
|---|---|---|
| 7 | `booking-reminder.tsx` (pickup) | cron, deň pred vyzdvihnutím |
| 9 | `booking-reminder.tsx` (return) | cron, deň pred vrátením |
| 11 | `document-available.tsx` – PDF v prílohe | po nahratí dokladu (zaškrtnuté), alebo „Poslať e-mailom“ |
| 12 | `review-request.tsx` – Google recenzia | cron, 3 dni po vrátení |

Náhľady: Admin → Viac → E-maily.

## Zmena ceny po úhrade (pripomienka klienta, 18. 11. 2026)

Rezervácia sa môže zmeniť aj po úhrade (schválená úprava zákazníkom, úprava zamestnancom). Preto sa ukladá **uhradená suma** (`rental_paid_cents`, `deposit_received_cents`), nie len stav „uhradené“:

- **Cena stúpla** → „Doplatok X €“: v detaile tlačidlo „Zaznamenať doplatok“, na prehľade medzi neuhradenými, v zóne „zostáva doplatiť X €“ s pokynmi k prevodu na doplatok, v pripomienke 7 a odovzdávací protokol čaká na doplatok.
- **Cena klesla** → „Preplatok X €“: v detaile „Vrátiť preplatok“ (manažér), v zóne „preplatok vám vrátime“. Vrátenie sa sčítava, najviac do zaplatenej sumy.
- **Depozit** rovnako (zvýšenie → doplatok depozitu; vrátenie po prenájme najviac do prijatej sumy).
- Pri posudzovaní úpravy od zákazníka admin vidí, či po schválení vznikne doplatok alebo preplatok.
- Pravidlo je v databáze (`private.rental_outstanding_cents`, `deposit_outstanding_cents` – používa `sign_protocol`) aj v `lib/payment.ts` (`rentalOutstandingCents`, `rentalOverpaidCents`, …). Migrácia `20261122090000_payment_amounts.sql` doplnila sumy aj k už zaznamenaným platbám.

## Opravené staršie chyby

- **Duplicitné kľúče v detaile rezervácie** (zoznam e-mailov – ten istý e-mail poslaný dvakrát) – React hlásil chybu a obnova stránky po akcii mohla zlyhať.

## Známy problém (staršia chyba, nie z Fázy 9)

Lokálne v produkčnom builde sa **na detaile rezervácie** po odoslaní formulára (poznámka, platba, doklad) dáta uložia, ale tlačidlo niekedy ostane na „Ukladám…“, kým sa stránka neobnoví. Rovnako sa správa aj kód z `main` (Fáza 8); na detaile zákazníka to nenastáva a vo vývojovom režime tiež nie. Príčina sa nepodarila nájsť (nie je to konkrétna sekcia – výsledok sa líši medzi pokusmi). Treba overiť na preview – ak sa to deje aj tam, vyriešime to samostatne.

## Testy

- `npm test` – **194 unit testov** (pribudlo 26): platby pred vyzdvihnutím (rovnaké pravidlo ako databáza), návrh vrátenia depozitu, dátum platby, doklady (cesty, PDF hlavička, názov súboru), blacklist (e-mail, telefón v inom zápise), okná cronu (aj zmena času), audit (preklady, redakcia), CSV, e-maily 7, 9, 11, 12.
- `supabase/tests/06_phase9.sql` – **65 testov** (vrátane zmeny ceny a depozitu po úhrade – doplatok, preplatok, vrátenie najviac do zaplatenej sumy): oprávnenia platieb, dvojité zaznamenanie, budúci dátum, vrátenie depozitu len po vyúčtovaní, suma, vrátenie platby, zrušenie záznamu, audit; doklady (cesta, traversal, operátor nesmie, cudzí zákazník nevidí ani nestiahne); `admin_customers`; redakcia auditu profilu; anonymizácia (otvorená rezervácia, údaje, snapshoty, súhlasy, e-mail log, interné údaje, jeden záznam v audite bez osobných údajov, idempotencia, úplné vymazanie bez rezervácií); 2FA (aal1 bez práv pri zapnutom vynútení, vlastná rola čitateľná). `04_protocols.sql` doplnený o kontrolu platieb pri podpise.
- Prehliadač (lokálne, dočasný účet majiteľa): registrácia 2FA s QR kódom a prihlásenie kódom, prehľad, zaznamenanie úhrady a depozitu, nahratie a stiahnutie dokladu, zmazanie dokladu, zákazníci, detail zákazníka, audit log, mobil bez horizontálneho posunu.
- **Lokálne sa nedalo overiť** (chýba `SUPABASE_SERVICE_ROLE_KEY`): odoslanie e-mailov 7, 9, 11, 12, beh cronu, zrušenie Auth účtu pri anonymizácii, reset 2FA zamestnanca, stav 2FA v zozname zamestnancov.

## Ako otestovať na preview

1. **2FA:** prihláste sa do adminu → naskenujte QR kód (Google Authenticator / 1Password) → zadajte kód. Odhláste sa a prihláste znova – pýta sa len kód.
2. **Platby:** potvrdená rezervácia → Platby → „Označiť ako uhradené“ / „Depozit prijatý“. Prehľad: dlaždica Neuhradené sa zmení.
3. V Nastaveniach zapnite „Pred odovzdaním vozidla vyžadovať úhradu…“ a skúste odovzdávací protokol bez platby – v poslednom kroku sú platby medzi chýbajúcimi a dajú sa zaznamenať priamo tam.
4. **Depozit:** ukončená rezervácia s potvrdeným vyúčtovaním → „Zaznamenať vrátenie depozitu“ (predvyplnená suma). Ako zákazník v Mojom účte uvidíte vrátenú sumu.
5. **Doklady:** detail rezervácie → Nahrať doklad (PDF) so zaškrtnutým e-mailom → zákazník dostane e-mail 11 s PDF a doklad vidí v Mojom účte.
6. **Zákazníci:** Admin → Zákazníci → detail → poznámka, blacklist (potom vytvorte rezerváciu s tým istým telefónom – upozornenie v detaile aj v e-maile 2).
7. **GDPR:** ako zákazník Môj profil → Požiadať o vymazanie → v admine Prehľad → Žiadosti o vymazanie → Anonymizovať (napíšte ANONYMIZOVAŤ).
8. **Audit log:** Admin → Viac → Audit log (majiteľ).
9. **Cron:** Vercel → projekt → Settings → Cron Jobs → `/api/cron/daily` → Run. Výsledok na prehľade v paneli Automatické e-maily.

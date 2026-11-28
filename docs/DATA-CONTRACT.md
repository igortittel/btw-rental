# DATA-CONTRACT – BTW

Jediný zdroj pravdy o tom, ako si btw-admin, btw-rental a btw-web vymieňajú dáta.
Originál žije v `btw-admin/docs/DATA-CONTRACT.md`. V btw-rental a btw-web je jeho kópia v `docs/DATA-CONTRACT.md` – needitovať, len synchronizovať z btw-admin.

Verzia: 0.1 (návrh) · Supabase projekt: **btw** (jeden pre celú firmu)

---

## 1. Architektúra

| Repo | Vercel projekt | Doména | Úloha |
|---|---|---|---|
| btw-admin | btw-admin | admin.btw.sk | Správa celej firmy (2FA). **Vlastník schémy DB.** |
| btw-rental | btw-rental | rental.btw.sk | Verejný web a rezervácie prenájmu, klientska zóna |
| btw-web | btw-web | btw.sk | Hlavný web, preprava osôb, zoznam vozidiel |

Pravidlá:
- Migrácie (`supabase/migrations`) existujú **iba v btw-admin**.
- btw-rental a btw-web **nečítajú tabuľky priamo**. Čítajú len pohľady a volajú len funkcie z tohto dokumentu.
- `service_role` kľúč má iba btw-admin, a to len na serveri. Weby používajú publishable/anon kľúč, prípadne prihláseného klienta (rental).
- Na základných tabuľkách je zapnuté RLS. Rola `anon` k nim nemá prístup, má ho iba ku kontraktovým objektom.

## 2. Moduly v databáze

| Modul | Obsah | Kto spravuje |
|---|---|---|
| Spoločné | zákazníci (firma / objednávateľ / pasažier), vozidlá, používatelia a roly, audit log | admin |
| Prenájom | rezervácie, cenníky, protokoly, výbava | admin (+ rental zapisuje rezervácie cez RPC) |
| Preprava | triedy transferu, objednávky jázd, vodiči, cenník prepravy | admin (+ btw.sk zapisuje objednávky cez RPC) |

Vozidlo je jedna tabuľka pre oba moduly. Pole určuje, či je auto dostupné pre prenájom, prepravu alebo oboje. Dostupnosť sa kontroluje naprieč modulmi, aby jedno auto nebolo v rovnakom čase v prenájme aj na jazde.

## 3. Čítanie (views) – verejný kontrakt

| Objekt | Používa | Účel |
|---|---|---|
| `v_public_vehicles` | rental, web | Zoznam áut do gridu: slug, názov, kategória, cena/deň, osoby, batožina, prevodovka, fotky, `detail_url` (absolútna URL detailu na rental.btw.sk) |
| `v_public_transport_classes` | web | Business Class, First Class, Business Van: slug, názov, popis, kapacita, fotka, `booking_url` (`https://www.btw.sk/rezervacie?trieda={slug}`) |
| `v_public_vehicle_availability` | rental | Obsadenosť áut pre kalendár rezervácie (bez osobných údajov) |

Stĺpce sa dopĺňajú (nový stĺpec nič nerozbije). **Premenovanie alebo zmazanie stĺpca je breaking change** – viď bod 6.

## 4. Zápis (RPC)

| Funkcia | Volá | Účel |
|---|---|---|
| `create_rental_booking(...)` | rental | Vytvorí rezerváciu prenájmu a overí dostupnosť |
| `create_transport_order(...)` | web | Vytvorí objednávku prepravy z formulára btw.sk |

Funkcie validujú vstup na strane DB. Frontendy nesmú zapisovať priamo do tabuliek.

## 5. Ostatné toky

- **Fotky:** Supabase Storage, bucket `vehicles` (verejné čítanie). Nahráva iba admin.
- **E-maily:** Resend. Servisné e-maily rentalu z `info@rental.btw.sk`.
- **Dispečerská appka:** _otvorené – nahradiť admin.btw.sk, alebo integrovať?_

## 6. Zmena kontraktu

1. Zmena sa robí iba v btw-admin: migrácia + úprava tohto dokumentu + zvýšenie verzie.
2. Breaking change (premenovanie/zmazanie stĺpca, zmena parametrov RPC) = najprv sa pridá nová verzia (`v_public_vehicles_v2`), weby sa prepnú, potom sa stará zmaže.
3. Po zmene sa skopíruje `DATA-CONTRACT.md` a vygenerované typy (`types/supabase.ts`) do btw-rental a btw-web.

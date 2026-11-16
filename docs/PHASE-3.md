# Fáza 3 – Admin: vozidlá, fotky, výbava, ceny, príplatky, miesta, blokácie, nastavenia

## Obrazovky

| URL | Obsah | Úpravy |
|---|---|---|
| `/admin/vozidla` | zoznam s hlavnou fotkou, kategóriou, ŠPZ, VIN, cenou „od“ a stavom | manager+ |
| `/admin/vozidla/nove` | základné údaje, živý náhľad verejnej URL | manager+ |
| `/admin/vozidla/[id]` | Údaje · Fotky · Ceny · Výbava · Príplatky · Podmienky a asistencia · Dostupnosť · Zmazanie | manager+ (operator len číta) |
| `/admin/kategorie` | názov SK/EN, slug, poradie, skrytie, pridanie | manager+ |
| `/admin/priplatky` | CRUD, pre všetky / len vybrané vozidlá, „Aplikovať na všetky vozidlá“ | manager+ |
| `/admin/miesta` | CRUD, príplatok, vyzdvihnutie/odovzdanie, predvolené miesto | manager+ |
| `/admin/nastavenia` | firma a DPH, banka a platby, pravidlá rezervácie, podmienky, storno, cenové hladiny, asistencia, notifikácie, VOP/GDPR | owner |

Oprávnenia sa kontrolujú trikrát: pri vykreslení stránky, v každej server action (`staffAction`) a v RLS. Všetky zápisy idú cez session prihláseného zamestnanca, takže sa zapisujú do audit logu s jeho menom.

## Správanie, ktoré stojí za zmienku

- **URL vozidla** sa skladá automaticky zo značky, modelu, variantu a VIN; pri zmene kategórie, názvu alebo VIN sa zmení aj URL (presmerovanie zo starej adresy rieši Fáza 4, vozidlo sa hľadá podľa VIN).
- **Nové vozidlo je skryté**, kým ho neoznačíte ako aktívne – aby sa na webe neobjavilo bez cien a fotiek.
- **Sumy** sa zadávajú v eurách (`79`, `79,50`), ukladajú v centoch.
- **Podmienky pri vozidle:** prázdne pole = globálna hodnota z Nastavení (zobrazená ako placeholder).
- **Fotky** sa pred nahratím zmenšia v prehliadači na max. 2000 px (WebP, v Safari JPEG) a idú priamo do Supabase Storage. Poradie: ťahaním alebo šípkami (dotyk, klávesnica). Prvá nahratá fotka je hlavná.
- **Blokácie:** časy sa zadávajú a zobrazujú v pásme Europe/Bratislava. Prekryv s inou blokáciou alebo potvrdenou rezerváciou odmietne databáza. Kalendár ukazuje blokácie, potvrdené rezervácie (vrátane prípravy) a rezervácie čakajúce na potvrdenie.
- **Príplatok pri vozidle:** dá sa vypnúť alebo mu dať vlastnú cenu. „Aplikovať na všetky vozidlá“ tieto výnimky zruší.
- **Cenové hladiny:** v Nastaveniach sa menia horné hranice; ceny vozidiel zostávajú priradené k hladinám.
- **IBAN** sa kontroluje (kontrolný súčet); kým nie je vyplnený, Nastavenia na to upozorňujú.
- **Verzie VOP/GDPR:** zvyšujú sa zaškrtnutím v Nastaveniach; verzia sa bude ukladať ku každému súhlasu.
- **Formuláre** po chybe nestrácajú vyplnené údaje.

## Testy

- `npm test` – 32 unit testov (sumy, URL vozidla, časové pásmo vrátane prechodu letného/zimného času, IBAN, nastavenia, auth).
- Prehliadačový test proti Supabase projektu (49 krokov): vytvorenie vozidla, validácia VIN, ceny, podmienky, výbava, príplatky, nahratie/poradie/zmazanie fotiek, blokácie a ich kolízie, kategórie (rezervovaný slug), miesta, príplatky, read-only režim operátora, prístup k Nastaveniam, validácie v Nastaveniach.

## Čo chýba / poznámky

- **Poradie vozidiel v zozname** sa mení číslom „Poradie zobrazenia“, nie ťahaním.
- **Úprava číselníka výbavy** (premenovanie, EN preklad, zmazanie položky) zatiaľ nie je; položky sa dajú len pridať a priradiť.
- **Alt texty fotiek** sa generujú z názvu vozidla, v admine sa zatiaľ nedajú upraviť.
- **Audit log** sa plní, obrazovka na jeho čítanie príde vo Fáze 9. Obsahuje aj cca 40 záznamov z môjho testovania (log je zámerne nemazateľný).
- **Texty podmienok** (voľný text storno podmienok) sú zatiaľ generované z čísel; samostatné editovateľné texty doplním pri verejnom detaile (Fáza 4), ak ich budete chcieť.

# Release checklist – spustenie rental.btw.sk

Čo treba urobiť pred ostrým spustením a kto to robí. Odškrtávajte priamo tu alebo v kópii.
Stav k 19. 11. 2026 (Fáza 10).

## 1. Doména `rental.btw.sk`

| # | Krok | Kto | Stav |
|---|---|---|---|
| 1.1 | Doména pridaná do Vercel projektu `btw-rental` | Claude | ✅ 19. 11. |
| 1.2 | **DNS vo Websupporte** (zóna `btw.sk`): záznam **CNAME** `rental` → `8fcb7bf5d840bb7c.vercel-dns-017.com.` (TTL 600). Ak Websupport CNAME nepovolí, lebo na `rental.btw.sk` už existuje iný záznam, použite namiesto neho dva záznamy **A** `rental` → `216.198.79.1` a `64.29.17.1`. Záznamy Resend (`send.rental…`, `resend._domainkey.rental…`, `_dmarc.rental…`) nechajte tak. | klient | ☐ |
| 1.3 | Vercel → projekt → Settings → Domains: pri `rental.btw.sk` „Valid Configuration“, certifikát vydaný (do pár minút po DNS) | klient / Claude | ☐ |
| 1.4 | Vercel → Settings → Environment Variables: `NEXT_PUBLIC_SITE_URL` = `https://rental.btw.sk` (Production), potom **Redeploy** produkcie | Claude po 1.3 | ☐ |
| 1.5 | Vercel → Domains → `btw-rental.vercel.app` → Edit → **Redirect to** `rental.btw.sk` (308) – aby Google neindexoval dve adresy | Claude po 1.3 | ☐ |
| 1.6 | Supabase → Authentication → URL Configuration: **Site URL** `https://rental.btw.sk`; **Redirect URLs** `https://rental.btw.sk/**` a `https://btw-rental-*-igortittels-projects.vercel.app/**` (preview) | klient | ☐ |
| 1.7 | Kontrola: e-mail s odkazom na heslo a e-maily k rezervácii vedú na `https://rental.btw.sk/…` | klient | ☐ |

Pozn.: vlastná doména **nie je za Vercel prihlásením** (ochrana platí na všetko okrem vlastných domén). Od kroku 1.2 je web verejný – preto najprv body 2–4.

## 2. Údaje a nastavenia v admine (majiteľ)

| # | Čo | Kde | Stav |
|---|---|---|---|
| 2.1 | **Reálny IBAN** a SWIFT (teraz testovací `SK73 1100 …0042`) | Admin → Nastavenia → Firma a platby | ☐ |
| 2.2 | Údaje firmy: IČO, DIČ, IČ DPH, **telefón** (teraz prázdny), e-mail, adresa | Nastavenia | ☐ |
| 2.3 | **Reálne VIN a ŠPZ** všetkých vozidiel (teraz `TESTBTW…`, `BT00xTW`). VIN je súčasťou URL – zmeňte ho **pred** spustením, inak vzniknú presmerovania | Admin → Vozidlá | ☐ |
| 2.4 | Ceny, depozity, limity km, príplatky, storno pásma, miesta, výbava (aj EN názvy – Admin → Viac → Výbava), popisy fotiek | Admin | ☐ |
| 2.5 | Odkazy na **VOP** a **Ochranu osobných údajov** (`terms_url`, `gdpr_url`) – texty musia pokrývať prenájom, depozit, protokoly, fotky, 2FA a lehoty uchovávania (e-mail log 12 mesiacov) | Nastavenia + btw.sk | ☐ |
| 2.6 | E-maily pre notifikácie BTW (nová rezervácia, úpravy, storno) | Nastavenia | ☐ |
| 2.7 | Google recenzie: `google_review_url` (vyplnené), `review_request_days` = 3 | Nastavenia | ✅ |
| 2.8 | Zapnuté: **2FA pre zamestnancov** a **úhrada pred odovzdaním** – nevypínať | Nastavenia | ✅ |

## 3. Bezpečnosť účtov

| # | Čo | Stav |
|---|---|---|
| 3.1 | **2FA na všetkých dashboardoch**: Supabase, Vercel, GitHub, Resend, Cloudflare, Websupport, Google (účet firmy) | ☐ |
| 3.2 | Majiteľ v admine: zmeniť dočasné heslo (Môj profil), 2FA zapnuté | ☐ |
| 3.3 | Po spustení zmazať `SEED_OWNER_PASSWORD` z Vercelu (účet majiteľa už existuje, skript sa potom preskočí) | ☐ |
| 3.4 | Zamestnanci: pozvať cez Admin → Zamestnanci (každý si pri prvom prihlásení zapne 2FA), dočasné testovacie účty zmazať (bod 5) | ☐ |
| 3.5 | **Cloudflare Turnstile**: v Cloudflare vytvoriť widget pre `rental.btw.sk`, do Vercelu (Production + Preview) `NEXT_PUBLIC_TURNSTILE_SITE_KEY` a `TURNSTILE_SECRET_KEY`, redeploy. Zapne sa sám na rezervácii aj prihlásení; CSP ho už povoľuje | ☐ |

## 4. Prevádzka a plány služieb

| # | Čo | Prečo | Stav |
|---|---|---|---|
| 4.1 | **Vercel Pro** (teraz Hobby) | Hobby je podľa podmienok Vercelu len na nekomerčné použitie | ☐ |
| 4.2 | **Supabase Pro** (teraz Free) | Free projekt sa po týždni nečinnosti uspí a nemá denné zálohy; Pro má zálohy a zapne aj „Leaked password protection“ | ☐ |
| 4.3 | Resend: doména `rental.btw.sk` overená ✅; odoslať skúšobný e-mail na Gmail aj Outlook a skontrolovať, že nepadá do spamu | | ☐ |
| 4.4 | Denný cron (5:00 UTC) – po spustení skontrolovať panel „Automatické e-maily“ na Prehľade | | ✅ beží od 19. 11. |
| 4.5 | Google Search Console: pridať `rental.btw.sk`, odoslať `https://rental.btw.sk/sitemap.xml` | | ☐ |
| 4.6 | Na btw.sk pridať odkazy na rental.btw.sk (repo btw-web – mimo tohto projektu) | | ☐ |

## 5. Zmazanie testovacích údajov (celkový WIPE)

Robí Claude cez Supabase po potvrdení klienta, **tesne pred spustením**:

- rezervácie 20260001 … 20260009 (pôvodne BTW-2026-0001 …) a všetky súvisiace záznamy (príplatky rezervácie, protokoly, vyúčtovania, platby, doklady, poznámky, história stavov, súhlasy, e-mail log),
- súbory v bucketoch `protocols`, `protocol-media`, `documents`,
- testovacie účty `e2e-…@btw-rental.test` (zákazníci aj zamestnanci, vrátane TOTP faktorov) a profily,
- počítadlo čísel rezervácií (`booking_counters`) – keď nezostane žiadna rezervácia, môže začať znova od 0001.
- **Audit log zostáva** (je nemenný) – testovacie záznamy v ňom ostanú, osobné údaje v ňom nie sú (zmeny profilov sa zapisujú bez hodnôt).

## 6. Nasadenie

| # | Krok | Stav |
|---|---|---|
| 6.1 | Klient schváli Fázu 10 na preview | ☐ |
| 6.2 | Zlúčenie vetvy do `main` (PR) → produkčné nasadenie; GitHub Actions „Kvalita“ a „E2E“ zelené | ☐ |
| 6.3 | Kroky 1.2–1.7 (doména) | ☐ |
| 6.4 | Zmazanie testovacích údajov (bod 5) | ☐ |
| 6.5 | Skúšobná rezervácia na `rental.btw.sk` s reálnym e-mailom → potvrdenie → storno; potom ju zmazať alebo ponechať ako zrušenú | ☐ |

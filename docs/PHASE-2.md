# Fáza 2 – Auth (zákazník, zamestnanci, role, odkaz na nastavenie hesla)

## Čo pribudlo

| Oblasť | Súbory |
|---|---|
| Routing a jazyky | `i18n/`, `middleware.ts`, `messages/sk.json`, `messages/en.json` – SK bez prefixu, EN pod `/en` |
| Supabase klienti | `lib/supabase/server.ts` (session, RLS), `client.ts`, `admin.ts` (service role, len server) |
| Session a role | `lib/auth/session.ts` (`getSessionUser`, `requireUser`, `requireStaff`), `lib/auth/roles.ts` |
| Odkaz na heslo | `lib/auth/tokens.ts`, `lib/auth/password-links.ts`, migrácia `20261116110000_auth_tokens.sql` |
| Rate limit | `lib/auth/rate-limit.ts` + tabuľka `rate_limits` |
| Akcie | `lib/auth/actions.ts` (prihlásenie, odhlásenie, žiadosť o odkaz, nastavenie hesla), `app/admin/actions.ts` |
| E-maily | `lib/email/send.ts` (Resend + zápis do `email_log`), `lib/email/auth-emails.ts` |
| Stránky | `/prihlasenie`, `/zabudnute-heslo`, `/nastavit-heslo`, `/moj-ucet`, `/admin`, `/admin/profil`, `/admin/zamestnanci` |
| Seed | `scripts/seed-owner.ts`, `scripts/seed-vehicle-images.ts` |
| Testy | `tests/unit/auth.test.ts` (13 testov) |

## Ako to funguje

**Prihlásenie:** e-mail + heslo cez server action. Zamestnanec skončí v `/admin`, zákazník v `/moj-ucet` (parameter `next` zákazníka do `/admin` nikdy nepustí a akceptuje len relatívne cesty).

**Odkaz „Nastaviť heslo“:** vlastné jednorazové tokeny v tabuľke `auth_tokens` (ukladá sa len SHA-256 hash). Dôvod: natívne tokeny Supabase platia najviac 24 h, zadanie žiada 72 h.

| Situácia | Platnosť |
|---|---|
| prvé heslo (nový zákazník, pozvánka zamestnanca) | 72 h |
| zabudnuté heslo pri účte, ktorý už heslo má | 2 h |

Nový odkaz zneplatní predchádzajúce. Token sa spotrebuje až po úspešnom nastavení hesla. Expirovaný alebo použitý odkaz zobrazí formulár „Poslať nový odkaz“. Formulár odpovedá vždy rovnako, takže sa ním nedá zisťovať, ktoré e-maily majú účet. Heslo sa e-mailom nikdy neposiela.

**Role:** čítajú sa z tabuľky `staff_roles` pri každej požiadavke (layout aj každá server action), nie z cookie ani z JWT metadát. Middleware len obnovuje session a presmeruje neprihláseného.

**Zamestnanci (len owner):** pozvanie (meno, e-mail, rola), zmena roly, deaktivácia (nie vymazanie; deaktivovaný je odhlásený zo všetkých zariadení). Nedá sa zmeniť vlastná rola ani odstrániť posledný aktívny owner. Zmeny idú cez session ownera, takže ich zachytí audit log.

**Zmena hesla (Môj profil):** vyžaduje aktuálne heslo.

**Rate limit:** prihlásenie 8 pokusov / 15 min na e-mail a 30 na IP; žiadosť o odkaz 3 / hod na e-mail a 10 na IP.

## Owner účet a fotky

`npm run vercel-build` pred buildom spustí oba seed skripty (potrebujú `SUPABASE_SERVICE_ROLE_KEY`):

- `seed-owner.ts` – ak `btw@btw.sk` ešte nemá rolu, nastaví heslo z `SEED_OWNER_PASSWORD` a pridelí rolu `owner`. Ak už rolu má, nemení nič (ani heslo).
- `seed-vehicle-images.ts` – nahrá chýbajúce fotky do bucketu `vehicle-images`; existujúce neprepíše.

## Ako otestovať na preview

1. Otvorte preview URL → `/prihlasenie`, prihláste sa ako `btw@btw.sk` heslom zo `SEED_OWNER_PASSWORD`.
2. **Môj profil → Zmena hesla** – zmeňte si heslo.
3. **Zamestnanci → Pozvať zamestnanca**. Kým nie je nastavený Resend, zobrazí sa jednorazový odkaz na skopírovanie.
4. Odkaz otvorte v anonymnom okne → nastavte heslo → ste prihlásený v `/admin` s danou rolou.
5. Ten istý odkaz otvorte znova → „Odkaz už nie je platný“.

## Čo chýba / otvorené

- **E-maily sa zatiaľ neodosielajú** – chýba `RESEND_API_KEY` a overená doména `rental.btw.sk` v Resend. Dovtedy „Zabudnuté heslo“ e-mail nepošle (pokus sa zapíše do `email_log` ako `failed`); zamestnancom vie odkaz vygenerovať owner.
- **Prihlasovací modal** príde s hlavičkou katalógu vo Fáze 4; teraz je samostatná stránka.
- **Turnstile** na prihlásení pribudne spolu s rezervačným formulárom (Fáza 5).
- **2FA (TOTP)** pre zamestnancov – odporúčané v zadaní, zatiaľ neimplementované.
- V Supabase → Authentication odporúčam zapnúť *Leaked password protection* a nastaviť minimálnu dĺžku hesla 10.
- Zákaznícka zóna je zatiaľ len kostra (Fáza 7).

# Bezpečnosť – audit a opatrenia (17. 11. 2026)

Cieľ: zabrániť úniku osobných údajov zákazníkov (e-maily, telefóny, adresy, dátum narodenia, protokoly) a neoprávneným zmenám dát.

## Nájdené a opravené

### 1. Zápis cez verejné views (kritické) – opravené
Views `public_locations`, `public_settings`, `public_price_tiers`, `public_categories` sú jednoduché, a teda automaticky zapisovateľné. Bežia s právami vlastníka (`postgres`, obchádza RLS) a predvolené práva Supabase dávajú rolám `anon` a `authenticated` na všetko v `public` aj INSERT/UPDATE/DELETE. Ktokoľvek s verejným kľúčom (je v JavaScripte stránky) tak mohol meniť príplatky miest, cenové pásma, kategórie a verejné nastavenia alebo ich zmazať. Osobné údaje cez to neboli dostupné, views ich neobsahujú.

- Oprava: `supabase/migrations/20261120090000_read_only_public_views.sql` – na všetkých views v `public` ostáva API rolám len SELECT. Aplikované na Supabase 17. 11. 2026.
- Overené na produkcii cez REST API: čítanie funguje, zápis vráti `42501 permission denied for view`.
- V `audit_log` nie je žiadna zmena týchto tabuliek bez prihláseného zamestnanca. Nastavenia a cenové pásma však audit nezaznamenáva, takže zneužitie sa nedá úplne vylúčiť. Odporúčanie: klient nech skontroluje v admine miesta, cenové pásma a nastavenia.
- Regresný test: `supabase/tests/05_security.sql` (žiadny view nie je zapisovateľný, `anon` nečíta žiadnu tabuľku, všetky tabuľky majú RLS).

### 2. Bezpečnostné HTTP hlavičky – doplnené (`next.config.js`)
HSTS, `X-Frame-Options: SAMEORIGIN` + CSP `frame-ancestors 'self'` (proti clickjackingu adminu), `object-src 'none'`, `base-uri 'self'`, `form-action 'self'`, `nosniff`, `Referrer-Policy: strict-origin-when-cross-origin` (tokeny z odkazov neodídu cez Referer), `Permissions-Policy`, `Cross-Origin-Opener-Policy`, bez `X-Powered-By`, `/admin` s `X-Robots-Tag: noindex`.
CSP zámerne neobmedzuje skripty – to by vyžadovalo nonce a dynamické renderovanie všetkých stránok.

## Skontrolované, v poriadku

- RLS je zapnuté na všetkých tabuľkách; `anon` nemá SELECT na žiadnu tabuľku. Zákazník vidí len svoje rezervácie, podpísané protokoly, potvrdené vyúčtovania a svoj profil.
- `profiles_guard` bráni zákazníkovi zmeniť si e-mail, typ účtu alebo anonymizáciu.
- Interné údaje (`customer_internal`, `booking_notes`, `email_log`, `audit_log`) čítajú len zamestnanci.
- Storage: súkromné buckety (`protocols`, `protocol-media`, `documents`) len pre zamestnancov; zákazník len PDF svojho podpísaného protokolu.
- Všetky admin server akcie a route handlery (`/admin/rezervacie/export`, `/admin/emaily/nahlad`) overujú rolu; CSV export neutralizuje vzorce.
- Prihlásenie a obnova hesla neprezradia, či účet existuje; rate limit + Turnstile.
- Tokeny na nastavenie hesla: 256 bitov, v DB len SHA-256 hash, jednorazové, 72 h / 2 h; stránka má `referrer: no-referrer`.
- Presmerovanie po prihlásení (`safeNextPath`) nepustí na cudziu doménu.
- Service role kľúč len v serverovom kóde (`server-only`); v `NEXT_PUBLIC_*` nie je žiadne tajomstvo.
- `create_booking` a ostatné zapisujúce RPC nie sú dostupné pre `anon`.

## Treba nastaviť v dashboardoch (klient)

| Kde | Čo | Prečo |
|---|---|---|
| Supabase → Authentication → Sign In / Providers | vypnúť **Allow new users to sign up** | Účty vytvára len aplikácia (service role). Dnes sa dá cez API obísť Turnstile a založiť účet na cudzí e-mail, čo môže zablokovať neskoršiu rezerváciu majiteľa e-mailu. |
| Supabase → Authentication → Attack Protection | zapnúť **Leaked password protection** | Odmietne heslá z únikov (HaveIBeenPwned). Podľa plánu môže byť dostupné len pri platenom pláne. |
| Supabase, Vercel, GitHub, Resend, Cloudflare | **2FA na všetkých účtoch** s prístupom | Najčastejší únik je cez ukradnuté heslo k dashboardu, nie cez aplikáciu. |
| Supabase → Storage | zmazať prázdny bucket `booking-documents` (pozostatok prototypu) | Nepoužíva sa, nemá limity veľkosti ani typu. |

## Ešte v pláne (aplikácia)

- 2FA pre zamestnancov (aspoň owner a manager) – pred ostrým spustením.
- Fáza 9: obrazovka audit logu, vykonanie žiadosti o vymazanie (GDPR), lehoty uchovávania.

## Pravidlá do budúcna

- Každý nový view v `public` musí mať odobraté INSERT/UPDATE/DELETE pre `anon` a `authenticated` (test `05_security.sql` to stráži).
- Osobné údaje nikdy do views `public_*` ani do odpovedí `/api/*`.
- Po každej migrácii spustiť Supabase Security Advisor (`get_advisors`).

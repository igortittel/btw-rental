# Bezpečnosť – audit a opatrenia (17. 11. 2026)

Cieľ: zabrániť úniku osobných údajov zákazníkov (e-maily, telefóny, adresy, dátum narodenia, protokoly) a neoprávneným zmenám dát.

## Nájdené a opravené

### 1. Zápis cez verejné views (kritické) – opravené
Views `public_locations`, `public_settings`, `public_price_tiers`, `public_categories` sú jednoduché, a teda automaticky zapisovateľné. Bežia s právami vlastníka (`postgres`, obchádza RLS) a predvolené práva Supabase dávajú rolám `anon` a `authenticated` na všetko v `public` aj INSERT/UPDATE/DELETE. Ktokoľvek s verejným kľúčom (je v JavaScripte stránky) tak mohol meniť príplatky miest, cenové pásma, kategórie a verejné nastavenia alebo ich zmazať. Osobné údaje cez to neboli dostupné, views ich neobsahujú.

- Oprava: `supabase/migrations/20261120090000_read_only_public_views.sql` – na všetkých views v `public` ostáva API rolám len SELECT. Aplikované na Supabase 17. 11. 2026.
- Overené na produkcii cez REST API: čítanie funguje, zápis vráti `42501 permission denied for view`.
- V `audit_log` nie je žiadna zmena týchto tabuliek bez prihláseného zamestnanca. Nastavenia a cenové pásma však audit nezaznamenáva, takže zneužitie sa nedá úplne vylúčiť. Odporúčanie: klient nech skontroluje v admine miesta, cenové pásma a nastavenia.
- Regresný test: `supabase/tests/05_security.sql` (žiadny view nie je zapisovateľný, `anon` nečíta žiadnu tabuľku, všetky tabuľky majú RLS).

### 2. Bezpečnostné HTTP hlavičky – doplnené (`next.config.mjs`)
HSTS, `X-Frame-Options: SAMEORIGIN` + CSP `frame-ancestors 'self'` (proti clickjackingu adminu), `object-src 'none'`, `base-uri 'self'`, `form-action 'self'`, `nosniff`, `Referrer-Policy: strict-origin-when-cross-origin` (tokeny z odkazov neodídu cez Referer), `Permissions-Policy`, `Cross-Origin-Opener-Policy`, bez `X-Powered-By`, `/admin` s `X-Robots-Tag: noindex`.
CSP pre skripty doplnila Fáza 10 (nižšie).

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

## Nastavenia v dashboardoch (klient)

| Kde | Čo | Stav |
|---|---|---|
| Supabase → Authentication → Sign In / Providers | vypnúť **Allow new users to sign up** – účty vytvára len aplikácia (service role) | ✅ hotovo, overené (`disable_signup: true`) |
| Supabase → Authentication → Attack Protection | **Leaked password protection** | ❌ na pláne nedostupné → nahradené v aplikácii (nižšie) |
| Supabase, Vercel, GitHub, Resend, Cloudflare | **2FA na všetkých účtoch** s prístupom – najčastejší únik je cez ukradnuté heslo k dashboardu | ⏳ pripravuje klient |
| Supabase → Storage | zmazať prázdny bucket `booking-documents` (pozostatok prototypu) | ✅ hotovo, overené |

### Kontrola uniknutých hesiel v aplikácii
Náhrada za Supabase „Leaked password protection“: `lib/auth/pwned.ts` overí nové heslo cez Have I Been Pwned (Pwned Passwords) pri nastavení hesla cez odkaz (`setPasswordAction`) aj pri zmene v profile (`changeMyPasswordAction`) – iné cesty k nastaveniu hesla nie sú, verejná registrácia je vypnutá. Zo servera odchádza len prvých 5 znakov SHA-1 hashu (k-anonymita), heslo ani celý hash nie. Pri výpadku služby (timeout 3 s) sa heslo prijme. Chyba pre používateľa: `password_pwned`.

## Fáza 10 – bezpečnostný review (19. 11. 2026)

### Content-Security-Policy s nonce (`lib/csp.ts`, `proxy.ts`)
Každá HTML stránka dostane nový náhodný nonce (128 bitov). Skripty smú bežať len s ním (`script-src 'self' 'nonce-…' 'strict-dynamic'`), takže vložený cudzí `<script>` (XSS) sa nespustí. Next.js nonce prečíta z hlavičky požiadavky a doplní ho na svoje skripty; Turnstile načíta náš skript, preto prejde cez `'strict-dynamic'`. Ďalej: obrázky len z vlastnej domény a Supabase, spojenia len na vlastnú doménu, Supabase a Cloudflare Turnstile, iframe len Turnstile a vlastná doména, `object-src 'none'`, `upgrade-insecure-requests`. `'unsafe-eval'` len vo vývojovom režime. Štýly ostávajú `'unsafe-inline'` (React a next/image používajú inline štýly).
Overené: všetky verejné aj admin stránky, prihlásenie s 2FA, server akcie a kalendár bez jediného porušenia CSP. Panel Vercel Toolbar (komentáre na preview) CSP blokuje – na funkciu webu to nemá vplyv.

### Server akcie a API
Prejdené všetky exportované server akcie: admin akcie cez `staffAction(min)` alebo `getStaff()`, zákaznícka zóna cez `getSessionUser()` (+ RLS), prihlásenie a odkazy na heslo s rate limitom (a Turnstile). Verejné sú zámerne len `checkTermAction` (overenie voľného termínu – rovnaký údaj ako `/api/availability`) a odhlásenie. Route handlery: `/api/availability` (len obsadené intervaly, bez osobných údajov), `/api/cron/daily` (`CRON_SECRET`), `/api/documents/[id]` a `/api/protocols/[id]/pdf` (RLS), `/admin/*/export` (rola).

### Lehoty uchovávania (`lib/retention.ts`, denný cron)
| Údaj | Lehota | Rozhodnutie |
|---|---|---|
| `email_log` (príjemca, typ, stav e-mailu) | 12 mesiacov | klient 19. 11. 2026 |
| `cron_runs` | 30 dní | klient |
| `auth_tokens` (odkazy na heslo) | 7 dní po expirácii | Fáza 9 |
| `rate_limits` | 1 deň | Fáza 9 |
| `audit_log` | natrvalo (nemenný) | klient |
| rezervácie, protokoly, doklady | neobmedzene; osobné údaje odstraňuje anonymizácia (GDPR) | Fáza 9 |

### Security Advisor (19. 11. 2026) – bez nových nálezov
- `security_definer_view` (5× `public_*`): zámer – views obchádzajú RLS, ale vyberajú len verejné stĺpce a sú len na čítanie (test `05_security.sql`).
- `*_security_definer_function_executable`: RPC si rolu / vlastníka overujú vo vnútri (`private.is_staff`, `auth.uid()`); `is_vehicle_available` a `vehicle_availability` sú verejné zámerne (dostupnosť bez osobných údajov).
- `rls_enabled_no_policy` (`auth_tokens`, `rate_limits`): zámer – prístup len cez service role.
- `auth_leaked_password_protection`: nedostupné na pláne, nahradené v aplikácii (`lib/auth/pwned.ts`).

## Ešte v pláne

- Pred spustením: 2FA na všetkých účtoch dashboardov (Supabase, Vercel, GitHub, Resend, Cloudflare, DNS), Turnstile kľúče, celkové zmazanie testovacích údajov – viď `docs/RELEASE-CHECKLIST.md`.

## Pravidlá do budúcna

- Každý nový view v `public` musí mať odobraté INSERT/UPDATE/DELETE pre `anon` a `authenticated` (test `05_security.sql` to stráži).
- Osobné údaje nikdy do views `public_*` ani do odpovedí `/api/*`.
- Po každej migrácii spustiť Supabase Security Advisor (`get_advisors`).

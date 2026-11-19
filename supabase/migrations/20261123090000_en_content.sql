-- Fáza 10: anglické texty obsahu (výbava, popisy vozidiel).
-- Dopĺňa len chýbajúci EN text – čo už v admine niekto vyplnil, neprepíše. Párovanie podľa slovenského textu / názvu vozidla,
-- takže migrácia je bezpečná aj na databáze, kde položky neexistujú (nič sa nestane).

with t(sk, en) as (values
  ('5-miestne prevedenie vozidla s lakťovou opierkou na zadných aj predných sedadlách', '5-seat configuration with armrests for front and rear seats'),
  ('Predné a zadné vyhrievané sedadlá', 'Heated front and rear seats'),
  ('Dvojzónová automatická klimatizácia', 'Dual-zone automatic climate control'),
  ('Elektrické ovládané, vyhrievané a ventilované sedadlá predné aj zadné v prémiových materiáloch', 'Power-adjustable, heated and ventilated front and rear seats in premium materials'),
  ('Ambientné podsvietenie interiéru', 'Ambient interior lighting'),
  ('Vzduchový podvozok AIRMATIC, ktorý sa automaticky prispôsobuje vozovke', 'AIRMATIC air suspension that adapts automatically to the road'),
  ('Štvorzónová automatická klimatizácia s vlastným ovládaním', 'Four-zone automatic climate control with individual controls'),
  ('Kožený vyhrievaný volant potiahnutý kožou', 'Heated leather steering wheel'),
  ('Zadná časť vozidla poskytuje nadštandardný priestor na nohy a vďaka zvukovej izolácii zaručuje tichý interiér aj pri vyšších rýchlostiach', 'Generous rear legroom and acoustic insulation for a quiet cabin even at higher speeds'),
  ('Panoramatická strecha', 'Panoramic roof'),
  ('7-miestne prevedenie – usporiadanie sedadiel 2 + 3 + 2', '7-seat configuration – 2 + 3 + 2 seating'),
  ('Elektrické ovládané, vyhrievané sedadlá predné aj zadné v prémiových materiáloch', 'Power-adjustable, heated front and rear seats in premium materials'),
  ('Variabilný interiér s možnosťou prispôsobenia sedadiel pre väčší komfort alebo viac batožinového priestoru', 'Flexible interior – seats can be arranged for more comfort or more luggage space'),
  ('8-miestne prevedenie – usporiadanie sedadiel 2 + 3 + 3', '8-seat configuration – 2 + 3 + 3 seating'),
  ('Elektrické ovládané, vyhrievané a ventilované sedadlá v prémiových materiáloch', 'Power-adjustable, heated and ventilated seats in premium materials'),
  ('Dvojzónová automatická klimatizácia so samostatnou zónou a výduchmi pre druhý a tretí rad sedadiel', 'Dual-zone automatic climate control with a separate zone and vents for the second and third rows'),
  ('Trojzónová automatická klimatizácia so samostatnou zónou a výduchmi pre druhý a tretí rad sedadiel', 'Three-zone automatic climate control with a separate zone and vents for the second and third rows'),
  ('7-miestne prevedenie – usporiadanie sedadiel 2 + 2 + 3', '7-seat configuration – 2 + 2 + 3 seating'),
  ('Elektrické ovládané, vyhrievané a ventilované relaxačné sedadlá v druhom rade', 'Power-adjustable, heated and ventilated relaxation seats in the second row'),
  ('Vyhrievanie a ventilácia predných sedadiel', 'Heated and ventilated front seats'),
  ('Elektricky nastaviteľné sedadlo vodiča a spolujazdca', 'Power-adjustable driver and front passenger seats'),
  ('Kožený vyhrievaný volant potiahnutý perforovanou kožou', 'Heated steering wheel in perforated leather'),
  ('Prémiové kožené čalúnenie Nappa', 'Premium Nappa leather upholstery'),
  ('Strop, obloženie stĺpikov a slnečné clony potiahnuté semišom', 'Headliner, pillar trim and sun visors in suede'),
  ('LED osvetlenie interiéru pre druhý a tretí rad sedadiel', 'LED interior lighting for the second and third rows'),
  ('Integrovaná navigácia MBUX s 14,4″ farebným displejom, podpora Apple CarPlay/Android Auto, Live Traffic Information a hlasové ovládanie “Hey Mercedes”', 'MBUX navigation with a 14.4″ colour display, Apple CarPlay/Android Auto, Live Traffic Information and “Hey Mercedes” voice control'),
  ('Bezdrôtová Qi-nabíjacia stanica pre mobilné zariadenia', 'Qi wireless charging for mobile devices'),
  ('Tepelnoizolačné čelné sklo s infračervenou ochranou, zatmavené okná v zadnej časti vozidla', 'Heat-insulating windscreen with infrared protection, privacy glass at the rear'),
  ('Integrovaná navigácia MBUX s 12,8″ farebným displejom, podpora Apple CarPlay/Android Auto, Live Traffic Information a hlasové ovládanie “Hey Mercedes”', 'MBUX navigation with a 12.8″ colour display, Apple CarPlay/Android Auto, Live Traffic Information and “Hey Mercedes” voice control'),
  ('Prémiový surround systém Burmester® s 13 reproduktormi a subwooferom', 'Burmester® premium surround sound with 13 speakers and a subwoofer'),
  ('Tepelnoizolačné čelné sklo s infračervenou ochranou, zatmavené okná v zadných radoch', 'Heat-insulating windscreen with infrared protection, privacy glass in the rear rows'),
  ('Integrovaná navigácia MBUX s 12,3″ farebným displejom, podpora Apple CarPlay/Android Auto, Live Traffic Information a hlasové ovládanie “Hey Mercedes”', 'MBUX navigation with a 12.3″ colour display, Apple CarPlay/Android Auto, Live Traffic Information and “Hey Mercedes” voice control'),
  ('Integrovaná navigácia MBUX s 10,25″ farebným displejom, podpora Apple CarPlay/Android Auto, Live Traffic Information a hlasové ovládanie “Hey Mercedes”', 'MBUX navigation with a 10.25″ colour display, Apple CarPlay/Android Auto, Live Traffic Information and “Hey Mercedes” voice control'),
  ('Prémiový surround systém Burmester® s 15 reproduktormi a subwooferom', 'Burmester® premium surround sound with 15 speakers and a subwoofer'),
  ('230 V zásuvka a USB-C porty pre všetky rady sedadiel', '230 V socket and USB-C ports for all seat rows'),
  ('Tepelnoizolačné čelné sklo s infračervenou ochranou, zatmavené okná v zadných radoch, manuálne roletky na bočných oknách pre druhý a tretí rad sedadiel', 'Heat-insulating windscreen with infrared protection, privacy glass in the rear rows, manual side-window blinds for the second and third rows'),
  ('Integrovaná navigácia s 10,25″ farebným LCD a služby Apple CarPlay/Android Auto/Bluelink/Live Services', 'Navigation with a 10.25″ colour LCD, Apple CarPlay/Android Auto, Bluelink and Live Services'),
  ('12-prémiových reproduktorov Bose so subwooferom', 'Bose premium sound with 12 speakers and a subwoofer'),
  ('Bezdrôtové nabíjanie mobilného telefónu', 'Wireless phone charging'),
  ('Elektrická zásuvka s napätím 12 V', '12 V power socket'),
  ('Solárne čelné sklo a bočné okná', 'Solar-control windscreen and side windows'),
  ('Protislnečné roletky bočných okien pre druhý a tretí rad sedadiel', 'Side-window sun blinds for the second and third rows'),
  ('Posuvné bočné okná pre druhý rad sedadiel', 'Sliding side windows for the second row'),
  ('Svetelný a dažďový senzor, zadná parkovacia kamera, predné a zadné parkovacie senzory', 'Light and rain sensor, rear-view camera, front and rear parking sensors'),
  ('Svetelný a dažďový senzor, 360-stupňová kamera s panoramatickým výhľadom, predné a zadné parkovacie senzory', 'Light and rain sensor, 360° surround-view camera, front and rear parking sensors'),
  ('Svetelný a dažďový senzor', 'Light and rain sensor'),
  ('Predné a zadné parkovacie senzory – 4 kamery 360 stupňov', 'Front and rear parking sensors – four 360° cameras'),
  ('Zadná parkovacia kamera', 'Rear-view camera'),
  ('Dialničná známka: SVK', 'Motorway vignette: Slovakia'),
  ('Poistenie: PZP + Havarijné poistenie (Spoluúčasť 350 EUR min 5%)', 'Insurance: third-party liability + comprehensive (excess EUR 350, min. 5 %)'),
  ('Asistenčná služba poisťovne', 'Insurer''s roadside assistance'),
  ('Poistenie: PZP + Havarijné poistenie (Spoluúčasť 300 EUR min 5%)', 'Insurance: third-party liability + comprehensive (excess EUR 300, min. 5 %)')
)
update public.features f
   set name = f.name || jsonb_build_object('en', t.en)
  from t
 where f.name ->> 'sk' = t.sk
   and coalesce(f.name ->> 'en', '') = '';

with t(name, en) as (values
  ('Mercedes-Benz E 200 d', 'An elegant, comfortable saloon built for smooth, relaxed travel. A premium interior, modern technology and refined manners make it the ideal choice for business and everyday journeys alike.'),
  ('Mercedes-Benz E 220 d', 'A comfortable, well-balanced car designed for smooth and relaxed driving. A high-quality interior, modern technology and refined manners make it the ideal choice for business and everyday journeys alike.'),
  ('Mercedes-Benz S 400 d 4MATIC', 'The Mercedes-Benz flagship that defines luxury, comfort and technology. A first-class interior, outstanding comfort and timeless elegance make it the ideal choice for executive and VIP travel.'),
  ('Mercedes-Benz GLS 400 d 4MATIC', 'A luxury SUV with generous space, high comfort and the confidence of all-wheel drive. A premium interior and modern technology make it the ideal choice for comfortable family and executive travel.'),
  ('Mercedes-Benz V 250 d 4MATIC Extra-Long', 'A comfortable, spacious van with all-wheel drive, designed for relaxed travel with several passengers. A high-quality interior and advanced technology ensure a high standard for business, family and group trips.'),
  ('Mercedes-Benz V 300 d 4MATIC Long', 'A premium van with all-wheel drive, generous space and high comfort. A luxurious interior and modern technology make it the ideal choice for executive, family and group travel.'),
  ('Hyundai Staria Luxury 4x4', 'Futuristic design, exceptional interior space, high comfort and the rich Luxury equipment make this vehicle an ideal companion for family, business and group trips.')
)
update public.vehicles v
   set description = coalesce(v.description, '{}'::jsonb) || jsonb_build_object('en', t.en)
  from t
 where v.name = t.name
   and coalesce(v.description ->> 'sk', '') <> ''
   and coalesce(v.description ->> 'en', '') = '';

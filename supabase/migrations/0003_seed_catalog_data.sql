INSERT INTO categories (id, name, description, color, created_at, updated_at) VALUES
('c1', 'Audio', 'Headphones, speakers and everything between.', '#E4572E', to_timestamp(1787818400007/1000.0), to_timestamp(1788718402588/1000.0)),
('c2', 'Wearables', 'Watches and cameras that earn their place on you.', '#5B6DFA', to_timestamp(1787818400007/1000.0), to_timestamp(1788718402588/1000.0)),
('c3', 'Home & Desk', 'Objects that make the desk feel like a place.', '#E9A13B', to_timestamp(1787818400007/1000.0), to_timestamp(1788718402588/1000.0)),
('c4', 'Carry', 'Bags and daily companions, built to be used.', '#3E8E5A', to_timestamp(1787818400007/1000.0), to_timestamp(1788718402588/1000.0));

INSERT INTO products (id, name, sku, category_id, price, stock, stock_threshold, rating, image, images_json, tags_json, featured, description, created_at, updated_at) VALUES
('p1', 'Aria One Headphones', 'FKN-AUD-001', 'c1', 249.0, 24, 8, 4.8, 'https://image.qwenlm.ai/public_source/1221a076-dd9b-48a8-acba-208f94fdb0db/195f0ac32-1e05-4aeb-ac5c-4f2715e7f256.png', '["https://image.qwenlm.ai/public_source/1221a076-dd9b-48a8-acba-208f94fdb0db/195f0ac32-1e05-4aeb-ac5c-4f2715e7f256.png"]'::jsonb, '["wireless","anc"]'::jsonb, true, 'Flagship over-ears with adaptive ANC, 40-hour battery and copper-detailed aluminium yokes. Tuned warm, built to last.', to_timestamp(1787918400007/1000.0), to_timestamp(1788718402588/1000.0)),
('p2', 'Pulse S Smartwatch', 'FKN-WEA-002', 'c2', 199.0, 18, 6, 4.6, 'https://image.qwenlm.ai/public_source/1221a076-dd9b-48a8-acba-208f94fdb0db/1e61601a3-2379-4e97-8341-7b2145347719.png', '["https://image.qwenlm.ai/public_source/1221a076-dd9b-48a8-acba-208f94fdb0db/1e61601a3-2379-4e97-8341-7b2145347719.png"]'::jsonb, '["gps","amoled"]'::jsonb, true, 'A slim smartwatch with an AMOLED display, 10-day battery and dual-band GPS. Tracks workouts, sleep and nothing you don’t need.', to_timestamp(1788018400007/1000.0), to_timestamp(1788718402588/1000.0)),
('p3', 'Orbit Mini Speaker', 'FKN-AUD-003', 'c1', 89.0, 40, 10, 4.4, 'https://image.qwenlm.ai/public_source/1221a076-dd9b-48a8-acba-208f94fdb0db/10a933344-3902-4fae-909d-b6ef032d577f.png', '["https://image.qwenlm.ai/public_source/1221a076-dd9b-48a8-acba-208f94fdb0db/10a933344-3902-4fae-909d-b6ef032d577f.png"]'::jsonb, '["360","portable"]'::jsonb, false, 'Pocketable 360° speaker with a fabric wrap and 14-hour runtime. Pairs instantly, survives the backpack.', to_timestamp(1788118400007/1000.0), to_timestamp(1788718402588/1000.0)),
('p4', 'Halo Task Lamp', 'FKN-HOM-004', 'c3', 119.0, 12, 6, 4.7, 'https://image.qwenlm.ai/public_source/1221a076-dd9b-48a8-acba-208f94fdb0db/19dacd424-2135-436f-8436-768910775abe.png', '["https://image.qwenlm.ai/public_source/1221a076-dd9b-48a8-acba-208f94fdb0db/19dacd424-2135-436f-8436-768910775abe.png"]'::jsonb, '["led","dimmable"]'::jsonb, true, 'A sculptural task lamp with stepless dimming and warm-to-cool spectrum. One-touch memory, zero flicker.', to_timestamp(1788218400007/1000.0), to_timestamp(1788718402588/1000.0)),
('p5', 'Nomad 22L Backpack', 'FKN-CAR-005', 'c4', 148.0, 15, 5, 4.9, 'https://image.qwenlm.ai/public_source/1221a076-dd9b-48a8-acba-208f94fdb0db/15fbddfaa-ff75-4be1-a479-8a5ff3147953.png', '["https://image.qwenlm.ai/public_source/1221a076-dd9b-48a8-acba-208f94fdb0db/15fbddfaa-ff75-4be1-a479-8a5ff3147953.png"]'::jsonb, '["waxed","laptop"]'::jsonb, true, 'Waxed-canvas carryall with a padded 16-inch laptop sleeve and leather hardware. Weatherproof, cabin-friendly.', to_timestamp(1788318400007/1000.0), to_timestamp(1788718402588/1000.0)),
('p6', 'Drift 65 Keyboard', 'FKN-HOM-006', 'c3', 159.0, 9, 5, 4.5, 'https://image.qwenlm.ai/public_source/1221a076-dd9b-48a8-acba-208f94fdb0db/1214494b1-608d-4fa9-b9b6-f8af10bc365c.png', '["https://image.qwenlm.ai/public_source/1221a076-dd9b-48a8-acba-208f94fdb0db/1214494b1-608d-4fa9-b9b6-f8af10bc365c.png"]'::jsonb, '["mechanical","hot-swap"]'::jsonb, false, 'Gasket-mounted 65% board with pre-lubed linear switches and hot-swap sockets. Ships tuned, sounds thocky.', to_timestamp(1788418400007/1000.0), to_timestamp(1788718402588/1000.0)),
('p7', 'Vista 4K Action Cam', 'FKN-WEA-007', 'c2', 229.0, 7, 4, 4.3, 'https://image.qwenlm.ai/public_source/1221a076-dd9b-48a8-acba-208f94fdb0db/1d128becf-b894-47ea-a6f0-a92f9be09d6d.png', '["https://image.qwenlm.ai/public_source/1221a076-dd9b-48a8-acba-208f94fdb0db/1d128becf-b894-47ea-a6f0-a92f9be09d6d.png"]'::jsonb, '["4k60","waterproof"]'::jsonb, false, 'Rugged 4K60 action camera with magnetic mounts and a swappable battery door. Waterproof to 10 m without a case.', to_timestamp(1788518400007/1000.0), to_timestamp(1788718402588/1000.0)),
('p8', 'Ember Travel Mug', 'FKN-CAR-008', 'c4', 34.0, 60, 12, 4.6, 'https://image.qwenlm.ai/public_source/1221a076-dd9b-48a8-acba-208f94fdb0db/14c11f570-57a1-4d6c-9614-4edb2a8b8d5c.png', '["https://image.qwenlm.ai/public_source/1221a076-dd9b-48a8-acba-208f94fdb0db/14c11f570-57a1-4d6c-9614-4edb2a8b8d5c.png"]'::jsonb, '["ceramic","bamboo"]'::jsonb, false, 'Double-wall ceramic mug with a bamboo lid. Keeps your pour-over hot through two meetings.', to_timestamp(1788618400007/1000.0), to_timestamp(1788718402588/1000.0));

INSERT INTO coupons (id, code, type, value, min_subtotal, max_uses, used_count, active, expires_at, description) VALUES
('cp1', 'WELCOME10', 'percent', 10.0, 50.0, 100, 0, true, to_timestamp(1791310402471/1000.0), '10% off orders over PKR 5,000.'),
('cp2', 'FREESHIP', 'free_shipping', 0.0, 50.0, 0, 0, true, to_timestamp(1793902402471/1000.0), 'Free standard shipping on orders over PKR 5,000.'),
('cp3', 'SAVE20', 'fixed', 20.0, 120.0, 50, 0, true, to_timestamp(1792606402471/1000.0), 'PKR 2,000 off orders over PKR 12,000.');

INSERT INTO site_settings (key, value) VALUES
('aboutBody', '"FikarNot brings together everyday technology, desk essentials and carry goods with an emphasis on clear information, practical value and a pleasant shopping experience."'::jsonb),
('aboutIntro', '"FikarNot is a curated e-commerce project built around a calmer, more considered way to discover useful products."'::jsonb),
('aboutTitle', '"Thoughtful things for everyday life."'::jsonb),
('allowCod', '"1"'::jsonb),
('allowManualPayments', '"1"'::jsonb),
('allowOnlinePayments', '"0"'::jsonb),
('announcement', '"Free shipping over PKR 5,000 \u00b7 30-day returns"'::jsonb),
('bankAccountNumber', '""'::jsonb),
('bankAccountTitle', '""'::jsonb),
('bankIban', '""'::jsonb),
('bankInstructions', '""'::jsonb),
('bankName', '""'::jsonb),
('currency', '"PKR"'::jsonb),
('currencyLocale', '"en-PK"'::jsonb),
('easypaisaNumber', '"923709072688"'::jsonb),
('facebookUrl', '""'::jsonb),
('freeShippingThreshold', '"5000"'::jsonb),
('heroEyebrow', '"FikarNot \u2014 objects for the everyday"'::jsonb),
('heroHighlight', '"beautifully chosen."'::jsonb),
('heroImage', '""'::jsonb),
('heroImages', '"[]"'::jsonb),
('heroKicker', '"Curated essentials \u00b7 Free shipping over PKR 5,000"'::jsonb),
('heroSticker', '"NEW SEASON DROP"'::jsonb),
('heroSubtitle', '"Discover a refined mix of tech, desk and everyday carry \u2014 selected for utility, character and the way they fit into real life."'::jsonb),
('heroTitle', '"Everyday essentials,"'::jsonb),
('heroVideo', '""'::jsonb),
('heroVideoWebm', '""'::jsonb),
('instagramUrl', '""'::jsonb),
('jazzcashNumber', '"923709072688"'::jsonb),
('logoUrl', '""'::jsonb),
('metaDescription', '"Discover a refined mix of tech, desk and everyday carry at FikarNot."'::jsonb),
('metaTitle', '"FikarNot \u2014 Everyday essentials, beautifully chosen."'::jsonb),
('navLinks', '"[]"'::jsonb),
('privacyPolicy', '"FikarNot stores only the information required to operate accounts, orders, support and delivery. Payment credentials are handled by the payment provider and are not stored by FikarNot."'::jsonb),
('returnPolicy', '"Eligible delivered orders may be requested for return within 30 days. Approved returns are inspected before completion and any eligible refund is issued through the original payment method."'::jsonb),
('shippingFlatRate', '"500"'::jsonb),
('shippingPolicy', '"Orders are processed after successful payment or COD confirmation. Shipping thresholds, rates and delivery windows are controlled by the current site settings and may vary by destination."'::jsonb),
('storeName', '"FikarNot"'::jsonb),
('supportEmail', '"support@fikarnot.shop"'::jsonb),
('taxLabel', '"GST"'::jsonb),
('taxRate', '"0"'::jsonb),
('termsOfService', '"Use of FikarNot is subject to applicable laws. Product descriptions, prices, availability and delivery estimates may change before an order is accepted."'::jsonb),
('whatsappNumber', '"923709072688"'::jsonb);

INSERT INTO catalog_meta (key, value) VALUES
('seeded', true);

INSERT INTO engagement_meta (key, value) VALUES
('email_verification_v1', true);
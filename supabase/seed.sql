insert into public.games (slug, name, category) values
  ('counter-strike-2', 'Counter-Strike 2', 'สกินอาวุธ'),
  ('team-fortress-2', 'Team Fortress 2', 'หมวกและไอเทม'),
  ('warframe', 'Warframe', 'Mods และชิ้นส่วน Prime'),
  ('dota-2', 'Dota 2', 'Hero cosmetics and treasures'),
  ('rust', 'Rust', 'Clothing, weapon, and deployable skins'),
  ('unturned', 'Unturned', 'Cosmetics and weapon skins')
on conflict (slug) do update set name = excluded.name, category = excluded.category;

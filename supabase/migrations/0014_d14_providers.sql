-- 0014 D14：admin key 按名解析 elevenlabs / doubao-speech
insert into public.providers (name, protocol, base_url, enabled) values
  ('elevenlabs', 'openmontage-bridge', 'https://api.elevenlabs.io', true),
  ('doubao-speech', 'openmontage-bridge', 'https://openspeech.bytedance.com', true)
on conflict (name) do update set protocol = excluded.protocol, base_url = excluded.base_url;

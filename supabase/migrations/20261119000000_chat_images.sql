alter table public.messages
  add column image_path text,
  drop constraint messages_body_check,
  add constraint messages_body_check check (
    char_length(body) <= 4000 and (char_length(body) >= 1 or image_path is not null)
  ),
  add constraint messages_user_image_check check (image_path is null or kind = 'USER');

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('chat-images', 'chat-images', false, 3145728, array['image/jpeg', 'image/png', 'image/webp']);

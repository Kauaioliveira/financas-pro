-- FinançasPro: esquema inicial (Supabase). Rodar UMA vez no SQL Editor.
-- Guia: docs/deploy/supabase.md. Teste primeiro num projeto de teste (supabase/tests/0001_init_check.sql).
--
-- Princípio: o servidor guarda só texto cifrado e embrulhos de chave. Nada aqui decifra dados.
-- Projetos criados após 30/05/2026 não expõem tabelas à Data API sem GRANT explícito;
-- por isso cada permissão abaixo é explícita.
--
-- Ameaça considerada: alguém que controla o e-mail do usuário faz "esqueci a senha",
-- ganha uma sessão válida e grava lixo. Não lê nada, mas poderia destruir chaves e cofre.
-- Defesas: histórico de chaves (vault_key_history) e de cofres (vault_history), que o
-- usuário só consegue ler; escrita só por funções com controle de versão.

------------------------------------------------------------
-- 1) Cofre: uma linha por usuário
------------------------------------------------------------
create table public.vaults (
  user_id       uuid        primary key references auth.users(id) on delete cascade,
  format        smallint    not null default 2,
  kdf           jsonb       not null,   -- {"alg":"PBKDF2-SHA256","iterations":600000,"salt":"email-v1"}
  pw_wrap       jsonb       not null,   -- {"iv":"b64","wrapped":"b64"}
  kit_wrap      jsonb,                  -- {"kdf":"...","id":"a1b2c3","salt":"b64","iterations":600000,"iv":"b64","wrapped":"b64","createdAt":"ISO"}
  keys_version  integer     not null default 1,
  ciphertext    text        not null,   -- JSON EncryptedPayload de gzip(JSON do cofre)
  version       bigint      not null default 0,
  updated_at    timestamptz not null default now(),
  device_id     text,
  constraint vaults_kdf_obj      check (jsonb_typeof(kdf) = 'object' and pg_column_size(kdf) <= 4096),
  constraint vaults_pw_wrap_obj  check (jsonb_typeof(pw_wrap) = 'object' and pw_wrap ? 'iv' and pw_wrap ? 'wrapped'
                                        and pg_column_size(pw_wrap) <= 4096),
  constraint vaults_kit_wrap_obj check (kit_wrap is null or (jsonb_typeof(kit_wrap) = 'object' and kit_wrap ? 'wrapped'
                                        and pg_column_size(kit_wrap) <= 4096)),
  constraint vaults_cipher_size  check (octet_length(ciphertext) between 1 and 5000000),
  constraint vaults_device_size  check (device_id is null or char_length(device_id) <= 64)
);

alter table public.vaults enable row level security;

revoke all on public.vaults from public, anon, authenticated;
grant select on public.vaults to authenticated;
-- INSERT só com as colunas permitidas; version, keys_version e updated_at ficam no default.
grant insert (user_id, format, kdf, pw_wrap, kit_wrap, ciphertext, device_id) on public.vaults to authenticated;
-- Sem UPDATE/DELETE direto: alterações só pelas funções da seção 4 (garantem versão).

create policy "vaults_select_own" on public.vaults
  for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "vaults_insert_own" on public.vaults
  for insert to authenticated
  with check ((select auth.uid()) = user_id);

------------------------------------------------------------
-- 2) Histórico do cofre: até 7 cópias, no máximo 1 a cada ~20 h. Usuário só lê.
--    keys_version indica quais chaves (vault_key_history) abrem cada cópia.
------------------------------------------------------------
create table public.vault_history (
  id            bigint      generated always as identity primary key,
  user_id       uuid        not null references auth.users(id) on delete cascade,
  version       bigint      not null,
  keys_version  integer     not null,
  ciphertext    text        not null,
  created_at    timestamptz not null default now()
);
create index vault_history_user_created on public.vault_history (user_id, created_at desc);

alter table public.vault_history enable row level security;
revoke all on public.vault_history from public, anon, authenticated;
grant select on public.vault_history to authenticated;

create policy "vault_history_select_own" on public.vault_history
  for select to authenticated
  using ((select auth.uid()) = user_id);

create or replace function public.snapshot_vault()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.ciphertext is distinct from new.ciphertext
     and not exists (
       select 1 from public.vault_history h
        where h.user_id = old.user_id
          and h.created_at > now() - interval '20 hours')
  then
    insert into public.vault_history (user_id, version, keys_version, ciphertext)
    values (old.user_id, old.version, old.keys_version, old.ciphertext);

    delete from public.vault_history h
     where h.user_id = old.user_id
       and h.id not in (
         select h2.id from public.vault_history h2
          where h2.user_id = old.user_id
          order by h2.created_at desc, h2.id desc
          limit 7);
  end if;
  return new;
end;
$$;
revoke execute on function public.snapshot_vault() from public, anon, authenticated;

create trigger vaults_snapshot
  before update of ciphertext on public.vaults
  for each row execute function public.snapshot_vault();

------------------------------------------------------------
-- 3) Histórico das chaves: TODA mudança de kdf, pw_wrap ou kit_wrap guarda os valores
--    anteriores. Nada com menos de 30 dias é apagado, e cabem no máximo 20 trocas em
--    24 h: assim uma rajada de trocas (e-mail invadido) não empurra para fora do
--    histórico a chave boa de antes do ataque. Passados 30 dias, mantém as 10 mais
--    recentes. Usuário só lê.
--    É o que permite abrir os dados com o kit depois que alguém sobrescreveu as chaves.
------------------------------------------------------------
create table public.vault_key_history (
  id            bigint      generated always as identity primary key,
  user_id       uuid        not null references auth.users(id) on delete cascade,
  kdf           jsonb       not null,
  pw_wrap       jsonb       not null,
  kit_wrap      jsonb,
  keys_version  integer     not null,
  created_at    timestamptz not null default now()
);
create index vault_key_history_user_created on public.vault_key_history (user_id, created_at desc, id desc);

alter table public.vault_key_history enable row level security;
revoke all on public.vault_key_history from public, anon, authenticated;
grant select on public.vault_key_history to authenticated;

create policy "vault_key_history_select_own" on public.vault_key_history
  for select to authenticated
  using ((select auth.uid()) = user_id);

create or replace function public.snapshot_vault_keys()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.kdf is distinct from new.kdf
     or old.pw_wrap is distinct from new.pw_wrap
     or old.kit_wrap is distinct from new.kit_wrap
  then
    -- Teto de trocas: quem tem só a sessão (ex.: e-mail invadido) não consegue girar as
    -- chaves em rajada para encher o histórico. Uso legítimo — trocar senha, gerar kit
    -- novo, recuperar — fica muito abaixo disso.
    if (select count(*) from public.vault_key_history h
         where h.user_id = old.user_id
           and h.created_at > now() - interval '24 hours') >= 20 then
      raise exception 'too_many_key_changes' using errcode = '54000';
    end if;

    insert into public.vault_key_history (user_id, kdf, pw_wrap, kit_wrap, keys_version)
    values (old.user_id, old.kdf, old.pw_wrap, old.kit_wrap, old.keys_version);

    -- Nada com menos de 30 dias sai: é o que garante que a chave boa sobreviva a uma
    -- rajada de trocas. Depois disso, mantém as 10 mais recentes.
    delete from public.vault_key_history h
     where h.user_id = old.user_id
       and h.created_at < now() - interval '30 days'
       and h.id not in (
         select h2.id from public.vault_key_history h2
          where h2.user_id = old.user_id
          order by h2.created_at desc, h2.id desc
          limit 10);
  end if;
  return new;
end;
$$;
revoke execute on function public.snapshot_vault_keys() from public, anon, authenticated;

create trigger vaults_snapshot_keys
  before update on public.vaults
  for each row execute function public.snapshot_vault_keys();

------------------------------------------------------------
-- 4) Funções chamadas pelo app (supabase.rpc)
------------------------------------------------------------

-- Salva o cofre só se ninguém salvou antes (controle otimista).
-- Retorna a nova versão, ou NULL em conflito (ou cofre inexistente).
create or replace function public.save_vault(
  p_expected_version bigint,
  p_ciphertext text,
  p_device_id text default null
) returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_new bigint;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  if p_ciphertext is null or octet_length(p_ciphertext) = 0 then
    raise exception 'invalid_ciphertext' using errcode = '22023';
  end if;
  if p_expected_version is null then
    raise exception 'invalid_expected_version' using errcode = '22023';
  end if;

  update public.vaults
     set ciphertext = p_ciphertext,
         version    = version + 1,
         updated_at = now(),
         device_id  = p_device_id
   where user_id = v_uid
     and version = p_expected_version
  returning version into v_new;

  return v_new;
end;
$$;

-- Troca só o embrulho da senha, com a MESMA dataKey (troca de senha, reset + kit,
-- "lembrei a senha antiga"). Controle de versão das chaves: se outro aparelho trocou
-- as chaves (ex.: kit novo girou a dataKey), retorna NULL e não grava um pw_wrap
-- que embrulharia a chave antiga.
-- Retorna o novo keys_version, ou NULL em conflito (ou cofre inexistente).
create or replace function public.set_password_wrap(
  p_expected_keys_version integer,
  p_kdf jsonb,
  p_pw_wrap jsonb
) returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_keys integer;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  if p_expected_keys_version is null
     or p_kdf is null or jsonb_typeof(p_kdf) <> 'object'
     or p_pw_wrap is null or jsonb_typeof(p_pw_wrap) <> 'object'
     or not (p_pw_wrap ? 'iv' and p_pw_wrap ? 'wrapped') then
    raise exception 'invalid_password_wrap' using errcode = '22023';
  end if;

  update public.vaults
     set kdf = p_kdf,
         pw_wrap = p_pw_wrap,
         keys_version = keys_version + 1,
         updated_at = now()
   where user_id = v_uid
     and keys_version = p_expected_keys_version
  returning keys_version into v_keys;

  return v_keys;
end;
$$;

-- Troca de kit atômica, girando a dataKey (mesma decisão do modo local): embrulho da
-- senha, embrulho do kit e cofre recifrado mudam juntos, numa transação, só se a versão
-- do cofre for a esperada. Também serve para "começar do zero".
-- Retorna a nova versão do cofre, ou NULL em conflito (ou cofre inexistente).
create or replace function public.rotate_vault_keys(
  p_expected_version bigint,
  p_kdf jsonb,
  p_pw_wrap jsonb,
  p_kit_wrap jsonb,
  p_ciphertext text
) returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_new bigint;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  if p_expected_version is null
     or p_kdf is null or jsonb_typeof(p_kdf) <> 'object'
     or p_pw_wrap is null or jsonb_typeof(p_pw_wrap) <> 'object'
     or not (p_pw_wrap ? 'iv' and p_pw_wrap ? 'wrapped')
     or p_kit_wrap is null or jsonb_typeof(p_kit_wrap) <> 'object'
     or not (p_kit_wrap ? 'wrapped') then
    raise exception 'invalid_keys' using errcode = '22023';
  end if;
  if p_ciphertext is null or octet_length(p_ciphertext) = 0 then
    raise exception 'invalid_ciphertext' using errcode = '22023';
  end if;

  update public.vaults
     set kdf = p_kdf,
         pw_wrap = p_pw_wrap,
         kit_wrap = p_kit_wrap,
         ciphertext = p_ciphertext,
         version = version + 1,
         keys_version = keys_version + 1,
         updated_at = now()
   where user_id = v_uid
     and version = p_expected_version
  returning version into v_new;

  return v_new;
end;
$$;

revoke execute on function public.save_vault(bigint, text, text)                       from public, anon;
revoke execute on function public.set_password_wrap(integer, jsonb, jsonb)             from public, anon;
revoke execute on function public.rotate_vault_keys(bigint, jsonb, jsonb, jsonb, text) from public, anon;
grant  execute on function public.save_vault(bigint, text, text)                       to authenticated;
grant  execute on function public.set_password_wrap(integer, jsonb, jsonb)             to authenticated;
grant  execute on function public.rotate_vault_keys(bigint, jsonb, jsonb, jsonb, text) to authenticated;

------------------------------------------------------------
-- 5) Opinião dos testadores: só inserção; ninguém lê pelo app.
------------------------------------------------------------
create table public.feedback (
  id           bigint      generated always as identity primary key,
  user_id      uuid        not null default auth.uid() references auth.users(id) on delete cascade,
  kind         text        not null check (kind in ('bug', 'ideia', 'elogio', 'outro')),
  message      text        not null check (char_length(message) between 1 and 2000),
  screen       text        check (screen is null or char_length(screen) <= 40),
  app_version  text        check (app_version is null or char_length(app_version) <= 40),
  created_at   timestamptz not null default now()
);

alter table public.feedback enable row level security;
revoke all on public.feedback from public, anon, authenticated;
grant insert (kind, message, screen, app_version) on public.feedback to authenticated;

create policy "feedback_insert_own" on public.feedback
  for insert to authenticated
  with check ((select auth.uid()) = user_id);

------------------------------------------------------------
-- 6) Beta fechado: só e-mails da lista conseguem se cadastrar
--    (ligar o hook "Before User Created" no painel; ver o guia)
------------------------------------------------------------
create table public.beta_allowlist (
  email     text        primary key check (email = lower(email)),
  note      text,
  added_at  timestamptz not null default now()
);

alter table public.beta_allowlist enable row level security;
revoke all on public.beta_allowlist from public, anon, authenticated;
grant usage on schema public to supabase_auth_admin;
grant select on public.beta_allowlist to supabase_auth_admin;

create policy "beta_allowlist_auth_admin_read" on public.beta_allowlist
  for select to supabase_auth_admin
  using (true);

create or replace function public.hook_beta_allowlist(event jsonb)
returns jsonb
language plpgsql
set search_path = ''
as $$
begin
  if exists (
    select 1 from public.beta_allowlist
     where email = lower(trim(event->'user'->>'email'))
  ) then
    return '{}'::jsonb;
  end if;

  return jsonb_build_object(
    'error', jsonb_build_object(
      'message', 'Cadastro fechado: este e-mail ainda não está na lista do beta.',
      'http_code', 403
    )
  );
end;
$$;

revoke execute on function public.hook_beta_allowlist(jsonb) from public, anon, authenticated;
grant execute on function public.hook_beta_allowlist(jsonb) to supabase_auth_admin;

-- Depois de rodar: incluir os e-mails do beta (sempre em minúsculas)
-- insert into public.beta_allowlist (email, note) values ('dono@gmail.com', 'dono');

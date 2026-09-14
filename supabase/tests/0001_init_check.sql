-- FinançasPro: verificação do esquema 0001_init.sql.
-- Rodar no SQL Editor de um PROJETO DE TESTE, depois de 0001_init.sql.
-- Tudo acontece dentro de uma transação que termina em ROLLBACK: nada fica gravado.
-- Resultado esperado: a última linha mostra "OK: todas as verificações passaram".
-- Qualquer "FALHA: ..." interrompe o script e diz o que não se comportou como deveria.

begin;

-- Dois usuários fictícios (somem no rollback).
insert into auth.users (id, email)
values ('00000000-0000-4000-8000-00000000000a', 'teste-a@exemplo.invalid'),
       ('00000000-0000-4000-8000-00000000000b', 'teste-b@exemplo.invalid');

-- Hook de allowlist (roda como supabase_auth_admin no Supabase; aqui chamamos como postgres).
insert into public.beta_allowlist (email) values ('teste-a@exemplo.invalid');
do $$
begin
  if public.hook_beta_allowlist('{"user":{"email":"Teste-A@Exemplo.invalid"}}'::jsonb) <> '{}'::jsonb then
    raise exception 'FALHA: e-mail da allowlist devia ser aceito';
  end if;
  if (public.hook_beta_allowlist('{"user":{"email":"fora@exemplo.invalid"}}'::jsonb)->'error'->>'http_code') <> '403' then
    raise exception 'FALHA: e-mail fora da allowlist devia receber 403';
  end if;
end $$;

------------------------------------------------------------
-- Usuário A
------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000000a","role":"authenticated"}', true);

insert into public.vaults (user_id, kdf, pw_wrap, kit_wrap, ciphertext)
values ('00000000-0000-4000-8000-00000000000a',
        '{"alg":"PBKDF2-SHA256","iterations":600000}',
        '{"iv":"iv0","wrapped":"pw0"}',
        '{"wrapped":"kit0"}',
        'c0');

do $$
declare
  v bigint;
  k integer;
begin
  -- A não consegue criar cofre em nome de B.
  begin
    insert into public.vaults (user_id, kdf, pw_wrap, ciphertext)
    values ('00000000-0000-4000-8000-00000000000b', '{}', '{"iv":"x","wrapped":"y"}', 'x');
    raise exception 'FALHA: A criou cofre para B';
  exception when insufficient_privilege then null;
  end;

  -- Sem UPDATE/DELETE direto.
  begin
    update public.vaults set ciphertext = 'hack';
    raise exception 'FALHA: UPDATE direto devia ser negado';
  exception when insufficient_privilege then null;
  end;
  begin
    delete from public.vaults;
    raise exception 'FALHA: DELETE direto devia ser negado';
  exception when insufficient_privilege then null;
  end;

  -- save_vault: versão certa grava; versão velha é conflito (NULL).
  v := public.save_vault(0, 'c1');
  if v is distinct from 1 then raise exception 'FALHA: save_vault devia retornar 1, retornou %', v; end if;
  v := public.save_vault(0, 'c-velho');
  if v is not null then raise exception 'FALHA: conflito devia retornar NULL, retornou %', v; end if;
  if (select ciphertext from public.vaults) <> 'c1' then raise exception 'FALHA: conflito alterou o cofre'; end if;

  -- save_vault rejeita ciphertext nulo.
  begin
    perform public.save_vault(1, null);
    raise exception 'FALHA: save_vault aceitou ciphertext nulo';
  exception when invalid_parameter_value then null;
  end;

  -- Histórico do cofre: a primeira gravação guardou "c0"; a segunda (dentro de 20 h) não guarda.
  v := public.save_vault(1, 'c2');
  if (select count(*) from public.vault_history) <> 1
     or (select ciphertext from public.vault_history) <> 'c0' then
    raise exception 'FALHA: vault_history devia ter só a cópia c0';
  end if;

  -- set_password_wrap: com keys_version certo grava e guarda as chaves antigas.
  k := public.set_password_wrap(1, '{"alg":"PBKDF2-SHA256"}', '{"iv":"iv1","wrapped":"pw1"}');
  if k is distinct from 2 then raise exception 'FALHA: set_password_wrap devia retornar 2, retornou %', k; end if;
  if (select pw_wrap->>'wrapped' from public.vault_key_history order by id desc limit 1) <> 'pw0' then
    raise exception 'FALHA: vault_key_history não guardou o pw_wrap anterior';
  end if;
  -- keys_version velho: conflito, nada muda.
  k := public.set_password_wrap(1, '{"alg":"PBKDF2-SHA256"}', '{"iv":"iv9","wrapped":"pw-velho"}');
  if k is not null then raise exception 'FALHA: set_password_wrap com versão velha devia retornar NULL'; end if;

  -- rotate_vault_keys: tudo muda junto; versão velha não muda nada.
  v := public.rotate_vault_keys(2, '{"alg":"PBKDF2-SHA256"}', '{"iv":"iv2","wrapped":"pw2"}', '{"wrapped":"kit2"}', 'c3');
  if v is distinct from 3 then raise exception 'FALHA: rotate_vault_keys devia retornar 3, retornou %', v; end if;
  v := public.rotate_vault_keys(2, '{"alg":"x"}', '{"iv":"x","wrapped":"x"}', '{"wrapped":"x"}', 'x');
  if v is not null then raise exception 'FALHA: rotate_vault_keys com versão velha devia retornar NULL'; end if;
  if (select kit_wrap->>'wrapped' from public.vaults) <> 'kit2' or (select ciphertext from public.vaults) <> 'c3' then
    raise exception 'FALHA: rotate_vault_keys não foi atômico';
  end if;
  begin
    perform public.rotate_vault_keys(3, '{}', '{"iv":"x","wrapped":"x"}', null, 'x');
    raise exception 'FALHA: rotate_vault_keys aceitou kit_wrap nulo';
  exception when invalid_parameter_value then null;
  end;

  -- Histórico de chaves: guarda toda mudança, sem limite de frequência, e mantém 10.
  for i in 1..12 loop
    k := public.set_password_wrap((select keys_version from public.vaults), '{"alg":"x"}',
                                  jsonb_build_object('iv', 'i', 'wrapped', 'loop' || i));
  end loop;
  if (select count(*) from public.vault_key_history) <> 10 then
    raise exception 'FALHA: vault_key_history devia manter 10, tem %', (select count(*) from public.vault_key_history);
  end if;

  -- Histórico só leitura.
  begin
    delete from public.vault_key_history;
    raise exception 'FALHA: DELETE em vault_key_history devia ser negado';
  exception when insufficient_privilege then null;
  end;

  -- Opinião: insere, não lê.
  insert into public.feedback (kind, message) values ('ideia', 'teste');
  begin
    perform 1 from public.feedback;
    raise exception 'FALHA: SELECT em feedback devia ser negado';
  exception when insufficient_privilege then null;
  end;

  -- Allowlist invisível para usuários.
  begin
    perform 1 from public.beta_allowlist;
    raise exception 'FALHA: SELECT em beta_allowlist devia ser negado';
  exception when insufficient_privilege then null;
  end;
end $$;

------------------------------------------------------------
-- Usuário B não vê nada de A
------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000000b","role":"authenticated"}', true);

do $$
begin
  if exists (select 1 from public.vaults) then raise exception 'FALHA: B vê o cofre de A'; end if;
  if exists (select 1 from public.vault_history) then raise exception 'FALHA: B vê o histórico de A'; end if;
  if exists (select 1 from public.vault_key_history) then raise exception 'FALHA: B vê as chaves de A'; end if;
  if public.save_vault(3, 'b-sobrescreve') is not null then raise exception 'FALHA: B gravou no cofre de A'; end if;
end $$;

------------------------------------------------------------
-- Visitante sem login (anon) não acessa nada
------------------------------------------------------------
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);

do $$
begin
  begin
    perform 1 from public.vaults;
    raise exception 'FALHA: anon leu vaults';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.save_vault(0, 'x');
    raise exception 'FALHA: anon executou save_vault';
  exception when insufficient_privilege then null;
  end;
end $$;

reset role;
select 'OK: todas as verificações passaram' as resultado;

rollback;

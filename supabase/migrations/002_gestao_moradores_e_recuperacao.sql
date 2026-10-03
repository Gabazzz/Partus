-- =====================================================================
-- Partus · migração 002
--   1) foto de perfil dos moradores
--   2) admin cria / edita (nome, foto, avatar) / exclui moradores
--   3) "Esqueci minha senha" do admin (código por e-mail)
--
-- Rode este arquivo inteiro no SQL Editor do Supabase.
--
-- PREMISSAS sobre o que já existe no seu banco (não estão no repositório):
--   • tabela public.moradores com as colunas id, nome, avatar, is_admin
--   • as funções entrar_admin / definir_senha_admin já existem
--
-- Por isso há DOIS adaptadores logo abaixo (partus_exigir_admin e
-- partus_gravar_senha). Eles precisam apontar para o mecanismo de token e
-- de hash de senha que você JÁ usa. Enquanto não forem adaptados, as novas
-- funções falham de propósito (mensagem explicando), sem afetar o app atual.
-- =====================================================================

create extension if not exists pgcrypto with schema extensions;

alter table public.moradores add column if not exists foto text;

-- ---------------------------------------------------------------------
-- ADAPTADOR 1 · valida o token do admin
-- Deve lançar exceção 'Sem permissão' quando o token for inválido/expirado
-- (o front-end trata exatamente essa mensagem como sessão expirada).
-- Troque o corpo pela mesma checagem usada em listar_despesas/editar_despesa.
-- ---------------------------------------------------------------------
create or replace function public.partus_exigir_admin(p_token text)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  raise exception 'ADAPTAR: ligue partus_exigir_admin à validação de token existente';
  -- Exemplo (ajuste ao seu esquema):
  -- if not exists (
  --   select 1 from public.sessoes_admin s
  --   where s.token = p_token and s.expira_em > now()
  -- ) then
  --   raise exception 'Sem permissão';
  -- end if;
end;
$$;

-- ---------------------------------------------------------------------
-- ADAPTADOR 2 · grava a senha do admin do mesmo jeito que entrar_admin confere
-- ---------------------------------------------------------------------
create or replace function public.partus_gravar_senha(p_morador text, p_senha text)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  raise exception 'ADAPTAR: ligue partus_gravar_senha ao hash de senha existente';
  -- Exemplo (ajuste coluna/algoritmo ao que entrar_admin usa):
  -- update public.moradores
  --    set senha_hash = crypt(p_senha, gen_salt('bf'))
  --  where id::text = p_morador and is_admin;
end;
$$;

revoke all on function public.partus_exigir_admin(text) from public, anon, authenticated;
revoke all on function public.partus_gravar_senha(text, text) from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- Fotos (públicas entre os moradores, como os nomes)
-- ---------------------------------------------------------------------
create or replace function public.listar_fotos()
returns table (id text, foto text)
language sql
security definer
set search_path = public
as $$
  select m.id::text, m.foto from public.moradores m where m.foto is not null;
$$;

-- ---------------------------------------------------------------------
-- Criar / editar morador (p_id nulo = criar). Retorna o id.
--   p_foto: data URL de imagem (o app já envia redimensionada, ~320px).
--           nulo = não alterar a foto.
--   p_remover_foto: true apaga a foto atual.
-- ---------------------------------------------------------------------
create or replace function public.admin_salvar_morador(
  p_token text,
  p_id text,
  p_nome text,
  p_avatar text default null,
  p_foto text default null,
  p_remover_foto boolean default false
) returns text
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_nome text := btrim(coalesce(p_nome, ''));
  v_id text;
begin
  perform public.partus_exigir_admin(p_token);

  if char_length(v_nome) < 1 or char_length(v_nome) > 40 then
    raise exception 'O nome deve ter entre 1 e 40 caracteres';
  end if;

  if p_foto is not null then
    if p_foto !~ '^data:image/(jpeg|png|webp);base64,' then
      raise exception 'Formato de imagem inválido';
    end if;
    if char_length(p_foto) > 400000 then
      raise exception 'Imagem muito grande';
    end if;
  end if;

  if p_id is null or p_id = '' then
    insert into public.moradores (nome, avatar, is_admin, foto)
    values (v_nome, nullif(btrim(coalesce(p_avatar, '')), ''), false, p_foto)
    returning id::text into v_id;
    return v_id;
  end if;

  update public.moradores
     set nome   = v_nome,
         avatar = coalesce(nullif(btrim(coalesce(p_avatar, '')), ''), avatar),
         foto   = case when p_remover_foto then null else coalesce(p_foto, foto) end
   where id::text = p_id
   returning id::text into v_id;

  if v_id is null then
    raise exception 'Morador não encontrado';
  end if;
  return v_id;
end;
$$;

-- ---------------------------------------------------------------------
-- Excluir morador (não permite excluir admin nem quem já lançou gastos)
-- ---------------------------------------------------------------------
create or replace function public.admin_excluir_morador(p_token text, p_id text)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  perform public.partus_exigir_admin(p_token);

  if exists (select 1 from public.moradores where id::text = p_id and is_admin) then
    raise exception 'O administrador não pode ser excluído';
  end if;

  begin
    delete from public.moradores where id::text = p_id;
  exception when foreign_key_violation then
    raise exception 'Este morador tem gastos lançados e não pode ser excluído';
  end;
end;
$$;

-- ---------------------------------------------------------------------
-- Recuperação de senha do admin
-- ---------------------------------------------------------------------
create table if not exists public.partus_recuperacao (
  id bigserial primary key,
  morador text not null,
  codigo_hash text not null,
  criado_em timestamptz not null default now(),
  expira_em timestamptz not null,
  tentativas int not null default 0,
  usado boolean not null default false
);
alter table public.partus_recuperacao enable row level security;  -- sem policies: só funções security definer acessam

-- Chamada SOMENTE pela Edge Function (service_role): registra o hash do código.
create or replace function public.partus_criar_recuperacao(p_morador text, p_hash text)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if not exists (select 1 from public.moradores where id::text = p_morador and is_admin) then
    raise exception 'Perfil inválido';
  end if;

  if exists (
    select 1 from public.partus_recuperacao
     where morador = p_morador and criado_em > now() - interval '60 seconds'
  ) then
    raise exception 'Aguarde um minuto para pedir outro código';
  end if;

  if (select count(*) from public.partus_recuperacao
       where morador = p_morador and criado_em > now() - interval '1 hour') >= 5 then
    raise exception 'Muitos pedidos de código. Tente novamente mais tarde';
  end if;

  update public.partus_recuperacao set usado = true where morador = p_morador and not usado;

  insert into public.partus_recuperacao (morador, codigo_hash, expira_em)
  values (p_morador, p_hash, now() + interval '15 minutes');
end;
$$;

revoke all on function public.partus_criar_recuperacao(text, text) from public, anon, authenticated;
grant execute on function public.partus_criar_recuperacao(text, text) to service_role;

-- Retorna 'ok' | 'incorreto' | 'expirado' | 'bloqueado'.
-- (Não usa RAISE para "incorreto": uma exceção desfaria o contador de tentativas.)
create or replace function public.redefinir_senha_admin(p_morador text, p_codigo text, p_senha text)
returns text
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  r public.partus_recuperacao;
  v_hash text;
begin
  if char_length(coalesce(p_senha, '')) < 6 then
    raise exception 'A senha deve ter no mínimo 6 caracteres';
  end if;

  select * into r
    from public.partus_recuperacao
   where morador = p_morador and not usado
   order by criado_em desc
   limit 1
   for update;

  if not found or r.expira_em < now() then
    return 'expirado';
  end if;

  if r.tentativas >= 5 then
    update public.partus_recuperacao set usado = true where id = r.id;
    return 'bloqueado';
  end if;

  update public.partus_recuperacao set tentativas = tentativas + 1 where id = r.id;

  v_hash := encode(digest(coalesce(p_codigo, '') || ':' || p_morador, 'sha256'), 'hex');
  if v_hash <> r.codigo_hash then
    return 'incorreto';
  end if;

  update public.partus_recuperacao set usado = true where id = r.id;
  perform public.partus_gravar_senha(p_morador, p_senha);
  return 'ok';
end;
$$;

-- Permissões de execução
grant execute on function public.listar_fotos() to anon, authenticated;
grant execute on function public.admin_salvar_morador(text, text, text, text, text, boolean) to anon, authenticated;
grant execute on function public.admin_excluir_morador(text, text) to anon, authenticated;
grant execute on function public.redefinir_senha_admin(text, text, text) to anon, authenticated;

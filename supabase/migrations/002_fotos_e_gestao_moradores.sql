-- =====================================================================
-- Partus · migração 002
--   1) foto de perfil dos moradores
--   2) admin cria / edita (nome, foto, avatar) / inativa moradores
--
-- Adaptada ao esquema real do projeto (sessoes_admin + senha_hash via
-- entrar_admin/definir_senha_admin). "Excluir" morador é soft-delete
-- (coluna ativo) para preservar o histórico de despesas já lançadas.
-- =====================================================================

create extension if not exists pgcrypto with schema extensions;

alter table public.moradores add column if not exists foto text;
alter table public.moradores add column if not exists ativo boolean not null default true;

create or replace function public.listar_moradores()
returns table (id uuid, nome text, avatar text, is_admin boolean, tem_senha boolean)
language sql security definer set search_path = public as $$
  select id, nome, avatar, is_admin, senha_hash is not null
  from public.moradores
  where ativo
  order by criado_em
$$;

create or replace function public.listar_fotos()
returns table (id text, foto text)
language sql security definer set search_path = public as $$
  select m.id::text, m.foto from public.moradores m where m.foto is not null and m.ativo
$$;

create or replace function public.admin_salvar_morador(
  p_token uuid,
  p_id uuid,
  p_nome text,
  p_avatar text default null,
  p_foto text default null,
  p_remover_foto boolean default false
) returns uuid
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_nome text := btrim(coalesce(p_nome, ''));
  v_id uuid;
begin
  if public._admin_da_sessao(p_token) is null then raise exception 'Sem permissão'; end if;

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

  if p_id is null then
    insert into public.moradores (nome, avatar, is_admin, foto)
    values (v_nome, nullif(btrim(coalesce(p_avatar, '')), ''), false, p_foto)
    returning id into v_id;
    return v_id;
  end if;

  update public.moradores
     set nome   = v_nome,
         avatar = coalesce(nullif(btrim(coalesce(p_avatar, '')), ''), avatar),
         foto   = case when p_remover_foto then null else coalesce(p_foto, foto) end
   where id = p_id and ativo
   returning id into v_id;

  if v_id is null then
    raise exception 'Morador não encontrado';
  end if;
  return v_id;
end $$;

-- "Excluir" = inativar (soft delete); o admin nunca pode ser inativado.
create or replace function public.admin_excluir_morador(p_token uuid, p_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if public._admin_da_sessao(p_token) is null then raise exception 'Sem permissão'; end if;

  if exists (select 1 from public.moradores where id = p_id and is_admin) then
    raise exception 'O administrador não pode ser excluído';
  end if;

  update public.moradores set ativo = false where id = p_id;
end $$;

-- Segundo toggle de permissão por morador: além de "ver tudo" (dashboard
-- completo da casa), o admin agora pode autorizar um morador não-admin a
-- editar (não excluir) só os gastos que ELE MESMO lançou. Os dois toggles
-- são independentes: dá pra ver tudo sem editar (ex.: sogra), editar sem
-- ver tudo, os dois juntos, ou nenhum (padrão).

alter table public.moradores
  add column if not exists pode_editar_proprios boolean not null default false;

drop function if exists public.listar_moradores();
create function public.listar_moradores()
returns table(id uuid, nome text, avatar text, is_admin boolean, tem_senha boolean, pode_ver_tudo boolean, pode_editar_proprios boolean)
language sql
security definer
set search_path to 'public'
as $$
  select id, nome, avatar, is_admin, senha_hash is not null, pode_ver_tudo, pode_editar_proprios
  from public.moradores
  where ativo
  order by criado_em
$$;

drop function if exists public.admin_salvar_morador(uuid, uuid, text, text, text, boolean, boolean);
create function public.admin_salvar_morador(p_token uuid, p_id uuid, p_nome text, p_avatar text default null, p_foto text default null, p_remover_foto boolean default false, p_visualizador boolean default null, p_editor boolean default null)
returns uuid
language plpgsql
security definer
set search_path to 'public', 'extensions'
as $$
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
    insert into public.moradores (nome, avatar, is_admin, foto, pode_ver_tudo, pode_editar_proprios)
    values (v_nome, nullif(btrim(coalesce(p_avatar, '')), ''), false, p_foto, coalesce(p_visualizador, false), coalesce(p_editor, false))
    returning id into v_id;
    return v_id;
  end if;

  update public.moradores
     set nome   = v_nome,
         avatar = coalesce(nullif(btrim(coalesce(p_avatar, '')), ''), avatar),
         foto   = case when p_remover_foto then null else coalesce(p_foto, foto) end,
         pode_ver_tudo = coalesce(p_visualizador, pode_ver_tudo),
         pode_editar_proprios = coalesce(p_editor, pode_editar_proprios)
   where id = p_id and ativo
   returning id into v_id;

  if v_id is null then
    raise exception 'Morador não encontrado';
  end if;
  return v_id;
end $$;

-- editar_despesa: agora também aceita um morador não-admin autorizado
-- (pode_editar_proprios) editando um gasto que ele mesmo lançou, além do
-- caminho de admin via p_token. Exclusão continua exclusiva do admin.
drop function if exists public.editar_despesa(uuid, uuid, text, numeric, text, date, text);
create function public.editar_despesa(p_token uuid, p_morador uuid, p_id uuid, p_item text, p_valor numeric, p_descricao text, p_data date, p_categoria text default null)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare v_atual public.despesas; v_cat text; v_admin uuid;
begin
  select * into v_atual from public.despesas where id = p_id and not excluido;
  if not found then raise exception 'Gasto não encontrado'; end if;

  v_admin := public._admin_da_sessao(p_token);
  if v_admin is null then
    if p_morador is null or v_atual.morador_id <> p_morador then
      raise exception 'Sem permissão';
    end if;
    if not exists (select 1 from public.moradores where id = p_morador and pode_editar_proprios and ativo) then
      raise exception 'Sem permissão';
    end if;
  end if;

  if public._mes_fechado(v_atual.data) or public._mes_fechado(p_data) then
    raise exception 'Mês fechado. Peça para o administrador reabrir.';
  end if;

  v_cat := case
    when p_categoria is null then v_atual.categoria
    when p_categoria in ('Alimentação', 'Transporte', 'Moradia', 'Saúde', 'Lazer', 'Outros') then p_categoria
    else 'Outros'
  end;
  update public.despesas
     set item = trim(p_item), valor = p_valor,
         descricao = nullif(trim(coalesce(p_descricao,'')),''), data = p_data, categoria = v_cat
   where id = p_id;
end $$;

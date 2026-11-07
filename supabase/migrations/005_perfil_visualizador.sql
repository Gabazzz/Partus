-- Perfil "só visualizar": vê o dashboard completo (como admin vê),
-- mas não lança/edita/exclui gastos nem gerencia moradores. Pensado
-- pra quem banca parte das despesas sem morar na casa (ex.: sogra).
alter table public.moradores
  add column if not exists pode_ver_tudo boolean not null default false;

drop function if exists public.listar_moradores();
create function public.listar_moradores()
returns table(id uuid, nome text, avatar text, is_admin boolean, tem_senha boolean, pode_ver_tudo boolean)
language sql
security definer
set search_path to 'public'
as $$
  select id, nome, avatar, is_admin, senha_hash is not null, pode_ver_tudo
  from public.moradores
  where ativo
  order by criado_em
$$;

create or replace function public.listar_despesas(p_morador uuid, p_token uuid, p_inicio date, p_fim date)
returns table(id uuid, morador_id uuid, morador_nome text, item text, descricao text, valor numeric, tipo text, categoria text, data date, criado_em timestamptz)
language sql
security definer
set search_path to 'public'
as $$
  select d.id, d.morador_id, m.nome, d.item, d.descricao, d.valor, d.tipo, d.categoria, d.data, d.criado_em
  from public.despesas d join public.moradores m on m.id = d.morador_id
  where not d.excluido
    and d.data >= p_inicio and d.data < p_fim
    and (
      public._admin_da_sessao(p_token) is not null
      or d.morador_id = p_morador
      or exists (select 1 from public.moradores mv where mv.id = p_morador and mv.pode_ver_tudo and mv.ativo)
    )
  order by d.data desc, d.criado_em desc
$$;

create or replace function public.historico_meses(p_morador uuid, p_token uuid, p_meses integer default 6)
returns table(mes date, total numeric)
language sql
security definer
set search_path to 'public'
as $$
  with base as (
    select date_trunc('month', (now() at time zone 'America/Sao_Paulo')::date - ((n) || ' months')::interval)::date as mes
    from generate_series(0, greatest(coalesce(p_meses,6),1) - 1) as n
  )
  select b.mes,
    coalesce((
      select sum(d.valor) from public.despesas d
      where not d.excluido
        and d.data >= b.mes and d.data < (b.mes + interval '1 month')
        and (
          public._admin_da_sessao(p_token) is not null
          or d.morador_id = p_morador
          or exists (select 1 from public.moradores mv where mv.id = p_morador and mv.pode_ver_tudo and mv.ativo)
        )
    ), 0)::numeric as total
  from base b
  order by b.mes
$$;

drop function if exists public.admin_salvar_morador(uuid, uuid, text, text, text, boolean);
create function public.admin_salvar_morador(p_token uuid, p_id uuid, p_nome text, p_avatar text default null, p_foto text default null, p_remover_foto boolean default false, p_visualizador boolean default null)
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
    insert into public.moradores (nome, avatar, is_admin, foto, pode_ver_tudo)
    values (v_nome, nullif(btrim(coalesce(p_avatar, '')), ''), false, p_foto, coalesce(p_visualizador, false))
    returning id into v_id;
    return v_id;
  end if;

  update public.moradores
     set nome   = v_nome,
         avatar = coalesce(nullif(btrim(coalesce(p_avatar, '')), ''), avatar),
         foto   = case when p_remover_foto then null else coalesce(p_foto, foto) end,
         pode_ver_tudo = coalesce(p_visualizador, pode_ver_tudo)
   where id = p_id and ativo
   returning id into v_id;

  if v_id is null then
    raise exception 'Morador não encontrado';
  end if;
  return v_id;
end $$;

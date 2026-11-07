-- Categoria simples pra despesas variáveis (fixa já é marcada via tipo)
alter table public.despesas
  add column if not exists categoria text not null default 'outros';
alter table public.despesas
  drop constraint if exists despesas_categoria_check;
alter table public.despesas
  add constraint despesas_categoria_check check (categoria in ('mercado','outros'));

-- Fechamento mensal (reconciliação com a sogra)
create table if not exists public.meses_fechados (
  mes date primary key,
  fechado_em timestamptz not null default now(),
  fechado_por uuid references public.moradores(id)
);
alter table public.meses_fechados enable row level security;

create or replace function public._mes_fechado(p_data date)
returns boolean
language sql
security definer
set search_path to 'public'
as $$
  select exists (
    select 1 from public.meses_fechados mf
    where mf.mes = date_trunc('month', p_data)::date
  )
$$;
revoke execute on function public._mes_fechado(date) from public;
revoke execute on function public._mes_fechado(date) from anon;
revoke execute on function public._mes_fechado(date) from authenticated;

create or replace function public.mes_info(p_mes date)
returns table(fechado boolean, fechado_em timestamptz)
language sql
security definer
set search_path to 'public'
as $$
  select (mf.mes is not null) as fechado, mf.fechado_em
  from (select date_trunc('month', p_mes)::date as mes) base
  left join public.meses_fechados mf on mf.mes = base.mes
$$;

create or replace function public.fechar_mes(p_token uuid, p_mes date)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare v_admin uuid;
begin
  v_admin := public._admin_da_sessao(p_token);
  if v_admin is null then raise exception 'Sem permissão'; end if;
  insert into public.meses_fechados (mes, fechado_por)
  values (date_trunc('month', p_mes)::date, v_admin)
  on conflict (mes) do nothing;
end $$;

create or replace function public.reabrir_mes(p_token uuid, p_mes date)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if public._admin_da_sessao(p_token) is null then raise exception 'Sem permissão'; end if;
  delete from public.meses_fechados where mes = date_trunc('month', p_mes)::date;
end $$;

-- Histórico de totais dos últimos N meses (respeita a mesma visibilidade de listar_despesas)
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
        and (public._admin_da_sessao(p_token) is not null or d.morador_id = p_morador)
    ), 0)::numeric as total
  from base b
  order by b.mes
$$;

-- adicionar_despesa: + categoria, bloqueia mês fechado
drop function if exists public.adicionar_despesa(uuid, text, numeric, text, date);
create function public.adicionar_despesa(p_morador uuid, p_item text, p_valor numeric, p_descricao text default null, p_data date default null, p_categoria text default 'outros')
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $$
declare v_id uuid; v_data date; v_cat text;
begin
  if not exists (select 1 from public.moradores where id = p_morador) then
    raise exception 'Morador inválido';
  end if;
  v_data := coalesce(p_data, (now() at time zone 'America/Sao_Paulo')::date);
  if public._mes_fechado(v_data) then
    raise exception 'Mês fechado. Peça para o administrador reabrir.';
  end if;
  v_cat := case when p_categoria = 'mercado' then 'mercado' else 'outros' end;
  insert into public.despesas (morador_id, item, descricao, valor, data, categoria)
  values (p_morador, trim(p_item), nullif(trim(coalesce(p_descricao,'')),''), p_valor, v_data, v_cat)
  returning id into v_id;
  return v_id;
end $$;

-- editar_despesa: + categoria, bloqueia mês fechado (origem ou destino)
drop function if exists public.editar_despesa(uuid, uuid, text, numeric, text, date);
create function public.editar_despesa(p_token uuid, p_id uuid, p_item text, p_valor numeric, p_descricao text, p_data date, p_categoria text default null)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare v_atual public.despesas; v_cat text;
begin
  if public._admin_da_sessao(p_token) is null then raise exception 'Sem permissão'; end if;
  select * into v_atual from public.despesas where id = p_id;
  if not found then raise exception 'Gasto não encontrado'; end if;
  if public._mes_fechado(v_atual.data) or public._mes_fechado(p_data) then
    raise exception 'Mês fechado. Peça para o administrador reabrir.';
  end if;
  v_cat := case when p_categoria is null then v_atual.categoria when p_categoria = 'mercado' then 'mercado' else 'outros' end;
  update public.despesas
     set item = trim(p_item), valor = p_valor,
         descricao = nullif(trim(coalesce(p_descricao,'')),''), data = p_data, categoria = v_cat
   where id = p_id;
end $$;

-- excluir_despesa: bloqueia mês fechado
create or replace function public.excluir_despesa(p_token uuid, p_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare v_data date;
begin
  if public._admin_da_sessao(p_token) is null then raise exception 'Sem permissão'; end if;
  select data into v_data from public.despesas where id = p_id;
  if v_data is null then raise exception 'Gasto não encontrado'; end if;
  if public._mes_fechado(v_data) then raise exception 'Mês fechado. Peça para o administrador reabrir.'; end if;
  update public.despesas set excluido = true where id = p_id;
end $$;

-- gerar_fixas_mes: bloqueia mês fechado
create or replace function public.gerar_fixas_mes(p_token uuid, p_mes date)
returns integer
language plpgsql
security definer
set search_path to 'public'
as $$
declare v_admin uuid; v_inicio date := date_trunc('month', p_mes)::date; v_qtd integer;
begin
  v_admin := public._admin_da_sessao(p_token);
  if v_admin is null then raise exception 'Sem permissão'; end if;
  if public._mes_fechado(v_inicio) then raise exception 'Mês fechado. Peça para o administrador reabrir.'; end if;
  insert into public.despesas (morador_id, item, valor, tipo, data, categoria)
  select v_admin, f.item, f.valor, 'fixa', v_inicio, 'outros'
  from public.fixas f
  where not exists (
    select 1 from public.despesas d
    where d.tipo = 'fixa' and d.item = f.item and not d.excluido
      and d.data >= v_inicio and d.data < (v_inicio + interval '1 month')
  );
  get diagnostics v_qtd = row_count;
  return v_qtd;
end $$;

-- listar_despesas: + categoria
drop function if exists public.listar_despesas(uuid, uuid, date, date);
create function public.listar_despesas(p_morador uuid, p_token uuid, p_inicio date, p_fim date)
returns table(id uuid, morador_id uuid, morador_nome text, item text, descricao text, valor numeric, tipo text, categoria text, data date, criado_em timestamptz)
language sql
security definer
set search_path to 'public'
as $$
  select d.id, d.morador_id, m.nome, d.item, d.descricao, d.valor, d.tipo, d.categoria, d.data, d.criado_em
  from public.despesas d join public.moradores m on m.id = d.morador_id
  where not d.excluido
    and d.data >= p_inicio and d.data < p_fim
    and (public._admin_da_sessao(p_token) is not null or d.morador_id = p_morador)
  order by d.data desc, d.criado_em desc
$$;

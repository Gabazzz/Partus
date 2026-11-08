-- Unifica as categorias do Partus com as do Previo (app pessoal de finanças),
-- para a integração entre os dois apps: um gasto lançado em qualquer um dos
-- dois já chega no outro com a categoria certa, sem precisar mapear.

alter table public.despesas drop constraint if exists despesas_categoria_check;

update public.despesas set categoria = 'Alimentação' where categoria = 'mercado';
update public.despesas set categoria = 'Outros' where categoria = 'outros';

alter table public.despesas
  add constraint despesas_categoria_check
  check (categoria in ('Alimentação', 'Transporte', 'Moradia', 'Saúde', 'Lazer', 'Outros'));

alter table public.despesas alter column categoria set default 'Outros';

-- adicionar_despesa: aceita qualquer categoria da lista unificada (antes só mercado/outros)
drop function if exists public.adicionar_despesa(uuid, text, numeric, text, date, text);
create function public.adicionar_despesa(p_morador uuid, p_item text, p_valor numeric, p_descricao text default null, p_data date default null, p_categoria text default 'Outros')
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
  v_cat := case when p_categoria in ('Alimentação', 'Transporte', 'Moradia', 'Saúde', 'Lazer', 'Outros') then p_categoria else 'Outros' end;
  insert into public.despesas (morador_id, item, descricao, valor, data, categoria)
  values (p_morador, trim(p_item), nullif(trim(coalesce(p_descricao,'')),''), p_valor, v_data, v_cat)
  returning id into v_id;
  return v_id;
end $$;

-- editar_despesa: mesma lista de categorias unificada
drop function if exists public.editar_despesa(uuid, uuid, text, numeric, text, date, text);
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

-- gerar_fixas_mes: categoria padrão agora é 'Outros' (antes 'outros')
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
  select v_admin, f.item, f.valor, 'fixa', v_inicio, 'Outros'
  from public.fixas f
  where not exists (
    select 1 from public.despesas d
    where d.tipo = 'fixa' and d.item = f.item and not d.excluido
      and d.data >= v_inicio and d.data < (v_inicio + interval '1 month')
  );
  get diagnostics v_qtd = row_count;
  return v_qtd;
end $$;

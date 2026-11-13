-- Toggle "Pago com Caju": qualquer morador pode lançar um gasto marcando
-- que ele saiu do cartão Caju do admin (só ele tem Caju). Quando marcado,
-- o gasto passa a contar financeiramente como do admin (entra nas contas
-- dele — ninguém deve nada a ele por isso, e a sogra não entra), mesmo
-- que quem digitou o lançamento tenha sido outro morador.

alter table public.despesas
  add column if not exists pago_caju boolean not null default false;

drop function if exists public.listar_despesas(uuid, uuid, date, date);
create function public.listar_despesas(p_morador uuid, p_token uuid, p_inicio date, p_fim date)
returns table(id uuid, morador_id uuid, morador_nome text, item text, descricao text, valor numeric, tipo text, categoria text, data date, criado_em timestamptz, pago_caju boolean)
language sql
security definer
set search_path to 'public'
as $$
  select d.id, d.morador_id, m.nome, d.item, d.descricao, d.valor, d.tipo, d.categoria, d.data, d.criado_em, d.pago_caju
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

drop function if exists public.adicionar_despesa(uuid, text, numeric, text, date, text);
create function public.adicionar_despesa(p_morador uuid, p_item text, p_valor numeric, p_descricao text default null, p_data date default null, p_categoria text default 'Outros', p_caju boolean default false)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $$
declare v_id uuid; v_data date; v_cat text; v_morador uuid; v_admin_id uuid;
begin
  if not exists (select 1 from public.moradores where id = p_morador) then
    raise exception 'Morador inválido';
  end if;
  v_data := coalesce(p_data, (now() at time zone 'America/Sao_Paulo')::date);
  if public._mes_fechado(v_data) then
    raise exception 'Mês fechado. Peça para o administrador reabrir.';
  end if;
  v_cat := case when p_categoria in ('Alimentação', 'Transporte', 'Moradia', 'Saúde', 'Lazer', 'Outros') then p_categoria else 'Outros' end;

  v_morador := p_morador;
  if p_caju then
    select id into v_admin_id from public.moradores where is_admin and ativo limit 1;
    if v_admin_id is not null then v_morador := v_admin_id; end if;
  end if;

  insert into public.despesas (morador_id, item, descricao, valor, data, categoria, pago_caju)
  values (v_morador, trim(p_item), nullif(trim(coalesce(p_descricao,'')),''), p_valor, v_data, v_cat, coalesce(p_caju, false))
  returning id into v_id;
  return v_id;
end $$;

drop function if exists public.editar_despesa(uuid, uuid, uuid, text, numeric, text, date, text);
create function public.editar_despesa(p_token uuid, p_morador uuid, p_id uuid, p_item text, p_valor numeric, p_descricao text, p_data date, p_categoria text default null, p_caju boolean default null)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare v_atual public.despesas; v_cat text; v_admin uuid; v_novo_morador uuid; v_admin_id uuid;
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

  v_novo_morador := v_atual.morador_id;
  if p_caju is not null then
    if p_caju then
      select id into v_admin_id from public.moradores where is_admin and ativo limit 1;
      if v_admin_id is not null then v_novo_morador := v_admin_id; end if;
    else
      v_novo_morador := coalesce(p_morador, v_atual.morador_id);
    end if;
  end if;

  update public.despesas
     set item = trim(p_item), valor = p_valor,
         descricao = nullif(trim(coalesce(p_descricao,'')),''), data = p_data, categoria = v_cat,
         pago_caju = coalesce(p_caju, v_atual.pago_caju),
         morador_id = v_novo_morador
   where id = p_id;
end $$;

-- =====================================================================
-- Partus · migração 003
--   "Esqueci minha senha" do admin: código de 6 dígitos enviado por
--   e-mail (via Edge Function recuperar-senha), válido por 15 minutos.
-- =====================================================================

create table if not exists public.partus_recuperacao (
  id bigserial primary key,
  morador uuid not null references public.moradores(id) on delete cascade,
  codigo_hash text not null,
  criado_em timestamptz not null default now(),
  expira_em timestamptz not null,
  tentativas int not null default 0,
  usado boolean not null default false
);
alter table public.partus_recuperacao enable row level security;
revoke all on public.partus_recuperacao from anon, authenticated;

-- Chamada só pela Edge Function (service_role): registra o hash do código.
create or replace function public.partus_criar_recuperacao(p_morador uuid, p_hash text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.moradores where id = p_morador and is_admin) then
    raise exception 'Perfil inválido';
  end if;
  if exists (select 1 from public.partus_recuperacao where morador = p_morador and criado_em > now() - interval '60 seconds') then
    raise exception 'Aguarde um minuto para pedir outro código';
  end if;
  if (select count(*) from public.partus_recuperacao where morador = p_morador and criado_em > now() - interval '1 hour') >= 5 then
    raise exception 'Muitos pedidos de código. Tente novamente mais tarde';
  end if;
  update public.partus_recuperacao set usado = true where morador = p_morador and not usado;
  insert into public.partus_recuperacao (morador, codigo_hash, expira_em)
  values (p_morador, p_hash, now() + interval '15 minutes');
end $$;
revoke all on function public.partus_criar_recuperacao(uuid, text) from public, anon, authenticated;
grant execute on function public.partus_criar_recuperacao(uuid, text) to service_role;

-- Retorna 'ok' | 'incorreto' | 'expirado' | 'bloqueado'.
create or replace function public.redefinir_senha_admin(p_morador uuid, p_codigo text, p_senha text)
returns text language plpgsql security definer set search_path = public, extensions as $$
declare r public.partus_recuperacao; v_hash text;
begin
  if char_length(coalesce(p_senha, '')) < 6 then
    raise exception 'A senha deve ter no mínimo 6 caracteres';
  end if;
  select * into r from public.partus_recuperacao
   where morador = p_morador and not usado
   order by criado_em desc limit 1 for update;
  if not found or r.expira_em < now() then return 'expirado'; end if;
  if r.tentativas >= 5 then
    update public.partus_recuperacao set usado = true where id = r.id; return 'bloqueado';
  end if;
  update public.partus_recuperacao set tentativas = tentativas + 1 where id = r.id;
  v_hash := encode(digest(coalesce(p_codigo, '') || ':' || p_morador::text, 'sha256'), 'hex');
  if v_hash <> r.codigo_hash then return 'incorreto'; end if;
  update public.partus_recuperacao set usado = true where id = r.id;
  update public.moradores set senha_hash = crypt(p_senha, gen_salt('bf')) where id = p_morador and is_admin;
  return 'ok';
end $$;
grant execute on function public.redefinir_senha_admin(uuid, text, text) to anon, authenticated;

-- Para o código por e-mail realmente ser enviado, defina o segredo da Edge Function:
--   supabase secrets set RESEND_API_KEY=re_xxx --project-ref jemxtvmfdorosedwtjsx
-- Sem isso, o pedido de código falha com uma mensagem clara (não quebra o app).

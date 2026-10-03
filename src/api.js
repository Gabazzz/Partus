import { createClient } from '@supabase/supabase-js'

export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
)

async function rpc(fn, args) {
  const { data, error } = await supabase.rpc(fn, args)
  if (error) throw new Error(error.message)
  return data
}

export const api = {
  moradores: () => rpc('listar_moradores'),
  definirSenha: (morador, senha) => rpc('definir_senha_admin', { p_morador: morador, p_senha: senha }),
  entrarAdmin: (morador, senha) => rpc('entrar_admin', { p_morador: morador, p_senha: senha }),
  despesas: (morador, token, inicio, fim) =>
    rpc('listar_despesas', { p_morador: morador, p_token: token, p_inicio: inicio, p_fim: fim }),
  adicionar: (morador, item, valor, descricao, data) =>
    rpc('adicionar_despesa', { p_morador: morador, p_item: item, p_valor: valor, p_descricao: descricao || null, p_data: data || null }),
  editar: (token, id, item, valor, descricao, data) =>
    rpc('editar_despesa', { p_token: token, p_id: id, p_item: item, p_valor: valor, p_descricao: descricao || '', p_data: data }),
  excluir: (token, id) => rpc('excluir_despesa', { p_token: token, p_id: id }),
  gerarFixas: (token, mes) => rpc('gerar_fixas_mes', { p_token: token, p_mes: mes }),
}

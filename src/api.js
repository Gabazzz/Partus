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
  // Fotos vêm de uma função separada; se a migração ainda não rodou, o app segue sem fotos.
  fotos: async () => {
    try { return (await rpc('listar_fotos')) || [] } catch { return [] }
  },
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

  // Gestão de moradores (somente admin)
  salvarMorador: (token, { id, nome, avatar, foto, removerFoto }) =>
    rpc('admin_salvar_morador', {
      p_token: token,
      p_id: id ? String(id) : null,
      p_nome: nome,
      p_avatar: avatar || null,
      p_foto: foto || null,
      p_remover_foto: !!removerFoto,
    }),
  excluirMorador: (token, id) => rpc('admin_excluir_morador', { p_token: token, p_id: String(id) }),

  // Esqueci minha senha: o e-mail de destino é fixo no servidor.
  solicitarRecuperacao: async (morador) => {
    const { data, error } = await supabase.functions.invoke('recuperar-senha', { body: { morador: String(morador) } })
    if (error) {
      let msg = 'Não foi possível enviar o código agora'
      try { const j = await error.context.json(); if (j?.erro) msg = j.erro } catch {}
      throw new Error(msg)
    }
    return data
  },
  redefinirSenha: async (morador, codigo, senha) => {
    const r = await rpc('redefinir_senha_admin', { p_morador: String(morador), p_codigo: codigo, p_senha: senha })
    if (r === 'ok') return true
    const msgs = {
      incorreto: 'Código incorreto',
      expirado: 'Código expirado. Peça um novo',
      bloqueado: 'Muitas tentativas. Peça um novo código',
    }
    throw new Error(msgs[r] || 'Não foi possível redefinir a senha')
  },
}

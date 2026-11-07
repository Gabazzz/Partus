// Fila de lançamentos feitos sem conexão: fica guardada no aparelho e é
// enviada pro Supabase assim que a internet volta.
const CHAVE = 'partus_fila_offline'

function lerFila() {
  try { return JSON.parse(localStorage.getItem(CHAVE) || '[]') } catch { return [] }
}
function gravarFila(fila) {
  try { localStorage.setItem(CHAVE, JSON.stringify(fila)) } catch {}
}

export function pareceSemConexao(msg) {
  return /failed to fetch|network|conex|offline|internet/i.test(msg || '')
}

export const filaOffline = {
  listar: lerFila,
  tamanho: () => lerFila().length,

  adicionar(item) {
    const fila = lerFila()
    fila.push({ ...item, _id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}` })
    gravarFila(fila)
  },

  // Tenta enviar tudo que está na fila. Itens com erro de conexão voltam pra
  // fila; itens com erro de verdade (ex.: mês fechado) são descartados e
  // relatados, pra não ficarem tentando pra sempre.
  async sincronizar(api) {
    const fila = lerFila()
    if (!fila.length) return { enviados: 0, falharam: [], restantes: 0 }
    const restantes = []
    const falharam = []
    let enviados = 0
    for (const item of fila) {
      try {
        await api.adicionar(item.morador, item.item, item.valor, item.descricao, item.data, item.categoria)
        enviados++
      } catch (e) {
        if (pareceSemConexao(e.message)) restantes.push(item)
        else falharam.push({ item, erro: e.message })
      }
    }
    gravarFila(restantes)
    return { enviados, falharam, restantes: restantes.length }
  },
}

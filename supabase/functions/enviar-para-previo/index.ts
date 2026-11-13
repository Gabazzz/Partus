// Edge Function · enviar-para-previo
// Ponte entre o Partus (despesas da casa) e o Previo (finanças pessoais):
// quando um gasto é lançado aqui e marcado "Também lançar no Previo" (ou
// "Pago com Caju", que sempre envia), esta função grava uma transação
// equivalente lá, com o valor CHEIO do gasto (a parte da sogra volta depois
// por Pix, então o valor integral é o que realmente saiu do bolso até lá).
// `va` marca a transação como paga com o cartão Caju (vale-alimentação).
//
// Só funciona para o morador "ponte" abaixo — os demais moradores da casa
// não têm conta no Previo, então enviar os gastos deles não faria sentido.
//
// Deploy:
//   supabase secrets set PREVIO_SERVICE_ROLE_KEY=eyJ...   (service_role key do projeto Previo)
//   supabase functions deploy enviar-para-previo
import { createClient } from 'npm:@supabase/supabase-js@2'

const PREVIO_URL = 'https://grjovgjhnmglvtclpwvs.supabase.co'
const PREVIO_USER_ID = '368140f6-a5b1-4e9a-96d1-2da7a385fe1e'
const MORADOR_PONTE = '690f1324-a416-46fc-ae09-97519abaf55e' // Bitencourt

const CATEGORIAS_VALIDAS = ['Alimentação', 'Transporte', 'Moradia', 'Saúde', 'Lazer', 'Outros']

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ erro: 'Método não permitido' }, 405)

  try {
    const { morador_id, valor, item, descricao, data, categoria, va } = await req.json()

    if (String(morador_id) !== MORADOR_PONTE) {
      return json({ erro: 'Integração com o Previo não disponível para este perfil' }, 403)
    }
    const valorNum = Number(valor)
    if (!(valorNum > 0)) return json({ erro: 'Valor inválido' }, 400)

    const cat = CATEGORIAS_VALIDAS.includes(categoria) ? categoria : 'Outros'
    const desc = (descricao && String(descricao).trim()) || (item && String(item).trim()) || cat

    const previo = createClient(PREVIO_URL, Deno.env.get('PREVIO_SERVICE_ROLE_KEY')!)

    const { error } = await previo.from('transactions').insert({
      user_id: PREVIO_USER_ID,
      date: data || new Date().toISOString().slice(0, 10),
      type: 'saída',
      category: cat,
      description: desc.slice(0, 120),
      value: valorNum,
      recurring: false,
      va: !!va,
    })
    if (error) return json({ erro: error.message }, 400)

    return json({ ok: true })
  } catch (e) {
    console.error(e)
    return json({ erro: 'Erro inesperado' }, 500)
  }
})

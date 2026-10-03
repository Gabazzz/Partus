// Edge Function · recuperar-senha
// Gera um código de 6 dígitos, guarda apenas o hash no banco e envia o código
// SEMPRE para o e-mail fixo abaixo (o app nunca escolhe o destinatário).
//
// Deploy:
//   supabase secrets set RESEND_API_KEY=re_xxx
//   supabase functions deploy recuperar-senha
import { createClient } from 'npm:@supabase/supabase-js@2'

const EMAIL_DESTINO = 'gabrielbtten@gmail.com'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

const mascarar = (email: string) => {
  const [u, d] = email.split('@')
  return `${u[0]}${'•'.repeat(Math.max(u.length - 1, 3))}@${d}`
}

async function sha256Hex(texto: string) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(texto))
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ erro: 'Método não permitido' }, 405)

  try {
    const { morador } = await req.json()
    if (!morador) return json({ erro: 'Perfil inválido' }, 400)

    const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

    const codigo = String(crypto.getRandomValues(new Uint32Array(1))[0] % 1_000_000).padStart(6, '0')
    const hash = await sha256Hex(`${codigo}:${morador}`)

    const { error } = await sb.rpc('partus_criar_recuperacao', { p_morador: String(morador), p_hash: hash })
    if (error) return json({ erro: error.message }, 400)

    const html = `
      <div style="font-family:Inter,Arial,sans-serif;background:#0b0b10;padding:32px;color:#f4f4f7">
        <div style="max-width:420px;margin:0 auto;background:#14141c;border:1px solid #2a2a36;border-radius:20px;padding:32px;text-align:center">
          <div style="font-size:13px;letter-spacing:.2em;text-transform:uppercase;color:#d4af5a">Partus</div>
          <h1 style="font-size:20px;margin:12px 0 4px">Recuperação de senha</h1>
          <p style="color:#9a9aac;font-size:14px;margin:0 0 24px">Use o código abaixo para criar uma nova senha de administrador.</p>
          <div style="font-size:38px;font-weight:700;letter-spacing:.35em;padding:16px 0 16px .35em;background:#0b0b10;border-radius:14px;color:#f5d98b">${codigo}</div>
          <p style="color:#6e6e80;font-size:12px;margin:24px 0 0">O código vale por 15 minutos. Se não foi você, ignore este e-mail.</p>
        </div>
      </div>`

    const resp = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${Deno.env.get('RESEND_API_KEY')}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'Partus <onboarding@resend.dev>',
        to: [EMAIL_DESTINO],
        subject: `Seu código Partus: ${codigo}`,
        html,
      }),
    })
    if (!resp.ok) {
      console.error('Resend:', resp.status, await resp.text())
      return json({ erro: 'Não foi possível enviar o e-mail agora. Tente novamente' }, 502)
    }

    return json({ ok: true, email: mascarar(EMAIL_DESTINO) })
  } catch (e) {
    console.error(e)
    return json({ erro: 'Erro inesperado' }, 500)
  }
})

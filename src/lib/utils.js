export const store = {
  get(k) { try { return localStorage.getItem(k) } catch { return null } },
  set(k, v) { try { localStorage.setItem(k, v) } catch {} },
  del(k) { try { localStorage.removeItem(k) } catch {} },
}

export const pad = (n) => String(n).padStart(2, '0')
export const monthStart = (y, m) => `${y}-${pad(m + 1)}-01`

export const parseValor = (s) => {
  const n = Number(String(s).replace(/\./g, '').replace(',', '.'))
  return Number.isFinite(n) ? n : NaN
}

export const fmtDia = (iso) => {
  const [, m, d] = iso.split('-')
  return `${d}/${m}`
}

export const hojeISO = () => {
  const d = new Date()
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export const brl = (n) => Number(n || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

// Mensagem pronta pra mandar pra quem paga a outra parte da casa.
export const mensagemCobranca = ({ nomeMes, total, parte }) =>
  `Oi! Segue o resumo de ${nomeMes}:\n\n` +
  `Total da casa: ${brl(total)}\n` +
  `Sua parte (2/3): ${brl(parte)}\n\n` +
  `Qualquer dúvida nos valores, me chama! 🙂`

// Copia texto pro clipboard, com fallback pra navegadores/contexto sem permissão.
export async function copiarTexto(texto) {
  try {
    await navigator.clipboard.writeText(texto)
    return true
  } catch {
    try {
      const el = document.createElement('textarea')
      el.value = texto
      el.style.position = 'fixed'
      el.style.opacity = '0'
      document.body.appendChild(el)
      el.focus(); el.select()
      const ok = document.execCommand('copy')
      document.body.removeChild(el)
      return ok
    } catch {
      return false
    }
  }
}

// Número no padrão pt-BR com 2 casas, separado em parte inteira e centavos.
export const partesMoeda = (n) => {
  const s = Number(n || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  const i = s.lastIndexOf(',')
  return { inteiro: s.slice(0, i), centavos: s.slice(i) }
}

// Recorta a foto no centro (quadrada), reduz e devolve um data URL JPEG leve.
export function fotoParaDataURL(file, size = 320) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      const lado = Math.min(img.width, img.height)
      const sx = (img.width - lado) / 2
      const sy = (img.height - lado) / 2
      const canvas = document.createElement('canvas')
      canvas.width = canvas.height = size
      canvas.getContext('2d').drawImage(img, sx, sy, lado, lado, 0, 0, size, size)
      URL.revokeObjectURL(url)
      resolve(canvas.toDataURL('image/jpeg', 0.82))
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('Não foi possível ler essa imagem'))
    }
    img.src = url
  })
}

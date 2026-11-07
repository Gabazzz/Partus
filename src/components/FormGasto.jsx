import { useState } from 'react'
import { motion } from 'framer-motion'
import { hojeISO } from '../lib/utils.js'
import { Btn, CampoValor, Sheet } from './ui.jsx'

const CATEGORIAS = [
  { v: 'mercado', label: 'Mercado', ico: '🛒' },
  { v: 'outros', label: 'Outros', ico: '🏷️' },
]

export default function FormGasto({ titulo, inicial, comData, sugestoes = [], onFechar, onSalvar, onExcluir }) {
  const [centavos, setCentavos] = useState(inicial ? Math.round(Number(inicial.valor) * 100) : 0)
  const [item, setItem] = useState(inicial?.item || '')
  const [descricao, setDescricao] = useState(inicial?.descricao || '')
  const [data, setData] = useState(inicial?.data || hojeISO())
  const [categoria, setCategoria] = useState(inicial?.categoria === 'mercado' ? 'mercado' : 'outros')
  const [erro, setErro] = useState('')
  const [busy, setBusy] = useState(false)
  const [confirmando, setConfirmando] = useState(false)

  async function enviar(e) {
    e.preventDefault()
    if (!(centavos > 0)) return setErro('Informe um valor maior que zero')
    if (!item.trim()) return setErro('Informe o item')
    setBusy(true); setErro('')
    try { await onSalvar({ valor: centavos / 100, item, descricao, data, categoria }) }
    catch (err) { setErro(err.message); setBusy(false) }
  }

  function excluir() {
    if (!confirmando) { setConfirmando(true); setTimeout(() => setConfirmando(false), 3500); return }
    onExcluir()
  }

  return (
    <Sheet onClose={onFechar} label={titulo}>
      <form className="stack-lg" onSubmit={enviar}>
        <h3>{titulo}</h3>
        <div className="field">
          <label>Valor</label>
          <CampoValor centavos={centavos} onChange={setCentavos} autoFocus atalhos={[50, 100]} />
        </div>
        {inicial?.tipo !== 'fixa' && (
          <div className="field">
            <label>Categoria</label>
            <div className="chip-row" role="group" aria-label="Categoria">
              {CATEGORIAS.map((c) => (
                <motion.button
                  key={c.v} type="button" whileTap={{ scale: 0.93 }}
                  className={`chip ${categoria === c.v ? 'gold' : ''}`}
                  onClick={() => setCategoria(c.v)}
                >{c.ico} {c.label}</motion.button>
              ))}
            </div>
          </div>
        )}
        <div className="field">
          <label>Item</label>
          {!inicial && sugestoes.length > 0 && (
            <div className="chip-row" role="group" aria-label="Itens frequentes">
              {sugestoes.map((s) => {
                const ativo = item.trim().toLowerCase() === s.toLowerCase()
                return (
                  <motion.button
                    key={s} type="button" whileTap={{ scale: 0.93 }}
                    className={`chip ${ativo ? 'gold' : ''}`}
                    onClick={() => setItem(s)}
                  >{s}</motion.button>
                )
              })}
            </div>
          )}
          <input placeholder="Ex.: Mercado, Feira, Gás" value={item} onChange={(e) => setItem(e.target.value)} />
        </div>
        <div className="field">
          <label>Descrição (opcional)</label>
          <input value={descricao} onChange={(e) => setDescricao(e.target.value)} />
        </div>
        {comData && (
          <div className="field">
            <label>Data</label>
            <input type="date" value={data} onChange={(e) => setData(e.target.value)} />
          </div>
        )}
        {erro && <motion.p className="err" initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }}>{erro}</motion.p>}
        <Btn disabled={busy}>{busy ? 'Salvando…' : 'Salvar'}</Btn>
        {onExcluir && (
          <Btn type="button" variant={`danger ${confirmando ? 'armed' : ''}`} onClick={excluir}>
            {confirmando ? 'Toque de novo para confirmar' : 'Excluir'}
          </Btn>
        )}
        <Btn type="button" variant="sec" onClick={onFechar}>Cancelar</Btn>
      </form>
    </Sheet>
  )
}

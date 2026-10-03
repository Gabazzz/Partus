import { useState } from 'react'
import { motion } from 'framer-motion'
import { parseValor, hojeISO } from '../lib/utils.js'
import { Btn, Sheet } from './ui.jsx'

export default function FormGasto({ titulo, inicial, comData, onFechar, onSalvar, onExcluir }) {
  const [valor, setValor] = useState(inicial ? String(inicial.valor).replace('.', ',') : '')
  const [item, setItem] = useState(inicial?.item || '')
  const [descricao, setDescricao] = useState(inicial?.descricao || '')
  const [data, setData] = useState(inicial?.data || hojeISO())
  const [erro, setErro] = useState('')
  const [busy, setBusy] = useState(false)
  const [confirmando, setConfirmando] = useState(false)

  async function enviar(e) {
    e.preventDefault()
    const v = parseValor(valor)
    if (!(v > 0)) return setErro('Informe um valor maior que zero')
    if (!item.trim()) return setErro('Informe o item')
    setBusy(true); setErro('')
    try { await onSalvar({ valor: v, item, descricao, data }) }
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
          <div className="money-field">
            <span>R$</span>
            <input className="money" inputMode="decimal" placeholder="0,00" autoFocus value={valor} onChange={(e) => setValor(e.target.value)} />
          </div>
        </div>
        <div className="field">
          <label>Item</label>
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

import { useState } from 'react'
import { motion } from 'framer-motion'
import { hojeISO } from '../lib/utils.js'
import { Btn, CampoValor, Sheet } from './ui.jsx'

export default function FormGasto({ titulo, inicial, comData, onFechar, onSalvar, onExcluir }) {
  const [centavos, setCentavos] = useState(inicial ? Math.round(Number(inicial.valor) * 100) : 0)
  const [item, setItem] = useState(inicial?.item || '')
  const [descricao, setDescricao] = useState(inicial?.descricao || '')
  const [data, setData] = useState(inicial?.data || hojeISO())
  const [erro, setErro] = useState('')
  const [busy, setBusy] = useState(false)
  const [confirmando, setConfirmando] = useState(false)

  async function enviar(e) {
    e.preventDefault()
    if (!(centavos > 0)) return setErro('Informe um valor maior que zero')
    if (!item.trim()) return setErro('Informe o item')
    setBusy(true); setErro('')
    try { await onSalvar({ valor: centavos / 100, item, descricao, data }) }
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
          <CampoValor centavos={centavos} onChange={setCentavos} autoFocus />
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

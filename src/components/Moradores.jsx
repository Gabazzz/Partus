import { useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { api } from '../api.js'
import { fotoParaDataURL } from '../lib/utils.js'
import { Avatar, Btn, Sheet, ease } from './ui.jsx'

const EMOJIS = ['😀', '😎', '🤓', '🥳', '🦊', '🐱', '🐶', '🌿', '⭐', '🔥', '🎧', '🍀']

function Editor({ morador, token, onVoltar, onSalvo, onExpirou }) {
  const novo = !morador
  const inputFoto = useRef(null)
  const [nome, setNome] = useState(morador?.nome || '')
  const [avatar, setAvatar] = useState(morador?.avatar || '')
  const [foto, setFoto] = useState(null)            // nova foto (data URL) escolhida agora
  const [removerFoto, setRemoverFoto] = useState(false)
  const [confirmando, setConfirmando] = useState(false)
  const [erro, setErro] = useState('')
  const [busy, setBusy] = useState(false)

  const fotoAtual = removerFoto ? null : (foto || morador?.foto || null)
  const previa = { nome: nome || '?', avatar, foto: fotoAtual }
  const podeExcluir = !novo && !morador.is_admin

  async function escolherFoto(e) {
    const arquivo = e.target.files?.[0]
    e.target.value = ''
    if (!arquivo) return
    try {
      setFoto(await fotoParaDataURL(arquivo)); setRemoverFoto(false); setErro('')
    } catch (err) { setErro(err.message) }
  }

  function tratar(err) {
    if (err.message.includes('Sem permissão')) return onExpirou()
    setErro(err.message); setBusy(false); setConfirmando(false)
  }

  async function salvar(e) {
    e.preventDefault()
    if (!nome.trim()) return setErro('Informe o nome')
    setBusy(true); setErro('')
    try {
      await api.salvarMorador(token, { id: morador?.id, nome: nome.trim(), avatar, foto, removerFoto })
      await onSalvo(novo ? 'Morador criado' : 'Morador atualizado')
    } catch (err) { tratar(err) }
  }

  async function excluir() {
    if (!confirmando) { setConfirmando(true); setTimeout(() => setConfirmando(false), 3500); return }
    setBusy(true)
    try {
      await api.excluirMorador(token, morador.id)
      await onSalvo('Morador excluído')
    } catch (err) { tratar(err) }
  }

  return (
    <motion.form
      key="editor" onSubmit={salvar} className="editor"
      initial={{ opacity: 0, x: 28 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 28 }}
      transition={{ duration: 0.35, ease }}
    >
      <div className="sheet-head">
        <button type="button" className="ghost back" onClick={onVoltar}>‹ Voltar</button>
        <h3>{novo ? 'Novo morador' : 'Editar morador'}</h3>
      </div>

      <div className="photo-pick">
        <motion.button type="button" className="photo-btn" whileTap={{ scale: 0.95 }} onClick={() => inputFoto.current?.click()} aria-label="Escolher foto">
          <Avatar m={previa} size={116} ring />
          <span className="photo-badge">📷</span>
        </motion.button>
        <input ref={inputFoto} type="file" accept="image/*" hidden onChange={escolherFoto} />
        <div className="photo-actions">
          <button type="button" className="chip" onClick={() => inputFoto.current?.click()}>{fotoAtual ? 'Trocar foto' : 'Adicionar foto'}</button>
          {fotoAtual && <button type="button" className="chip subtle" onClick={() => { setFoto(null); setRemoverFoto(true) }}>Remover</button>}
        </div>
      </div>

      <div className="field">
        <label>Nome</label>
        <input value={nome} maxLength={40} placeholder="Como aparece no perfil" onChange={(e) => setNome(e.target.value)} />
      </div>

      <div className="field">
        <label>Emoji (aparece quando não há foto)</label>
        <div className="emoji-row">
          {EMOJIS.map((em) => (
            <button type="button" key={em} className={`emoji ${avatar === em ? 'on' : ''}`} onClick={() => setAvatar(em)}>{em}</button>
          ))}
        </div>
      </div>

      {erro && <p className="err">{erro}</p>}
      <Btn disabled={busy}>{busy ? 'Salvando…' : 'Salvar'}</Btn>
      {podeExcluir && (
        <Btn type="button" variant={`danger ${confirmando ? 'armed' : ''}`} disabled={busy} onClick={excluir}>
          {confirmando ? 'Toque de novo para confirmar' : 'Excluir morador'}
        </Btn>
      )}
    </motion.form>
  )
}

export default function Moradores({ moradores, token, onFechar, onMudou, onExpirou, avisar }) {
  const [editando, setEditando] = useState(undefined) // undefined = lista | null = novo | morador

  async function aoSalvar(msg) {
    await onMudou()
    avisar(msg)
    setEditando(undefined)
  }

  return (
    <Sheet onClose={onFechar} label="Moradores">
      <AnimatePresence mode="wait" initial={false}>
        {editando === undefined ? (
          <motion.div
            key="lista" className="stack-lg"
            initial={{ opacity: 0, x: -28 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -28 }}
            transition={{ duration: 0.35, ease }}
          >
            <div className="sheet-head">
              <h3>Moradores</h3>
              <button type="button" className="chip gold" onClick={() => setEditando(null)}>+ Novo</button>
            </div>
            <div className="people">
              {moradores.map((m, i) => (
                <motion.button
                  key={m.id} type="button" className="person"
                  initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.4, ease, delay: i * 0.05 }}
                  whileHover={{ x: 3 }} whileTap={{ scale: 0.98 }}
                  onClick={() => setEditando(m)}
                >
                  <Avatar m={m} size={48} />
                  <div className="info">
                    <b>{m.nome}</b>
                    <small>{m.is_admin ? 'Administrador' : 'Morador'}</small>
                  </div>
                  <span className="chev">›</span>
                </motion.button>
              ))}
            </div>
            <Btn type="button" variant="sec" onClick={onFechar}>Fechar</Btn>
          </motion.div>
        ) : (
          <Editor
            key={editando?.id ?? 'novo'}
            morador={editando}
            token={token}
            onVoltar={() => setEditando(undefined)}
            onSalvo={aoSalvar}
            onExpirou={onExpirou}
          />
        )}
      </AnimatePresence>
    </Sheet>
  )
}

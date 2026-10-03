import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { api } from '../api.js'
import { Avatar, Btn, fadeUp } from './ui.jsx'

function Cabecalho({ morador }) {
  return (
    <motion.div className="auth-head" variants={fadeUp} custom={0}>
      <Avatar m={morador} size={92} ring />
      <strong>{morador.nome}</strong>
    </motion.div>
  )
}

export function SenhaAdmin({ morador, onVoltar, onOk, onEsqueci }) {
  const criar = !morador.tem_senha
  const [senha, setSenha] = useState('')
  const [conf, setConf] = useState('')
  const [erro, setErro] = useState('')
  const [busy, setBusy] = useState(false)

  async function enviar(e) {
    e.preventDefault()
    setErro('')
    if (criar && senha !== conf) return setErro('As senhas não conferem')
    setBusy(true)
    try {
      if (criar) await api.definirSenha(morador.id, senha)
      onOk(await api.entrarAdmin(morador.id, senha))
    } catch (err) {
      setErro(err.message.includes('incorreta') ? 'Senha incorreta' : err.message)
    } finally { setBusy(false) }
  }

  return (
    <motion.form className="center" onSubmit={enviar} initial="hidden" animate="show" variants={{ show: {} }}>
      <Cabecalho morador={morador} />
      <motion.p className="sub" variants={fadeUp} custom={1}>
        {criar ? 'Primeiro acesso: crie a senha do administrador (mín. 6 caracteres).' : 'Digite sua senha de administrador.'}
      </motion.p>
      <motion.div className="stack" variants={fadeUp} custom={2}>
        <div className="field">
          <input type="password" autoFocus placeholder="Senha" value={senha} onChange={(e) => setSenha(e.target.value)} autoComplete={criar ? 'new-password' : 'current-password'} />
        </div>
        {criar && (
          <div className="field">
            <input type="password" placeholder="Repita a senha" value={conf} onChange={(e) => setConf(e.target.value)} autoComplete="new-password" />
          </div>
        )}
        {erro && <p className="err">{erro}</p>}
        <Btn disabled={busy || senha.length < 1}>{busy ? 'Entrando…' : criar ? 'Criar senha e entrar' : 'Entrar'}</Btn>
        {!criar && <button type="button" className="link" onClick={onEsqueci}>Esqueci minha senha</button>}
        <button type="button" className="ghost" onClick={onVoltar}>Voltar</button>
      </motion.div>
    </motion.form>
  )
}

export function EsqueciSenha({ morador, onVoltar, onOk }) {
  const [etapa, setEtapa] = useState('enviar') // enviar | codigo
  const [emailMask, setEmailMask] = useState('')
  const [codigo, setCodigo] = useState('')
  const [senha, setSenha] = useState('')
  const [conf, setConf] = useState('')
  const [erro, setErro] = useState('')
  const [busy, setBusy] = useState(false)
  const [espera, setEspera] = useState(0)

  useEffect(() => {
    if (espera <= 0) return
    const t = setTimeout(() => setEspera((s) => s - 1), 1000)
    return () => clearTimeout(t)
  }, [espera])

  async function enviarCodigo() {
    setErro(''); setBusy(true)
    try {
      const r = await api.solicitarRecuperacao(morador.id)
      setEmailMask(r?.email || '')
      setEtapa('codigo')
      setEspera(60)
    } catch (err) { setErro(err.message) }
    finally { setBusy(false) }
  }

  async function redefinir(e) {
    e.preventDefault()
    setErro('')
    if (codigo.length !== 6) return setErro('Digite o código de 6 dígitos')
    if (senha.length < 6) return setErro('A senha deve ter no mínimo 6 caracteres')
    if (senha !== conf) return setErro('As senhas não conferem')
    setBusy(true)
    try {
      await api.redefinirSenha(morador.id, codigo, senha)
      onOk(await api.entrarAdmin(morador.id, senha))
    } catch (err) { setErro(err.message) }
    finally { setBusy(false) }
  }

  return (
    <motion.form className="center" onSubmit={redefinir} initial="hidden" animate="show" variants={{ show: {} }}>
      <Cabecalho morador={morador} />
      <motion.h1 className="title sm" variants={fadeUp} custom={1}>Recuperar senha</motion.h1>

      {etapa === 'enviar' ? (
        <motion.div className="stack" variants={fadeUp} custom={2}>
          <p className="sub">Vamos enviar um código de 6 dígitos para o e-mail cadastrado do administrador.</p>
          {erro && <p className="err">{erro}</p>}
          <Btn type="button" disabled={busy} onClick={enviarCodigo}>{busy ? 'Enviando…' : 'Enviar código por e-mail'}</Btn>
          <button type="button" className="ghost" onClick={onVoltar}>Voltar</button>
        </motion.div>
      ) : (
        <motion.div className="stack" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45 }}>
          <p className="sub">Código enviado para <b className="gold">{emailMask}</b>. Vale por 15 minutos.</p>
          <div className="field">
            <input
              className="otp"
              inputMode="numeric"
              autoComplete="one-time-code"
              autoFocus
              maxLength={6}
              placeholder="000000"
              value={codigo}
              onChange={(e) => setCodigo(e.target.value.replace(/\D/g, '').slice(0, 6))}
            />
          </div>
          <div className="field">
            <input type="password" placeholder="Nova senha (mín. 6 caracteres)" value={senha} onChange={(e) => setSenha(e.target.value)} autoComplete="new-password" />
          </div>
          <div className="field">
            <input type="password" placeholder="Repita a nova senha" value={conf} onChange={(e) => setConf(e.target.value)} autoComplete="new-password" />
          </div>
          {erro && <p className="err">{erro}</p>}
          <Btn disabled={busy}>{busy ? 'Salvando…' : 'Redefinir e entrar'}</Btn>
          <button type="button" className="link" disabled={espera > 0 || busy} onClick={enviarCodigo}>
            {espera > 0 ? `Reenviar código em ${espera}s` : 'Reenviar código'}
          </button>
          <button type="button" className="ghost" onClick={onVoltar}>Voltar</button>
        </motion.div>
      )}
    </motion.form>
  )
}

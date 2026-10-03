import { useCallback, useEffect, useMemo, useState } from 'react'
import { AnimatePresence, MotionConfig, motion } from 'framer-motion'
import { api } from './api.js'
import { store } from './lib/utils.js'
import { Avatar, Btn, ease, fadeUp } from './components/ui.jsx'
import { EsqueciSenha, SenhaAdmin } from './components/Auth.jsx'
import Home from './components/Home.jsx'

const tela = {
  initial: { opacity: 0, y: 16, filter: 'blur(6px)' },
  animate: { opacity: 1, y: 0, filter: 'blur(0px)' },
  exit: { opacity: 0, y: -10, filter: 'blur(4px)' },
  transition: { duration: 0.4, ease },
}

export default function App() {
  const [moradores, setMoradores] = useState(null)
  const [meuId, setMeuId] = useState(() => store.get('perfil'))
  const [token, setToken] = useState(() => store.get('admin_token'))
  const [pendente, setPendente] = useState(null)   // morador admin aguardando senha
  const [esqueci, setEsqueci] = useState(false)    // tela "esqueci minha senha"
  const [erro, setErro] = useState('')

  const carregar = useCallback(async () => {
    try {
      const [lista, fotos] = await Promise.all([api.moradores(), api.fotos()])
      const mapa = new Map(fotos.map((f) => [String(f.id), f.foto]))
      setMoradores(lista.map((m) => ({ ...m, foto: mapa.get(String(m.id)) || null })))
    } catch (e) { setErro(e.message) }
  }, [])
  useEffect(() => { carregar() }, [carregar])

  const eu = useMemo(() => moradores?.find((m) => String(m.id) === String(meuId)), [moradores, meuId])

  function entrar(m, t) {
    if (t) store.set('admin_token', t)
    store.set('perfil', m.id)
    if (t) setToken(t)
    setMeuId(m.id); setPendente(null); setEsqueci(false)
  }
  function escolher(m) {
    if (m.is_admin) {
      const t = store.get('admin_token')
      if (t) return entrar(m, t)
      setPendente(m)
      return
    }
    entrar(m)
  }
  function sair() {
    setMeuId(null); setToken(null); setPendente(null); setEsqueci(false)
    store.del('perfil'); store.del('admin_token')
  }
  function sessaoExpirada() {
    store.del('admin_token'); setToken(null)
    const adm = moradores?.find((m) => m.is_admin)
    setMeuId(null); store.del('perfil'); setPendente(adm || null)
  }

  let conteudo
  if (erro && !moradores) {
    conteudo = (
      <motion.div key="erro" className="center" {...tela}>
        <p className="err">{erro}</p>
        <div className="stack"><Btn variant="sec" onClick={() => { setErro(''); carregar() }}>Tentar de novo</Btn></div>
      </motion.div>
    )
  } else if (!moradores) {
    conteudo = (
      <motion.div key="load" className="center" {...tela}>
        <div className="brand-load"><span className="wordmark">Partus</span><i className="pulse-bar" /></div>
      </motion.div>
    )
  } else if (pendente && esqueci) {
    conteudo = (
      <motion.div key="esqueci" {...tela}>
        <EsqueciSenha
          morador={pendente}
          onVoltar={() => setEsqueci(false)}
          onOk={(t) => { entrar(pendente, t); carregar() }}
        />
      </motion.div>
    )
  } else if (pendente) {
    conteudo = (
      <motion.div key="senha" {...tela}>
        <SenhaAdmin
          morador={pendente}
          onVoltar={() => setPendente(null)}
          onEsqueci={() => setEsqueci(true)}
          onOk={(t) => { entrar(pendente, t); carregar() }}
        />
      </motion.div>
    )
  } else if (!eu) {
    conteudo = (
      <motion.div key="perfis" className="center" {...tela}>
        <div>
          <span className="wordmark sm">Partus</span>
          <h1 className="title">Quem está aí?</h1>
          <p className="sub">Escolha seu perfil. Ele fica salvo neste aparelho.</p>
        </div>
        <motion.div className="profiles" initial="hidden" animate="show" variants={{ show: { transition: { staggerChildren: 0.09, delayChildren: 0.15 } } }}>
          {moradores.map((m) => (
            <motion.button
              key={m.id} className="profile" variants={fadeUp}
              whileHover={{ y: -6 }} whileTap={{ scale: 0.95 }}
              transition={{ type: 'spring', stiffness: 350, damping: 22 }}
              onClick={() => escolher(m)}
            >
              <Avatar m={m} size={104} className="big-avatar" />
              <span>{m.nome} {m.is_admin && <span className="lock">🔒</span>}</span>
            </motion.button>
          ))}
        </motion.div>
      </motion.div>
    )
  } else {
    conteudo = (
      <motion.div key="home" {...tela}>
        <Home
          eu={eu}
          token={eu.is_admin ? token : null}
          moradores={moradores}
          onSair={sair}
          onExpirou={sessaoExpirada}
          onMoradoresMudou={carregar}
        />
      </motion.div>
    )
  }

  return (
    <MotionConfig reducedMotion="user">
      <div className="aurora" aria-hidden="true"><i /><i /><i /></div>
      <AnimatePresence mode="wait" initial={false}>{conteudo}</AnimatePresence>
    </MotionConfig>
  )
}

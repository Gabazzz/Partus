import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { api } from '../api.js'
import { brl, fmtDia, monthStart } from '../lib/utils.js'
import { Avatar, Card, Money, ease, fadeUp } from './ui.jsx'
import FormGasto from './FormGasto.jsx'
import Moradores from './Moradores.jsx'

function Esqueleto() {
  return (
    <div className="skeletons">
      <div className="sk big" />
      <div className="sk-row"><div className="sk" /><div className="sk" /></div>
      {[0, 1, 2, 3].map((i) => <div className="sk line" key={i} />)}
    </div>
  )
}

export default function Home({ eu, token, moradores, onSair, onExpirou, onMoradoresMudou }) {
  const admin = eu.is_admin
  const hoje = new Date()
  const [ano, setAno] = useState(hoje.getFullYear())
  const [mes, setMes] = useState(hoje.getMonth())
  const [dir, setDir] = useState(1)
  const [lista, setLista] = useState(null)
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState('')
  const [novo, setNovo] = useState(false)
  const [editando, setEditando] = useState(null)
  const [gerindo, setGerindo] = useState(false)
  const [toast, setToast] = useState('')
  const reqId = useRef(0)

  const inicio = monthStart(ano, mes)
  const fim = mes === 11 ? monthStart(ano + 1, 0) : monthStart(ano, mes + 1)

  const carregar = useCallback(async () => {
    const id = ++reqId.current
    setCarregando(true)
    try {
      setErro('')
      const dados = await api.despesas(eu.id, token, inicio, fim)
      if (id === reqId.current) setLista(dados)
    } catch (e) {
      if (id === reqId.current) setErro(e.message)
    } finally {
      if (id === reqId.current) setCarregando(false)
    }
  }, [eu.id, token, inicio, fim])
  useEffect(() => { carregar() }, [carregar])

  function avisar(t) { setToast(t); setTimeout(() => setToast(''), 2400) }
  function mudaMes(d) {
    setDir(d)
    const dt = new Date(ano, mes + d, 1)
    setAno(dt.getFullYear()); setMes(dt.getMonth())
  }
  const nomeMes = new Date(ano, mes, 1).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })

  const total = (lista || []).reduce((s, d) => s + Number(d.valor), 0)
  const porMorador = useMemo(() => {
    const mapa = {}
    for (const d of lista || []) mapa[d.morador_nome] = (mapa[d.morador_nome] || 0) + Number(d.valor)
    return Object.entries(mapa).sort((a, b) => b[1] - a[1])
  }, [lista])
  const temFixas = (lista || []).some((d) => d.tipo === 'fixa')
  const fotoDe = useMemo(() => {
    const mapa = new Map(moradores.map((m) => [m.nome, m]))
    return (nome) => mapa.get(nome)
  }, [moradores])

  function tratar(e) {
    if (e.message.includes('Sem permissão')) onExpirou()
    else avisar(e.message)
  }
  async function gerarFixas() {
    try {
      const n = await api.gerarFixas(token, inicio)
      avisar(n ? `${n} despesas fixas lançadas` : 'Fixas já estavam lançadas')
      carregar()
    } catch (e) { tratar(e) }
  }

  return (
    <div className="app">
      <header className="top">
        <div className="me">
          <Avatar m={eu} size={44} ring />
          <div><small>{admin ? 'Administrador' : 'Perfil'}</small><strong>{eu.nome}</strong></div>
        </div>
        <div className="top-actions">
          {admin && <button className="chip gold" onClick={() => setGerindo(true)}>Moradores</button>}
          <button className="ghost" onClick={onSair}>Trocar perfil</button>
        </div>
      </header>

      <div className="month">
        <motion.button whileTap={{ scale: 0.88 }} onClick={() => mudaMes(-1)} aria-label="Mês anterior">‹</motion.button>
        <div className="month-title">
          <AnimatePresence mode="wait" initial={false} custom={dir}>
            <motion.h2
              key={inicio} custom={dir}
              initial={{ opacity: 0, x: dir * 24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: dir * -24 }}
              transition={{ duration: 0.22, ease }}
            >{nomeMes}</motion.h2>
          </AnimatePresence>
        </div>
        <motion.button whileTap={{ scale: 0.88 }} onClick={() => mudaMes(1)} aria-label="Próximo mês">›</motion.button>
      </div>

      {erro && <p className="err">{erro}</p>}
      {!lista && !erro && <Esqueleto />}

      {lista && (
        <motion.div className={`content ${carregando ? 'busy' : ''}`} initial="hidden" animate="show" variants={{ show: { transition: { staggerChildren: 0.07 } } }}>
          <Card className="hero" variants={fadeUp}>
            <small>{admin ? 'Total da casa no mês' : 'Você lançou no mês'}</small>
            <p className="big"><Money value={total} /></p>
            <div className="shine" />
          </Card>

          {admin && (
            <>
              <div className="split">
                <Card className="mine" variants={fadeUp}>
                  <small>Sua parte · 1/3</small>
                  <b><Money value={total / 3} duration={1.3} /></b>
                </Card>
                <Card variants={fadeUp}>
                  <small>Sogra · 2/3</small>
                  <b><Money value={(total * 2) / 3} duration={1.3} /></b>
                </Card>
              </div>
              {porMorador.length > 0 && (
                <Card className="bars" variants={fadeUp}>
                  <small className="cap">Quem lançou</small>
                  {porMorador.map(([nome, v], i) => (
                    <div className="bar-row" key={nome}>
                      <span className="who"><Avatar m={fotoDe(nome) || { nome }} size={26} />{nome}</span>
                      <div className="bar">
                        <motion.i
                          initial={{ width: 0 }}
                          animate={{ width: `${total ? (v / total) * 100 : 0}%` }}
                          transition={{ duration: 1.1, ease, delay: 0.25 + i * 0.08 }}
                        />
                      </div>
                      <b className="tnum">{brl(v)}</b>
                    </div>
                  ))}
                </Card>
              )}
            </>
          )}

          <motion.div className="section-title" variants={fadeUp}>
            <span>Lançamentos</span>
            {admin && !temFixas && <button className="chip gold" onClick={gerarFixas}>+ Lançar fixas do mês</button>}
          </motion.div>

          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={inicio} className="list"
              initial={{ opacity: 0, x: dir * 30 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: dir * -30 }}
              transition={{ duration: 0.28, ease }}
            >
              {lista.length === 0 && <div className="empty">Nenhum gasto neste mês.</div>}
              {lista.map((d, i) => {
                const Tag = admin ? motion.button : motion.div
                return (
                  <Tag
                    key={d.id} className="row"
                    initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.4, ease, delay: Math.min(i, 12) * 0.035 }}
                    whileHover={admin ? { x: 3 } : undefined}
                    whileTap={admin ? { scale: 0.985 } : undefined}
                    onClick={admin ? () => setEditando(d) : undefined}
                  >
                    <Avatar m={fotoDe(d.morador_nome) || { nome: d.morador_nome }} size={38} />
                    <div className="info">
                      <b>{d.item}{d.tipo === 'fixa' && <span className="tag">fixa</span>}</b>
                      <small>{fmtDia(d.data)} · {d.morador_nome}{d.descricao ? ` · ${d.descricao}` : ''}</small>
                    </div>
                    <span className="val tnum">{brl(d.valor)}</span>
                  </Tag>
                )
              })}
            </motion.div>
          </AnimatePresence>
        </motion.div>
      )}

      <motion.button
        className="fab" aria-label="Adicionar gasto"
        initial={{ scale: 0, rotate: -90 }} animate={{ scale: 1, rotate: 0 }}
        transition={{ type: 'spring', stiffness: 260, damping: 18, delay: 0.5 }}
        whileHover={{ scale: 1.08 }} whileTap={{ scale: 0.92 }}
        onClick={() => setNovo(true)}
      >+</motion.button>

      <AnimatePresence>
        {novo && (
          <FormGasto
            key="novo" titulo="Novo gasto"
            onFechar={() => setNovo(false)}
            onSalvar={async (f) => {
              await api.adicionar(eu.id, f.item, f.valor, f.descricao, null)
              setNovo(false); avisar('Gasto lançado'); carregar()
            }}
          />
        )}
        {editando && (
          <FormGasto
            key="editar" titulo="Editar gasto" inicial={editando} comData
            onFechar={() => setEditando(null)}
            onSalvar={async (f) => {
              try { await api.editar(token, editando.id, f.item, f.valor, f.descricao, f.data) }
              catch (e) { setEditando(null); return tratar(e) }
              setEditando(null); avisar('Atualizado'); carregar()
            }}
            onExcluir={async () => {
              try { await api.excluir(token, editando.id) }
              catch (e) { setEditando(null); return tratar(e) }
              setEditando(null); avisar('Excluído'); carregar()
            }}
          />
        )}
        {gerindo && admin && (
          <Moradores
            key="moradores"
            moradores={moradores}
            token={token}
            onFechar={() => setGerindo(false)}
            onMudou={async () => { await onMoradoresMudou(); carregar() }}
            onExpirou={() => { setGerindo(false); onExpirou() }}
            avisar={avisar}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {toast && (
          <motion.div
            key={toast} className="toast"
            initial={{ opacity: 0, y: -20, scale: 0.9 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -14, scale: 0.95 }}
            transition={{ type: 'spring', stiffness: 400, damping: 28 }}
          >{toast}</motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

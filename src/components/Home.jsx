import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { api } from '../api.js'
import { brl, copiarTexto, fmtDia, mensagemCobranca, monthStart } from '../lib/utils.js'
import { filaOffline, pareceSemConexao } from '../lib/offline.js'
import { Avatar, Btn, Card, Money, ease, fadeUp } from './ui.jsx'
import FormGasto from './FormGasto.jsx'
import Moradores from './Moradores.jsx'
import BotaoInstalar from './BotaoInstalar.jsx'

const MES_ABREV = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']
function iconeCategoria(d) {
  if (d.tipo === 'fixa') return '📌'
  return d.categoria === 'mercado' ? '🛒' : '🏷️'
}

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
  const podeVerTudo = admin || !!eu.pode_ver_tudo
  const somenteVisualiza = podeVerTudo && !admin
  const hoje = useMemo(() => new Date(), [])
  const [ano, setAno] = useState(hoje.getFullYear())
  const [mes, setMes] = useState(hoje.getMonth())
  const [dir, setDir] = useState(1)
  const [lista, setLista] = useState(null)
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState('')
  const [novo, setNovo] = useState(false)
  const [editando, setEditando] = useState(null)
  const [gerindo, setGerindo] = useState(false)
  const [verDetalhe, setVerDetalhe] = useState(false)
  const [verHistorico, setVerHistorico] = useState(false)
  const [historico, setHistorico] = useState(null)
  const [fechado, setFechado] = useState(false)
  const [fechadoEm, setFechadoEm] = useState(null)
  const [hojeFechado, setHojeFechado] = useState(false)
  const [confirmReabrir, setConfirmReabrir] = useState(false)
  const [pendentes, setPendentes] = useState(() => filaOffline.tamanho())
  const [pull, setPull] = useState(0)
  const [atualizando, setAtualizando] = useState(false)
  const [toast, setToast] = useState(null)
  const reqId = useRef(0)
  const pullInicio = useRef(null)
  const emMesAtual = ano === hoje.getFullYear() && mes === hoje.getMonth()

  const inicio = monthStart(ano, mes)
  const fim = mes === 11 ? monthStart(ano + 1, 0) : monthStart(ano, mes + 1)
  const hojeInicio = monthStart(hoje.getFullYear(), hoje.getMonth())

  const carregar = useCallback(async () => {
    const id = ++reqId.current
    setCarregando(true)
    try {
      setErro('')
      const [dados, infoMes, infoHoje] = await Promise.all([
        api.despesas(eu.id, token, inicio, fim),
        api.mesInfo(inicio),
        emMesAtual ? null : api.mesInfo(hojeInicio),
      ])
      if (id !== reqId.current) return
      setLista(dados)
      const linha = infoMes?.[0]
      setFechado(!!linha?.fechado); setFechadoEm(linha?.fechado_em || null)
      setHojeFechado(emMesAtual ? !!linha?.fechado : !!infoHoje?.[0]?.fechado)
    } catch (e) {
      if (id === reqId.current) setErro(e.message)
    } finally {
      if (id === reqId.current) setCarregando(false)
    }
  }, [eu.id, token, inicio, fim, emMesAtual, hojeInicio])
  useEffect(() => { carregar() }, [carregar])

  const carregarHistorico = useCallback(() => {
    api.historico(eu.id, token, 6).then(setHistorico).catch(() => {})
  }, [eu.id, token])
  useEffect(() => { carregarHistorico() }, [carregarHistorico])

  const sincronizarFila = useCallback(async () => {
    if (!filaOffline.tamanho()) return
    const { enviados, falharam } = await filaOffline.sincronizar(api)
    setPendentes(filaOffline.tamanho())
    if (enviados) { avisar(`${enviados} gasto${enviados > 1 ? 's' : ''} sincronizado${enviados > 1 ? 's' : ''}`); carregar(); carregarHistorico() }
    if (falharam.length) avisar(`${falharam.length} gasto(s) não puderam ser enviados`, 'erro')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [carregar, carregarHistorico])
  useEffect(() => {
    sincronizarFila()
    window.addEventListener('online', sincronizarFila)
    return () => window.removeEventListener('online', sincronizarFila)
  }, [sincronizarFila])

  function avisar(t, tipo = 'ok') {
    setToast({ texto: t, tipo })
    setTimeout(() => setToast(null), 2400)
    if (tipo === 'ok' && navigator.vibrate) { try { navigator.vibrate(15) } catch {} }
  }
  function mudaMes(d) {
    setDir(d)
    const dt = new Date(ano, mes + d, 1)
    setAno(dt.getFullYear()); setMes(dt.getMonth())
  }
  function irParaMes(mesISO) {
    const [ay, am] = mesISO.split('-').map(Number)
    const alvo = new Date(ay, am - 1, 1)
    const atual = new Date(ano, mes, 1)
    setDir(alvo > atual ? 1 : -1)
    setAno(alvo.getFullYear()); setMes(alvo.getMonth())
  }
  function irParaHoje() { irParaMes(hojeInicio) }

  async function fecharMes() {
    try {
      await api.fecharMes(token, inicio)
      setFechado(true); setFechadoEm(new Date().toISOString())
      if (emMesAtual) setHojeFechado(true)
      avisar('Mês marcado como acertado')
    } catch (e) { tratar(e) }
  }
  async function reabrirMes() {
    if (!confirmReabrir) { setConfirmReabrir(true); setTimeout(() => setConfirmReabrir(false), 3500); return }
    try {
      await api.reabrirMes(token, inicio)
      setFechado(false); setFechadoEm(null); setConfirmReabrir(false)
      if (emMesAtual) setHojeFechado(false)
      avisar('Mês reaberto')
    } catch (e) { tratar(e) }
  }

  function onPullStart(e) {
    if (novo || editando || gerindo || window.scrollY > 0) return
    pullInicio.current = e.touches[0].clientY
  }
  function onPullMove(e) {
    if (pullInicio.current == null) return
    const delta = e.touches[0].clientY - pullInicio.current
    if (delta > 0 && window.scrollY <= 0) setPull(Math.min(delta, 90))
  }
  async function onPullEnd() {
    if (pullInicio.current == null) return
    pullInicio.current = null
    if (pull > 60) {
      setAtualizando(true)
      await Promise.all([carregar(), carregarHistorico()])
      setAtualizando(false)
    }
    setPull(0)
  }
  const nomeMes = new Date(ano, mes, 1).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })

  const total = (lista || []).reduce((s, d) => s + Number(d.valor), 0)
  const porMorador = useMemo(() => {
    const mapa = {}
    for (const d of lista || []) mapa[d.morador_nome] = (mapa[d.morador_nome] || 0) + Number(d.valor)
    return Object.entries(mapa).sort((a, b) => b[1] - a[1])
  }, [lista])
  const temFixas = (lista || []).some((d) => d.tipo === 'fixa')
  const totalFixas = (lista || []).filter((d) => d.tipo === 'fixa').reduce((s, d) => s + Number(d.valor), 0)
  const sugestoesItens = useMemo(() => {
    const base = ['Mercado', 'Feira', 'Gás', 'Internet', 'Energia', 'Aluguel']
    const contagem = new Map()
    for (const d of lista || []) {
      const nome = (d.item || '').trim()
      if (nome) contagem.set(nome, (contagem.get(nome) || 0) + 1)
    }
    const frequentes = [...contagem.entries()].sort((a, b) => b[1] - a[1]).map(([nome]) => nome)
    const vistos = new Set()
    const resultado = []
    for (const nome of [...frequentes, ...base]) {
      const chave = nome.toLowerCase()
      if (vistos.has(chave)) continue
      vistos.add(chave); resultado.push(nome)
      if (resultado.length === 8) break
    }
    return resultado
  }, [lista])
  const fotoDe = useMemo(() => {
    const mapa = new Map(moradores.map((m) => [m.nome, m]))
    return (nome) => mapa.get(nome)
  }, [moradores])

  function tratar(e) {
    if (e.message.includes('Sem permissão')) onExpirou()
    else avisar(e.message, 'erro')
  }
  async function gerarFixas() {
    try {
      const n = await api.gerarFixas(token, inicio)
      avisar(n ? `${n} despesas fixas lançadas` : 'Fixas já estavam lançadas')
      carregar(); carregarHistorico()
    } catch (e) { tratar(e) }
  }
  async function copiarMensagem() {
    const texto = mensagemCobranca({ nomeMes, total, parte: (total * 2) / 3, fixas: totalFixas, variavel: total - totalFixas })
    avisar((await copiarTexto(texto)) ? 'Mensagem copiada!' : 'Não consegui copiar automaticamente')
  }

  return (
    <div className="app" onTouchStart={onPullStart} onTouchMove={onPullMove} onTouchEnd={onPullEnd}>
      <div className="pull-indicator" style={{ height: atualizando ? 48 : Math.min(pull, 60), opacity: atualizando ? 1 : Math.min(pull / 50, 1) }}>
        <span className={atualizando ? 'spin' : ''} style={!atualizando ? { transform: `rotate(${Math.min(pull * 3, 180)}deg)` } : undefined}>↻</span>
      </div>
      <header className="top">
        <div className="me">
          <Avatar m={eu} size={44} ring />
          <div><small>{admin ? 'Administrador' : eu.pode_ver_tudo ? 'Só visualiza' : 'Perfil'}</small><strong>{eu.nome}</strong></div>
        </div>
        <div className="top-actions">
          {pendentes > 0 && (
            <button type="button" className="chip pendentes-chip" onClick={sincronizarFila}>⏳ {pendentes} pendente{pendentes > 1 ? 's' : ''}</button>
          )}
          {admin && <button className="chip gold" onClick={() => setGerindo(true)}>Moradores</button>}
          <button className="ghost" onClick={onSair}>Trocar perfil</button>
        </div>
      </header>

      <div className="month-bar">
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
        <AnimatePresence>
          {!emMesAtual && (
            <motion.button
              key="hoje" type="button" className="chip hoje-chip"
              initial={{ opacity: 0, scale: 0.85, y: -4 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.85, y: -4 }}
              transition={{ duration: 0.2, ease }}
              whileTap={{ scale: 0.93 }}
              onClick={irParaHoje}
            >Hoje</motion.button>
          )}
        </AnimatePresence>
        <AnimatePresence>
          {fechado && (
            <motion.div
              key="fechado" className="mes-fechado-badge"
              initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }}
            >
              <span>🔒 Mês fechado{fechadoEm ? ` em ${fmtDia(fechadoEm.slice(0, 10))}` : ''}</span>
              {admin && (
                <button type="button" className="link" onClick={reabrirMes}>
                  {confirmReabrir ? 'Toque de novo' : 'Reabrir'}
                </button>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {erro && <p className="err">{erro}</p>}
      {!lista && !erro && <Esqueleto />}

      {lista && (
        <motion.div className={`content ${carregando ? 'busy' : ''}`} initial="hidden" animate="show" variants={{ show: { transition: { staggerChildren: 0.07 } } }}>
          <Card className="hero" variants={fadeUp}>
            <small>{podeVerTudo ? 'Total da casa no mês' : 'Você lançou no mês'}</small>
            <p className="big"><Money value={total} /></p>
            <div className="shine" />
          </Card>

          {historico && historico.some((h) => h.total > 0) && (
            <>
              <motion.button
                type="button" className="chip subtle detail-toggle" variants={fadeUp}
                onClick={() => setVerHistorico((v) => !v)}
              >
                {verHistorico ? 'Ocultar histórico' : 'Ver histórico'}
                <span className={`chev ${verHistorico ? 'open' : ''}`} aria-hidden="true">›</span>
              </motion.button>
              <AnimatePresence initial={false}>
                {verHistorico && (
                  <motion.div
                    key="hist-wrap" style={{ overflow: 'hidden' }}
                    initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.35, ease }}
                  >
                    <Card className="historico">
                      <small className="cap">Últimos {historico.length} meses</small>
                      <div className="historico-bars">
                        {(() => {
                          const max = Math.max(...historico.map((h) => h.total), 1)
                          return historico.map((h, i) => {
                            const d = new Date(h.mes + 'T00:00:00')
                            const atual = h.mes === inicio
                            return (
                              <motion.button
                                type="button" key={h.mes}
                                className={`historico-col ${atual ? 'atual' : ''}`}
                                onClick={() => irParaMes(h.mes)}
                                aria-label={`${MES_ABREV[d.getMonth()]}: ${brl(h.total)}`}
                                whileTap={{ scale: 0.92 }}
                              >
                                <div className="historico-bar">
                                  <motion.i
                                    initial={{ height: 0 }}
                                    animate={{ height: `${(h.total / max) * 100}%` }}
                                    transition={{ duration: 0.7, ease, delay: i * 0.06 }}
                                  />
                                </div>
                                <span className="historico-mes">{MES_ABREV[d.getMonth()]}</span>
                              </motion.button>
                            )
                          })
                        })()}
                      </div>
                    </Card>
                  </motion.div>
                )}
              </AnimatePresence>
            </>
          )}

          {podeVerTudo && (
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
              {admin && (
                <motion.button type="button" className="chip gold copy-msg" variants={fadeUp} onClick={copiarMensagem}>
                  <span aria-hidden="true">⧉</span> Copiar mensagem pra sogra
                </motion.button>
              )}
              {admin && !fechado && (
                <motion.button type="button" className="chip subtle fechar-mes" variants={fadeUp} onClick={fecharMes}>
                  🔒 Marcar mês como acertado
                </motion.button>
              )}
              {porMorador.length > 0 && (
                <>
                  <motion.button
                    type="button" className="chip subtle detail-toggle" variants={fadeUp}
                    onClick={() => setVerDetalhe((v) => !v)}
                  >
                    {verDetalhe ? 'Ocultar quem lançou' : 'Ver quem lançou'}
                    <span className={`chev ${verDetalhe ? 'open' : ''}`} aria-hidden="true">›</span>
                  </motion.button>
                  <AnimatePresence initial={false}>
                    {verDetalhe && (
                      <motion.div
                        key="bars-wrap" style={{ overflow: 'hidden' }}
                        initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.35, ease }}
                      >
                        <Card className="bars">
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
                      </motion.div>
                    )}
                  </AnimatePresence>
                </>
              )}
            </>
          )}

          <motion.div className="section-title" variants={fadeUp}>
            <span>Lançamentos</span>
            {admin && !temFixas && !fechado && <button className="chip gold" onClick={gerarFixas}>+ Lançar fixas do mês</button>}
          </motion.div>

          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={inicio} className="list"
              initial={{ opacity: 0, x: dir * 30 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: dir * -30 }}
              transition={{ duration: 0.28, ease }}
            >
              {lista.length === 0 && (
                <div className="empty-state">
                  <p className="empty">Nenhum gasto neste mês.</p>
                  {!somenteVisualiza && (
                    <Btn type="button" variant="sec" onClick={() => setNovo(true)}>Lançar gasto</Btn>
                  )}
                </div>
              )}
              {lista.map((d, i) => {
                const editavel = admin && !fechado
                const Tag = editavel ? motion.button : motion.div
                return (
                  <Tag
                    key={d.id} className="row"
                    initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.4, ease, delay: Math.min(i, 12) * 0.035 }}
                    whileHover={editavel ? { x: 3 } : undefined}
                    whileTap={editavel ? { scale: 0.985 } : undefined}
                    onClick={editavel ? () => setEditando(d) : undefined}
                  >
                    <Avatar m={fotoDe(d.morador_nome) || { nome: d.morador_nome }} size={38} />
                    <div className="info">
                      <b><span className="cat-ico" aria-hidden="true">{iconeCategoria(d)}</span>{d.item}{d.tipo === 'fixa' && <span className="tag">fixa</span>}</b>
                      <small>{fmtDia(d.data)} · {d.morador_nome}{d.descricao ? ` · ${d.descricao}` : ''}</small>
                    </div>
                    <span className="val tnum">{brl(d.valor)}</span>
                    {editavel && <span className="row-edit" aria-hidden="true">✎</span>}
                  </Tag>
                )
              })}
            </motion.div>
          </AnimatePresence>
          <div className="install-wrap"><BotaoInstalar /></div>
        </motion.div>
      )}

      {!somenteVisualiza && (
        <motion.button
          className="fab" aria-label="Adicionar gasto"
          initial={{ scale: 0, rotate: -90 }} animate={{ scale: 1, rotate: 0 }}
          transition={{ type: 'spring', stiffness: 260, damping: 18, delay: 0.5 }}
          whileHover={{ scale: 1.08 }} whileTap={{ scale: 0.92 }}
          onClick={() => hojeFechado ? avisar('Mês fechado. Peça pro administrador reabrir.', 'erro') : setNovo(true)}
        >+</motion.button>
      )}

      <AnimatePresence>
        {novo && (
          <FormGasto
            key="novo" titulo="Novo gasto" sugestoes={sugestoesItens}
            onFechar={() => setNovo(false)}
            onSalvar={async (f) => {
              try {
                await api.adicionar(eu.id, f.item, f.valor, f.descricao, null, f.categoria)
                setNovo(false); avisar('Gasto lançado'); carregar(); carregarHistorico()
              } catch (e) {
                if (!pareceSemConexao(e.message)) throw e
                filaOffline.adicionar({ morador: eu.id, item: f.item, valor: f.valor, descricao: f.descricao, data: null, categoria: f.categoria })
                setPendentes(filaOffline.tamanho())
                setNovo(false); avisar('Sem conexão — gasto salvo e será enviado automaticamente')
              }
            }}
          />
        )}
        {editando && (
          <FormGasto
            key="editar" titulo="Editar gasto" inicial={editando} comData
            onFechar={() => setEditando(null)}
            onSalvar={async (f) => {
              try { await api.editar(token, editando.id, f.item, f.valor, f.descricao, f.data, f.categoria) }
              catch (e) { setEditando(null); return tratar(e) }
              setEditando(null); avisar('Atualizado'); carregar(); carregarHistorico()
            }}
            onExcluir={async () => {
              try { await api.excluir(token, editando.id) }
              catch (e) { setEditando(null); return tratar(e) }
              setEditando(null); avisar('Excluído'); carregar(); carregarHistorico()
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
            key={toast.texto} className={`toast ${toast.tipo === 'erro' ? 'erro' : ''}`}
            initial={{ opacity: 0, y: -20, scale: 0.9 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -14, scale: 0.95 }}
            transition={{ type: 'spring', stiffness: 400, damping: 28 }}
          >
            <span className="toast-ico" aria-hidden="true">{toast.tipo === 'erro' ? '⚠' : '✓'}</span>
            {toast.texto}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

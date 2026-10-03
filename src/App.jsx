import { useEffect, useMemo, useState, useCallback } from 'react'
import { api } from './api.js'

const store = {
  get(k) { try { return localStorage.getItem(k) } catch { return null } },
  set(k, v) { try { localStorage.setItem(k, v) } catch {} },
  del(k) { try { localStorage.removeItem(k) } catch {} },
}

const brl = (n) => Number(n || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const pad = (n) => String(n).padStart(2, '0')
const monthStart = (y, m) => `${y}-${pad(m + 1)}-01`
const parseValor = (s) => {
  const n = Number(String(s).replace(/\./g, '').replace(',', '.'))
  return Number.isFinite(n) ? n : NaN
}
const fmtDia = (iso) => {
  const [, m, d] = iso.split('-')
  return `${d}/${m}`
}
const hojeISO = () => {
  const d = new Date()
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export default function App() {
  const [moradores, setMoradores] = useState(null)
  const [meuId, setMeuId] = useState(() => store.get('perfil'))
  const [token, setToken] = useState(() => store.get('admin_token'))
  const [pendente, setPendente] = useState(null) // morador admin aguardando senha
  const [erro, setErro] = useState('')

  const carregar = useCallback(async () => {
    try { setMoradores(await api.moradores()) }
    catch (e) { setErro(e.message) }
  }, [])
  useEffect(() => { carregar() }, [carregar])

  const eu = useMemo(() => moradores?.find((m) => m.id === meuId), [moradores, meuId])

  function escolher(m) {
    if (m.is_admin) {
      const t = store.get('admin_token')
      if (t) { setToken(t); setMeuId(m.id); store.set('perfil', m.id); return }
      setPendente(m)
      return
    }
    setMeuId(m.id); store.set('perfil', m.id)
  }
  function sair() {
    setMeuId(null); setToken(null); setPendente(null)
    store.del('perfil'); store.del('admin_token')
  }
  function sessaoExpirada() {
    store.del('admin_token'); setToken(null)
    const adm = moradores?.find((m) => m.is_admin)
    setMeuId(null); store.del('perfil'); setPendente(adm || null)
  }

  if (erro && !moradores) return <div className="center"><p className="err">{erro}</p><button className="btn sec" onClick={() => { setErro(''); carregar() }}>Tentar de novo</button></div>
  if (!moradores) return <div className="loading">Carregando…</div>

  if (pendente) {
    return (
      <SenhaAdmin
        morador={pendente}
        onVoltar={() => setPendente(null)}
        onOk={(t) => {
          store.set('admin_token', t); store.set('perfil', pendente.id)
          setToken(t); setMeuId(pendente.id); setPendente(null); carregar()
        }}
      />
    )
  }

  if (!eu) {
    return (
      <div className="center">
        <div>
          <h1 className="title">Quem está aí?</h1>
          <p className="sub">Escolha seu perfil. Ele fica salvo neste aparelho.</p>
        </div>
        <div className="profiles">
          {moradores.map((m) => (
            <button key={m.id} className="profile" onClick={() => escolher(m)}>
              <div className="face">{m.avatar}</div>
              <span>{m.nome} {m.is_admin && <span className="lock">🔒</span>}</span>
            </button>
          ))}
        </div>
      </div>
    )
  }

  return <Home eu={eu} token={eu.is_admin ? token : null} onSair={sair} onExpirou={sessaoExpirada} />
}

function SenhaAdmin({ morador, onVoltar, onOk }) {
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
    <form className="center" onSubmit={enviar}>
      <div className="profile" style={{ width: 'auto' }}>
        <div className="face">{morador.avatar}</div>
        <strong>{morador.nome}</strong>
      </div>
      <p className="sub">{criar ? 'Primeiro acesso: crie a senha do administrador (mín. 6 caracteres).' : 'Digite sua senha de administrador.'}</p>
      <div className="field" style={{ width: '100%' }}>
        <input type="password" autoFocus placeholder="Senha" value={senha} onChange={(e) => setSenha(e.target.value)} autoComplete={criar ? 'new-password' : 'current-password'} />
      </div>
      {criar && (
        <div className="field" style={{ width: '100%' }}>
          <input type="password" placeholder="Repita a senha" value={conf} onChange={(e) => setConf(e.target.value)} autoComplete="new-password" />
        </div>
      )}
      {erro && <p className="err">{erro}</p>}
      <button className="btn" disabled={busy || senha.length < 1}>{busy ? 'Entrando…' : criar ? 'Criar senha e entrar' : 'Entrar'}</button>
      <button type="button" className="ghost" onClick={onVoltar}>Voltar</button>
    </form>
  )
}

function Home({ eu, token, onSair, onExpirou }) {
  const admin = eu.is_admin
  const hoje = new Date()
  const [ano, setAno] = useState(hoje.getFullYear())
  const [mes, setMes] = useState(hoje.getMonth())
  const [lista, setLista] = useState(null)
  const [erro, setErro] = useState('')
  const [novo, setNovo] = useState(false)
  const [editando, setEditando] = useState(null)
  const [toast, setToast] = useState('')

  const inicio = monthStart(ano, mes)
  const fim = mes === 11 ? monthStart(ano + 1, 0) : monthStart(ano, mes + 1)

  const carregar = useCallback(async () => {
    try {
      setErro('')
      setLista(await api.despesas(eu.id, token, inicio, fim))
    } catch (e) { setErro(e.message) }
  }, [eu.id, token, inicio, fim])
  useEffect(() => { setLista(null); carregar() }, [carregar])

  function avisar(t) { setToast(t); setTimeout(() => setToast(''), 2200) }
  function mudaMes(d) {
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

  async function gerarFixas() {
    try {
      const n = await api.gerarFixas(token, inicio)
      avisar(n ? `${n} despesas fixas lançadas` : 'Fixas já estavam lançadas')
      carregar()
    } catch (e) { tratar(e) }
  }
  function tratar(e) {
    if (e.message.includes('Sem permissão')) onExpirou()
    else avisar(e.message)
  }

  return (
    <div className="app">
      <header className="top">
        <div className="me">
          <div className="face">{eu.avatar}</div>
          <div><small>{admin ? 'Administrador' : 'Perfil'}</small><strong>{eu.nome}</strong></div>
        </div>
        <button className="ghost" onClick={onSair}>Trocar perfil</button>
      </header>

      <div className="month">
        <button onClick={() => mudaMes(-1)} aria-label="Mês anterior">‹</button>
        <h2>{nomeMes}</h2>
        <button onClick={() => mudaMes(1)} aria-label="Próximo mês">›</button>
      </div>

      {erro && <p className="err">{erro}</p>}
      {!lista && !erro && <div className="loading">Carregando…</div>}

      {lista && (
        <>
          <div className="card hero">
            <small>{admin ? 'Total da casa no mês' : 'Você lançou no mês'}</small>
            <p className="big">{brl(total)}</p>
          </div>

          {admin && (
            <>
              <div className="split">
                <div className="card mine"><small>Sua parte (1/3)</small><b>{brl(total / 3)}</b></div>
                <div className="card"><small>Sogra (2/3)</small><b>{brl((total * 2) / 3)}</b></div>
              </div>
              {porMorador.length > 0 && (
                <div className="card bars">
                  <small style={{ color: 'var(--muted)', fontSize: 12 }}>Quem lançou</small>
                  {porMorador.map(([nome, v]) => (
                    <div className="bar-row" key={nome}>
                      <span>{nome}</span>
                      <div className="bar"><i style={{ width: `${total ? (v / total) * 100 : 0}%` }} /></div>
                      <b>{brl(v)}</b>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

          <div className="section-title">
            <span>Lançamentos</span>
            {admin && !temFixas && <button className="chip" onClick={gerarFixas}>+ Lançar fixas do mês</button>}
          </div>

          <div className="list">
            {lista.length === 0 && <div className="empty">Nenhum gasto neste mês.</div>}
            {lista.map((d) => {
              const Tag = admin ? 'button' : 'div'
              return (
                <Tag key={d.id} className="row" onClick={admin ? () => setEditando(d) : undefined}>
                  <div className="info">
                    <b>{d.item}{d.tipo === 'fixa' && <span className="tag">fixa</span>}</b>
                    <small>{fmtDia(d.data)} · {d.morador_nome}{d.descricao ? ` · ${d.descricao}` : ''}</small>
                  </div>
                  <span className="val">{brl(d.valor)}</span>
                </Tag>
              )
            })}
          </div>
        </>
      )}

      <button className="fab" onClick={() => setNovo(true)} aria-label="Adicionar gasto">+</button>

      {novo && (
        <FormGasto
          titulo="Novo gasto"
          onFechar={() => setNovo(false)}
          onSalvar={async (f) => {
            await api.adicionar(eu.id, f.item, f.valor, f.descricao, null)
            setNovo(false); avisar('Gasto lançado'); carregar()
          }}
        />
      )}
      {editando && (
        <FormGasto
          titulo="Editar gasto"
          inicial={editando}
          comData
          onFechar={() => setEditando(null)}
          onSalvar={async (f) => {
            try { await api.editar(token, editando.id, f.item, f.valor, f.descricao, f.data) }
            catch (e) { setEditando(null); return tratar(e) }
            setEditando(null); avisar('Atualizado'); carregar()
          }}
          onExcluir={async () => {
            if (!confirm('Excluir este gasto?')) return
            try { await api.excluir(token, editando.id) }
            catch (e) { setEditando(null); return tratar(e) }
            setEditando(null); avisar('Excluído'); carregar()
          }}
        />
      )}
      {toast && <div className="toast">{toast}</div>}
    </div>
  )
}

function FormGasto({ titulo, inicial, comData, onFechar, onSalvar, onExcluir }) {
  const [valor, setValor] = useState(inicial ? String(inicial.valor).replace('.', ',') : '')
  const [item, setItem] = useState(inicial?.item || '')
  const [descricao, setDescricao] = useState(inicial?.descricao || '')
  const [data, setData] = useState(inicial?.data || hojeISO())
  const [erro, setErro] = useState('')
  const [busy, setBusy] = useState(false)

  async function enviar(e) {
    e.preventDefault()
    const v = parseValor(valor)
    if (!(v > 0)) return setErro('Informe um valor maior que zero')
    if (!item.trim()) return setErro('Informe o item')
    setBusy(true); setErro('')
    try { await onSalvar({ valor: v, item, descricao, data }) }
    catch (err) { setErro(err.message); setBusy(false) }
  }

  return (
    <div className="overlay" onClick={onFechar}>
      <form className="sheet" onClick={(e) => e.stopPropagation()} onSubmit={enviar}>
        <h3>{titulo}</h3>
        <div className="field">
          <label>Valor (R$)</label>
          <input className="money" inputMode="decimal" placeholder="0,00" autoFocus value={valor} onChange={(e) => setValor(e.target.value)} />
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
        {erro && <p className="err">{erro}</p>}
        <button className="btn" disabled={busy}>{busy ? 'Salvando…' : 'Salvar'}</button>
        {onExcluir && <button type="button" className="btn danger" onClick={onExcluir}>Excluir</button>}
        <button type="button" className="btn sec" onClick={onFechar}>Cancelar</button>
      </form>
    </div>
  )
}

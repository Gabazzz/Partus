import { useEffect, useRef, useState } from 'react'
import { animate, motion, useDragControls, useReducedMotion } from 'framer-motion'
import { partesMoeda } from '../lib/utils.js'

export const ease = [0.22, 1, 0.36, 1]

/** Foto do morador; sem foto mostra o emoji do perfil ou a inicial do nome. */
export function Avatar({ m, size = 56, ring = false, className = '' }) {
  const inicial = (m?.nome || '?').trim().charAt(0).toUpperCase()
  return (
    <div className={`avatar ${ring ? 'ring' : ''} ${className}`} style={{ '--s': `${size}px` }}>
      {m?.foto
        ? <img src={m.foto} alt={m.nome} draggable={false} />
        : <span className="avatar-fallback">{m?.avatar || inicial}</span>}
    </div>
  )
}

/** Valor em R$ que "conta" até o número final, com centavos em destaque suave. */
export function Money({ value, className = '', duration = 1.15 }) {
  const reduce = useReducedMotion()
  const intRef = useRef(null)
  const decRef = useRef(null)
  const atual = useRef(0)

  useEffect(() => {
    const pintar = (v) => {
      const p = partesMoeda(v)
      if (intRef.current) intRef.current.textContent = p.inteiro
      if (decRef.current) decRef.current.textContent = p.centavos
    }
    if (reduce) { atual.current = value; pintar(value); return }
    const ctrl = animate(atual.current, value, {
      duration,
      ease,
      onUpdate: (v) => { atual.current = v; pintar(v) },
    })
    return () => ctrl.stop()
  }, [value, duration, reduce])

  return (
    <span className={`money-display ${className}`}>
      <span className="money-sym">R$</span>
      <span className="money-int" ref={intRef}>0</span>
      <span className="money-dec" ref={decRef}>,00</span>
    </span>
  )
}

/** Campo de valor com teclado numérico próprio — nunca abre o teclado nativo,
 *  então a tela não é empurrada/cortada ao digitar (diferente de um <input>). */
export function CampoValor({ centavos, onChange, autoFocus, atalhos = [] }) {
  const partes = partesMoeda(centavos / 100)
  const max = 99999999 // R$ 999.999,99

  function digitar(d) {
    const prox = centavos * 10 + d
    onChange(prox > max ? centavos : prox)
  }
  function apagar() { onChange(Math.floor(centavos / 10)) }
  function somar(reais) { onChange(Math.min(centavos + reais * 100, max)) }

  useEffect(() => {
    if (!autoFocus) return
    const onKey = (e) => {
      if (/^[0-9]$/.test(e.key)) digitar(Number(e.key))
      else if (e.key === 'Backspace') apagar()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [centavos, autoFocus])

  return (
    <div className="valor-pad">
      <div className="money-field display" role="textbox" aria-label="Valor">
        <span>R$</span>
        <span className="money tnum">{partes.inteiro}<span className="dec">{partes.centavos}</span></span>
      </div>
      {atalhos.length > 0 && (
        <div className="valor-atalhos">
          {atalhos.map((v) => (
            <motion.button key={v} type="button" whileTap={{ scale: 0.92 }} onClick={() => somar(v)}>
              +R${v}
            </motion.button>
          ))}
        </div>
      )}
      <div className="keypad">
        {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((d) => (
          <motion.button key={d} type="button" whileTap={{ scale: 0.9 }} onClick={() => digitar(d)}>{d}</motion.button>
        ))}
        <span aria-hidden="true" />
        <motion.button type="button" whileTap={{ scale: 0.9 }} className="zero" onClick={() => digitar(0)}>0</motion.button>
        <motion.button type="button" whileTap={{ scale: 0.9 }} className="back" aria-label="Apagar" onClick={apagar}>⌫</motion.button>
      </div>
    </div>
  )
}

/** Card de vidro com brilho que segue o cursor/dedo. */
export function Card({ children, className = '', as = 'div', ...rest }) {
  const ref = useRef(null)
  const Comp = motion[as] || motion.div
  const onMove = (e) => {
    const el = ref.current
    if (!el) return
    const r = el.getBoundingClientRect()
    el.style.setProperty('--mx', `${e.clientX - r.left}px`)
    el.style.setProperty('--my', `${e.clientY - r.top}px`)
  }
  return (
    <Comp ref={ref} className={`card ${className}`} onPointerMove={onMove} {...rest}>
      {children}
    </Comp>
  )
}

/** Folha deslizante (bottom sheet) com mola e arrasto pelo puxador.
 *  A altura máxima acompanha o visualViewport (não o viewport "de layout"),
 *  então quando o teclado do celular abre, a folha encolhe pra caber no
 *  espaço que sobrou em vez de deixar o rodapé (Salvar/Excluir) escondido
 *  atrás do teclado. */
export function Sheet({ onClose, children, label }) {
  const controls = useDragControls()
  const [viewport, setViewport] = useState(null)

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [onClose])

  // Alinha a overlay exatamente com a área visível real (visualViewport),
  // que encolhe quando a barra de endereço do navegador aparece ou o
  // teclado abre — diferente de 100vh/100dvh, que em vários Chrome/Android
  // consideram a tela "cheia" e deixam o rodapé da folha fora da área
  // visível. Assim a folha (e seus botões) sempre cabe no que a pessoa
  // realmente enxerga.
  useEffect(() => {
    const vv = window.visualViewport
    if (!vv) return
    const atualizar = () => setViewport({ altura: Math.round(vv.height), topo: Math.round(vv.offsetTop) })
    atualizar()
    vv.addEventListener('resize', atualizar)
    vv.addEventListener('scroll', atualizar)
    return () => {
      vv.removeEventListener('resize', atualizar)
      vv.removeEventListener('scroll', atualizar)
    }
  }, [])

  return (
    <motion.div
      className="overlay"
      style={viewport ? { top: viewport.topo, height: viewport.altura } : undefined}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.25 }}
      onClick={onClose}
    >
      <motion.div
        className="sheet"
        role="dialog"
        aria-label={label}
        style={{
          ...(viewport ? { maxHeight: Math.round(viewport.altura * 0.92) } : null),
          // O framer-motion aplica touch-action:none automaticamente em
          // qualquer elemento com `drag` ativo, mesmo com dragListener
          // desligado — isso bloqueia a rolagem nativa por toque dentro da
          // folha. Como o arrasto aqui só começa pelo puxador (controls.start),
          // é seguro liberar a rolagem vertical normal no resto da folha.
          touchAction: 'pan-y',
        }}
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{ type: 'spring', damping: 32, stiffness: 320 }}
        drag="y"
        dragControls={controls}
        dragListener={false}
        dragConstraints={{ top: 0, bottom: 0 }}
        dragElastic={{ top: 0, bottom: 0.5 }}
        onDragEnd={(_, info) => { if (info.offset.y > 110 || info.velocity.y > 600) onClose() }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="grabber" onPointerDown={(e) => controls.start(e)} />
        {children}
      </motion.div>
    </motion.div>
  )
}

/** Botão com micro-interação de mola. */
export function Btn({ variant = '', children, ...rest }) {
  return (
    <motion.button
      className={`btn ${variant}`}
      whileHover={{ y: -1 }}
      whileTap={{ scale: 0.97 }}
      transition={{ type: 'spring', stiffness: 500, damping: 30 }}
      {...rest}
    >
      {children}
    </motion.button>
  )
}

export const fadeUp = {
  hidden: { opacity: 0, y: 18 },
  show: (i = 0) => ({ opacity: 1, y: 0, transition: { duration: 0.55, ease, delay: i * 0.07 } }),
}

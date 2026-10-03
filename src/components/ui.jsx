import { useEffect, useRef } from 'react'
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

/** Folha deslizante (bottom sheet) com mola e arrasto pelo puxador. */
export function Sheet({ onClose, children, label }) {
  const controls = useDragControls()

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

  return (
    <motion.div
      className="overlay"
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

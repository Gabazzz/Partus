import { useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { useInstalar } from '../lib/instalar.js'
import { Btn, Sheet } from './ui.jsx'

/** Botão "Instalar app": prompt nativo no Android/desktop, passo a passo no iPhone. */
export default function BotaoInstalar({ className = '' }) {
  const { podeInstalar, precisaManual, instalar } = useInstalar()
  const [ajuda, setAjuda] = useState(false)

  if (!podeInstalar && !precisaManual) return null

  return (
    <>
      <motion.button
        type="button"
        className={`chip gold install ${className}`}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        whileTap={{ scale: 0.95 }}
        onClick={podeInstalar ? instalar : () => setAjuda(true)}
      >
        <span aria-hidden="true">⬇</span> Instalar app
      </motion.button>

      <AnimatePresence>
        {ajuda && (
          <Sheet onClose={() => setAjuda(false)} label="Instalar no iPhone">
            <div className="stack-lg">
              <h3>Instalar no iPhone</h3>
              <ol className="passos">
                <li>Toque em <b>Compartilhar</b> <span className="ico">⎙</span> na barra do Safari.</li>
                <li>Role e escolha <b>Adicionar à Tela de Início</b>.</li>
                <li>Confirme em <b>Adicionar</b>. O Partus aparece como um app.</li>
              </ol>
              <Btn type="button" onClick={() => setAjuda(false)}>Entendi</Btn>
            </div>
          </Sheet>
        )}
      </AnimatePresence>
    </>
  )
}

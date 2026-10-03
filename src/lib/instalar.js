import { useCallback, useEffect, useState } from 'react'

const jaInstalado = () =>
  typeof window !== 'undefined' &&
  (window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true)

const ehIOS = () =>
  typeof navigator !== 'undefined' &&
  /iphone|ipad|ipod/i.test(navigator.userAgent) &&
  !/crios|fxios|edgios/i.test(navigator.userAgent) // só o Safari consegue instalar no iOS

/** Estado de instalação do PWA: prompt nativo (Android/desktop) ou instrução manual (iOS Safari). */
export function useInstalar() {
  const [evento, setEvento] = useState(null)
  const [instalado, setInstalado] = useState(jaInstalado)

  useEffect(() => {
    const antes = (e) => { e.preventDefault(); setEvento(e) }
    const depois = () => { setEvento(null); setInstalado(true) }
    window.addEventListener('beforeinstallprompt', antes)
    window.addEventListener('appinstalled', depois)
    return () => {
      window.removeEventListener('beforeinstallprompt', antes)
      window.removeEventListener('appinstalled', depois)
    }
  }, [])

  const instalar = useCallback(async () => {
    if (!evento) return
    evento.prompt()
    await evento.userChoice
    setEvento(null)
  }, [evento])

  return {
    instalado,
    podeInstalar: !instalado && !!evento,   // prompt nativo disponível
    precisaManual: !instalado && !evento && ehIOS(), // iOS: Compartilhar → Tela de Início
    instalar,
  }
}

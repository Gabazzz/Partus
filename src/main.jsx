import React from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'
import './styles.css'

// Garante que uma nova versão publicada do app seja usada assim que estiver
// pronta, em vez de depender do usuário fechar e reabrir o PWA manualmente
// (o service worker assume o controle em segundo plano, mas sem isso a tela
// já aberta continuava rodando o JS antigo até uma recarga).
if ('serviceWorker' in navigator) {
  let jaRecarregou = false
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (jaRecarregou) return
    jaRecarregou = true
    window.location.reload()
  })
}

createRoot(document.getElementById('root')).render(<App />)

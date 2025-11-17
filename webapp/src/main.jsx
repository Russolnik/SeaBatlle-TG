import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'

// Инициализация Telegram WebApp
if (window.Telegram?.WebApp) {
  const tg = window.Telegram.WebApp
  tg.ready()
  tg.expand()
  
  // Устанавливаем тему
  if (tg.colorScheme === 'dark') {
    document.documentElement.classList.add('dark')
  } else {
    document.documentElement.classList.remove('dark')
  }
  
  // Слушаем изменения темы
  tg.onEvent('themeChanged', () => {
    if (tg.colorScheme === 'dark') {
      document.documentElement.classList.add('dark')
    } else {
      document.documentElement.classList.remove('dark')
    }
  })
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)


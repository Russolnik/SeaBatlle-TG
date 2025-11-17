import { useState, useEffect } from 'react'
import { api } from '../utils/api'

export default function GameLobby({ gameId, onCreateGame, user }) {
  const [selectedMode, setSelectedMode] = useState('full')
  const [creating, setCreating] = useState(false)
  const [botUsername, setBotUsername] = useState('your_bot_username')

  useEffect(() => {
    // Получаем username бота из API
    const fetchBotInfo = async () => {
      try {
        const info = await api.get('/api/bot/info')
        if (info.username) {
          setBotUsername(info.username)
        }
      } catch (err) {
        console.error('Ошибка получения информации о боте:', err)
        // Пробуем получить из URL или Telegram WebApp
        const urlParams = new URLSearchParams(window.location.search)
        const urlBot = urlParams.get('bot')
        if (urlBot) {
          setBotUsername(urlBot)
        } else if (window.Telegram?.WebApp?.initDataUnsafe?.start_param) {
          const startParam = window.Telegram.WebApp.initDataUnsafe.start_param
          const parts = startParam.split('_')
          if (parts[0]) {
            setBotUsername(parts[0])
          }
        }
      }
    }
    fetchBotInfo()
  }, [])

  const handleCreate = async () => {
    if (creating) return
    setCreating(true)
    try {
      await onCreateGame(selectedMode)
    } catch (err) {
      console.error('Ошибка:', err)
    } finally {
      setCreating(false)
    }
  }

  // Если есть gameId - показываем ожидание
  if (gameId) {
    // Ссылка должна вести в бота (убираем @ если есть)
    const cleanBotUsername = botUsername.replace('@', '')
    const shareLink = `https://t.me/${cleanBotUsername}?start=join_${gameId}`

    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-blue-50 to-blue-100 dark:from-gray-900 dark:to-gray-800">
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl p-8 max-w-md w-full border-2 border-blue-200 dark:border-blue-800">
          <h1 className="text-3xl font-bold mb-6 text-center text-gray-800 dark:text-gray-200">Ожидание игрока</h1>
          <p className="text-gray-600 dark:text-gray-400 mb-6 text-center">
            ID игры: <span className="font-mono font-bold text-blue-600 dark:text-blue-400">{gameId}</span>
          </p>
          <div className="mb-6">
            <input
              type="text"
              value={shareLink}
              readOnly
              className="w-full px-4 py-3 border-2 border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-700 dark:text-gray-200 text-sm font-mono"
            />
          </div>
          <button
            onClick={() => {
              navigator.clipboard.writeText(shareLink)
              if (window.Telegram?.WebApp?.showAlert) {
                window.Telegram.WebApp.showAlert('Ссылка скопирована!')
              } else {
                alert('Ссылка скопирована!')
              }
            }}
            className="w-full px-6 py-3 bg-blue-500 text-white rounded-lg hover:bg-blue-600 mb-6 shadow-lg font-semibold transition-all"
          >
            📋 Копировать ссылку
          </button>
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-4 border-blue-500 mx-auto mb-4"></div>
            <p className="text-gray-600 dark:text-gray-400 font-medium">Ожидание противника...</p>
          </div>
        </div>
      </div>
    )
  }

  // Экран создания игры
  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-blue-50 to-blue-100 dark:from-gray-900 dark:to-gray-800">
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl p-8 max-w-md w-full border-2 border-blue-200 dark:border-blue-800">
        <h1 className="text-3xl font-bold mb-8 text-center text-gray-800 dark:text-gray-200">Морской бой</h1>
        
        <div className="mb-8">
          <label className="block text-lg font-semibold mb-4 text-gray-800 dark:text-gray-200">Режим игры:</label>
          <div className="space-y-3">
            {[
              { mode: 'full', name: 'Полный (10×10)', desc: '4×1, 3×2, 2×3, 1×4' },
              { mode: 'classic', name: 'Обычный (8×8)', desc: '2×3, 2×2, 4×1' },
              { mode: 'fast', name: 'Быстрый (6×6)', desc: '1×3, 1×2, 2×1' }
            ].map(({ mode, name, desc }) => (
              <button
                key={mode}
                onClick={() => setSelectedMode(mode)}
                className={`w-full px-6 py-4 rounded-xl border-2 transition-all ${
                  selectedMode === mode
                    ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20 shadow-lg scale-105'
                    : 'border-gray-300 dark:border-gray-600 hover:border-blue-300 dark:hover:border-blue-700'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="text-left">
                    <div className="font-semibold text-gray-800 dark:text-gray-200">{name}</div>
                    <div className="text-sm text-gray-600 dark:text-gray-400">{desc}</div>
                  </div>
                  {selectedMode === mode && (
                    <span className="text-blue-500 text-2xl font-bold">✓</span>
                  )}
                </div>
              </button>
            ))}
          </div>
        </div>

        <button
          onClick={handleCreate}
          disabled={creating}
          className="w-full px-6 py-4 bg-blue-500 text-white rounded-xl hover:bg-blue-600 disabled:opacity-50 font-semibold text-lg shadow-lg transition-all"
        >
          {creating ? '⏳ Создание...' : '🎮 Создать игру'}
        </button>
      </div>
    </div>
  )
}

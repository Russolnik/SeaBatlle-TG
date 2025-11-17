import { useState } from 'react'

export default function GameLobby({ gameId, onCreateGame, user }) {
  const [selectedMode, setSelectedMode] = useState('full')
  const [creating, setCreating] = useState(false)

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
    // Ссылка должна вести в бота, а не напрямую в Mini App
    // Получаем username бота из URL или из Telegram WebApp
    const urlParams = new URLSearchParams(window.location.search)
    const botUsername = urlParams.get('bot') || 
                       window.Telegram?.WebApp?.initDataUnsafe?.start_param?.split('_')[0] || 
                       '@Tester_24513821_bot'
    const shareLink = `https://t.me/${botUsername}?start=join_${gameId}`

    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6 max-w-md w-full">
          <h1 className="text-2xl font-bold mb-4 text-center">Ожидание игрока</h1>
          <p className="text-gray-600 dark:text-gray-400 mb-4 text-center">
            ID: <span className="font-mono font-bold">{gameId}</span>
          </p>
          <div className="mb-4">
            <input
              type="text"
              value={shareLink}
              readOnly
              className="w-full px-3 py-2 border rounded dark:bg-gray-700 dark:border-gray-600 text-sm"
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
            className="w-full px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 mb-4"
          >
            Копировать ссылку
          </button>
          <div className="text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto"></div>
            <p className="mt-2 text-gray-600 dark:text-gray-400">Ожидание...</p>
          </div>
        </div>
      </div>
    )
  }

  // Экран создания игры
  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6 max-w-md w-full">
        <h1 className="text-2xl font-bold mb-6 text-center">Морской бой</h1>
        
        <div className="mb-6">
          <label className="block text-sm font-medium mb-3">Режим игры:</label>
          <div className="space-y-2">
            {[
              { mode: 'full', name: 'Полный (10×10)', desc: '4×1, 3×2, 2×3, 1×4' },
              { mode: 'classic', name: 'Обычный (8×8)', desc: '2×3, 2×2, 4×1' },
              { mode: 'fast', name: 'Быстрый (6×6)', desc: '1×3, 1×2, 2×1' }
            ].map(({ mode, name, desc }) => (
              <button
                key={mode}
                onClick={() => setSelectedMode(mode)}
                className={`w-full px-4 py-3 rounded-lg border-2 transition-all ${
                  selectedMode === mode
                    ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                    : 'border-gray-300 dark:border-gray-600'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="text-left">
                    <div className="font-semibold">{name}</div>
                    <div className="text-sm text-gray-600 dark:text-gray-400">{desc}</div>
                  </div>
                  {selectedMode === mode && <span className="text-blue-500 text-xl">✓</span>}
                </div>
              </button>
            ))}
          </div>
        </div>

        <button
          onClick={handleCreate}
          disabled={creating}
          className="w-full px-4 py-3 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50 font-semibold"
        >
          {creating ? 'Создание...' : 'Создать игру'}
        </button>
      </div>
    </div>
  )
}

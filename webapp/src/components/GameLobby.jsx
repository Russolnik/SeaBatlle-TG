import { useState } from 'react'

export default function GameLobby({ gameId, onJoin, onCreateGame, user }) {
  const [selectedMode, setSelectedMode] = useState('full')
  const [creating, setCreating] = useState(false)

  const handleCreateGame = async () => {
    if (creating) return
    setCreating(true)
    try {
      await onCreateGame(selectedMode)
    } catch (error) {
      console.error('Ошибка создания игры:', error)
    } finally {
      setCreating(false)
    }
  }

  // Если gameId есть - показываем лобби для ожидания
  if (gameId) {
    // Ссылка должна вести на Mini App, а не на браузер
    // Используем текущий URL с gameId для открытия Mini App
    const webappUrl = window.location.origin + window.location.pathname
    const shareLink = `${webappUrl}?gameId=${gameId}`

    const copyLink = () => {
      navigator.clipboard.writeText(shareLink)
      // Используем Telegram WebApp API для уведомления, если доступен
      if (window.Telegram?.WebApp?.showAlert) {
        window.Telegram.WebApp.showAlert('Ссылка скопирована! Отправьте её другу в Telegram.')
      } else {
        alert('Ссылка скопирована! Отправьте её другу в Telegram.')
      }
    }
    
    // Используем Telegram WebApp для открытия ссылки на бота
    const shareViaTelegram = () => {
      if (window.Telegram?.WebApp?.openTelegramLink) {
        window.Telegram.WebApp.openTelegramLink(shareLink)
      } else {
        copyLink()
      }
    }

    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6 max-w-md w-full">
          <h1 className="text-2xl font-bold mb-4 text-center">Ожидание игрока</h1>
          <p className="text-gray-600 dark:text-gray-400 mb-4 text-center">
            ID игры: <span className="font-mono font-bold">{gameId}</span>
          </p>
          <p className="text-gray-600 dark:text-gray-400 mb-4">
            Отправьте ссылку другу или подождите, пока кто-то присоединится:
          </p>
          <div className="flex gap-2 mb-4">
            <input
              type="text"
              value={shareLink}
              readOnly
              className="flex-1 px-3 py-2 border rounded dark:bg-gray-700 dark:border-gray-600"
            />
            <button
              onClick={copyLink}
              className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
            >
              Копировать
            </button>
          </div>
          <div className="text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto"></div>
            <p className="mt-2 text-gray-600 dark:text-gray-400">Ожидание...</p>
          </div>
        </div>
      </div>
    )
  }

  // Если gameId нет - показываем экран создания игры
  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6 max-w-md w-full">
        <h1 className="text-2xl font-bold mb-6 text-center">Морской бой</h1>
        
        <div className="mb-6">
          <label className="block text-sm font-medium mb-3 text-gray-700 dark:text-gray-300">
            Выберите режим игры:
          </label>
          <div className="space-y-2">
            <button
              onClick={() => setSelectedMode('full')}
              className={`w-full px-4 py-3 rounded-lg border-2 transition-all ${
                selectedMode === 'full'
                  ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                  : 'border-gray-300 dark:border-gray-600 hover:border-gray-400'
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="text-left">
                  <div className="font-semibold">Полный (10×10)</div>
                  <div className="text-sm text-gray-600 dark:text-gray-400">
                    4×1, 3×2, 2×3, 1×4
                  </div>
                </div>
                {selectedMode === 'full' && (
                  <span className="text-blue-500 text-xl">✓</span>
                )}
              </div>
            </button>
            
            <button
              onClick={() => setSelectedMode('classic')}
              className={`w-full px-4 py-3 rounded-lg border-2 transition-all ${
                selectedMode === 'classic'
                  ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                  : 'border-gray-300 dark:border-gray-600 hover:border-gray-400'
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="text-left">
                  <div className="font-semibold">Обычный (8×8)</div>
                  <div className="text-sm text-gray-600 dark:text-gray-400">
                    2×3, 2×2, 4×1
                  </div>
                </div>
                {selectedMode === 'classic' && (
                  <span className="text-blue-500 text-xl">✓</span>
                )}
              </div>
            </button>
            
            <button
              onClick={() => setSelectedMode('fast')}
              className={`w-full px-4 py-3 rounded-lg border-2 transition-all ${
                selectedMode === 'fast'
                  ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                  : 'border-gray-300 dark:border-gray-600 hover:border-gray-400'
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="text-left">
                  <div className="font-semibold">Быстрый (6×6)</div>
                  <div className="text-sm text-gray-600 dark:text-gray-400">
                    1×3, 1×2, 2×1
                  </div>
                </div>
                {selectedMode === 'fast' && (
                  <span className="text-blue-500 text-xl">✓</span>
                )}
              </div>
            </button>
          </div>
        </div>

        <button
          onClick={handleCreateGame}
          disabled={creating}
          className="w-full px-4 py-3 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed font-semibold transition-all"
        >
          {creating ? (
            <span className="flex items-center justify-center">
              <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mr-2"></div>
              Создание игры...
            </span>
          ) : (
            'Создать игру'
          )}
        </button>
      </div>
    </div>
  )
}


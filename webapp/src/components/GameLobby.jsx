import { useState, useEffect } from 'react'
import { api } from '../utils/api'

export default function GameLobby({ gameId, gameState, playerId, onCreateGame, user, onStateUpdate, socket, onLeaveGame, onDeleteGame, isCreator }) {
  const [selectedMode, setSelectedMode] = useState('full')
  const [selectedTimer, setSelectedTimer] = useState(false)
  const [creating, setCreating] = useState(false)
  const [ready, setReady] = useState(false)
  const [settingReady, setSettingReady] = useState(false)
  const [botUsername, setBotUsername] = useState('  your_bot_username')
  const roomCode = (typeof window !== 'undefined' && localStorage.getItem('roomCode')) || ''
  const urlParams = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null
  const botParam = (urlParams && urlParams.get('bot')) || botUsername || 'seabattles_game_bot'
  const shareLink = roomCode ? `https://t.me/${botParam.replace('@', '')}?start=room-${roomCode}` : ''

  // Слушаем WebSocket обновления для синхронизации состояния
  useEffect(() => {
    if (!socket || !gameId) return

    const handleGameState = (state) => {
      if (!state || state.id !== gameId) return
      // Если пришло состояние для другого player_id, а у нас уже есть свой — игнорируем
      if (state.player_id && playerId && state.player_id !== playerId) return

      console.log('GameLobby: получено обновление game_state через WebSocket', { 
        gameId: state.id, 
        phase: state.phase,
        players: state.players ? {
          p1: { ready: state.players.p1?.ready, user_id: state.players.p1?.user_id },
          p2: { ready: state.players.p2?.ready, user_id: state.players.p2?.user_id }
        } : null
      })
      if (onStateUpdate) onStateUpdate(state)
    }

    socket.on('game_state', handleGameState)

    return () => {
      socket.off('game_state', handleGameState)
    }
  }, [socket, gameId, playerId, onStateUpdate])

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

  const handleJoinByCode = () => {
    const code = prompt('Введите код комнаты (например, ABCD1234):', roomCode || '')
    if (!code) return
    const normalized = code.trim().toUpperCase()
    localStorage.setItem('roomCode', normalized)
    const bot = (botParam || botUsername || '').replace('@', '') || 'seabattles_game_bot'
    const base = window.location.origin + window.location.pathname
    window.location.href = `${base}?startapp=room-${normalized}&bot=${bot}`
  }

  const handleShare = async () => {
    if (!shareLink) return
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(shareLink)
      }
      if (user?.id && roomCode) {
        await api.post('/api/share/link', {
          user_id: user.id,
          room_code: roomCode,
          link: shareLink
        })
      }
      alert('Ссылка скопирована и отправлена ботом в личные сообщения.')
    } catch (err) {
      console.error('Share error', err)
      alert('Не удалось отправить ссылку. Скопируйте вручную: ' + shareLink)
    }
  }

  const handleCreate = async () => {
    if (creating) return
    setCreating(true)
    try {
      await onCreateGame(selectedMode, selectedTimer)
    } catch (err) {
      console.error('Ошибка:', err)
    } finally {
      setCreating(false)
    }
  }

  const renderSharePanel = () => (
    <div className="flex flex-wrap items-center gap-2 mb-4 bg-white/90 dark:bg-gray-800/80 px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700">
      <span className="text-sm text-gray-600 dark:text-gray-300">Код комнаты:</span>
      <span className="font-mono font-bold text-blue-600 dark:text-blue-300">{roomCode || '—'}</span>
      <button
        onClick={handleShare}
        disabled={!roomCode}
        className="px-3 py-1 text-sm bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50 transition-all"
      >
        🔗 Поделиться
      </button>
      <button
        onClick={handleJoinByCode}
        className="px-3 py-1 text-sm bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 transition-all"
      >
        ➕ Подключиться по коду
      </button>
    </div>
  )

  // Если есть gameState и оба игрока - показываем экран готовности
  if (gameState && gameState.players) {
    const myPlayer = gameState.players[playerId]
    const opponentId = playerId === 'p1' ? 'p2' : 'p1'
    const opponent = gameState.players[opponentId]
    const creator = gameState.players?.p1
    const joiner = gameState.players?.p2
    
    // Если есть оба игрока
    if (myPlayer && opponent && opponent.user_id) {
      const isMyReady = myPlayer.ready || false
      const isOpponentReady = opponent.ready || false
      
      console.log('GameLobby: состояние готовности', {
        playerId,
        myReady: isMyReady,
        opponentReady: isOpponentReady,
        myPlayer: { ready: myPlayer.ready, user_id: myPlayer.user_id },
        opponent: { ready: opponent.ready, user_id: opponent.user_id }
      })
      
      const handleReady = async () => {
        if (settingReady) return
        setSettingReady(true)
        try {
          const res = await api.post(`/api/game/${gameId}/ready`, {
            player_id: playerId
          })
          if (res.game_state && onStateUpdate) {
            onStateUpdate(res.game_state)
          }
          setReady(!isMyReady)
        } catch (err) {
          console.error('Ошибка:', err)
          alert(err.message || 'Ошибка')
        } finally {
          setSettingReady(false)
        }
      }
      
      return (
        <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-blue-50 via-sky-50 to-cyan-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900">
          <div className="bg-white/95 dark:bg-gray-800/95 backdrop-blur-sm rounded-2xl shadow-2xl p-8 max-w-md w-full border-4 border-blue-300 dark:border-blue-700 relative">
            {renderSharePanel()}
            <div className="absolute top-4 right-4 flex gap-2">
              <button
                onClick={onLeaveGame}
                className="px-3 py-2 text-sm bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 transition-all"
              >
                🚪 Выйти
              </button>
              {isCreator && (
                <button
                  onClick={onDeleteGame}
                  className="px-3 py-2 text-sm bg-red-500 text-white rounded-lg hover:bg-red-600 transition-all"
                >
                  🗑 Удалить
                </button>
              )}
            </div>
            <h1 className="text-4xl font-bold mb-6 text-center text-gray-800 dark:text-gray-200 drop-shadow-lg">
              ⚓ Готовность к игре
            </h1>
            
            <div className="mb-4 bg-gray-50 dark:bg-gray-700/50 rounded-xl p-4 border border-gray-200 dark:border-gray-600">
              <div className="font-bold text-gray-800 dark:text-gray-200 mb-2">Игроки</div>
              <div className="space-y-2 text-sm text-gray-700 dark:text-gray-300">
                <div className="flex items-center justify-between">
                  <span>Создатель: @{creator?.username || 'p1'}</span>
                  <span className={`font-semibold ${creator?.ready ? 'text-green-500' : 'text-gray-400'}`}>
                    {creator?.ready ? '✅ Готов' : '⏳ Не готов'}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span>Гость: @{joiner?.username || 'p2'}</span>
                  <span className={`font-semibold ${joiner?.ready ? 'text-green-500' : 'text-gray-400'}`}>
                    {joiner?.ready ? '✅ Готов' : '⏳ Не готов'}
                  </span>
                </div>
              </div>
            </div>

            <div className="mb-6 space-y-4">
              <div className="bg-blue-50 dark:bg-blue-900/30 rounded-xl p-4 border-2 border-blue-200 dark:border-blue-700">
                <div className="flex items-center justify-between mb-2">
                  <span className="font-bold text-gray-800 dark:text-gray-200">Вы:</span>
                  <span className={`text-2xl ${isMyReady ? 'text-green-500' : 'text-gray-400'}`}>
                    {isMyReady ? '✅ Готов' : '⏳ Не готов'}
                  </span>
                </div>
              </div>
              
              <div className="bg-gray-50 dark:bg-gray-700/50 rounded-xl p-4 border-2 border-gray-200 dark:border-gray-600">
                <div className="flex items-center justify-between mb-2">
                  <span className="font-bold text-gray-800 dark:text-gray-200">
                    {opponent.username || 'Противник'}:
                  </span>
                  <span className={`text-2xl ${isOpponentReady ? 'text-green-500' : 'text-gray-400'}`}>
                    {isOpponentReady ? '✅ Готов' : '⏳ Не готов'}
                  </span>
                </div>
              </div>
            </div>
            
            <button
              onClick={handleReady}
              disabled={settingReady}
              className={`w-full px-6 py-4 rounded-xl mb-4 shadow-xl font-bold text-lg transition-all hover:scale-105 active:scale-95 ${
                isMyReady
                  ? 'bg-red-500 hover:bg-red-600 text-white'
                  : 'bg-green-500 hover:bg-green-600 text-white'
              } disabled:opacity-50`}
            >
              {settingReady ? '⏳' : isMyReady ? '❌ Не готов' : '✅ Готов'}
            </button>
            
            {isMyReady && isOpponentReady && (
              <div className="text-center text-green-600 dark:text-green-400 font-bold text-lg">
                🎮 Оба игрока готовы! Начинается расстановка кораблей...
              </div>
            )}
          </div>
        </div>
      )
    }
  }
  
  // Если есть gameId и gameState - показываем ожидание или готовность
  // Если есть gameId, но нет gameState - это значит игра еще не создана, показываем экран создания
  if (gameId && gameState) {
    // Проверяем, есть ли roomCode в URL или localStorage
    const params = new URLSearchParams(window.location.search)
    const startapp = params.get('startapp')
    let roomCode = null
    if (startapp && startapp.startsWith('room-')) {
      roomCode = startapp.replace('room-', '')
    } else {
      roomCode = localStorage.getItem('roomCode')
    }
    
    // Ссылка должна вести в бота (убираем @ если есть)
    const cleanBotUsername = botUsername.replace('@', '')
    // Используем формат start=room-XXXXXX для обычных ссылок (startapp работает только в кнопках WebApp)
    const shareLink = roomCode 
      ? `https://t.me/${cleanBotUsername}?start=room-${roomCode}`
      : `https://t.me/${cleanBotUsername}?start=join_${gameId}`
    
    // Сохраняем roomCode для использования в компоненте
    const displayRoomCode = roomCode

    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-blue-50 via-sky-50 to-cyan-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900">
        <div className="bg-white/95 dark:bg-gray-800/95 backdrop-blur-sm rounded-2xl shadow-2xl p-8 max-w-md w-full border-4 border-blue-300 dark:border-blue-700 relative">
          <div className="absolute top-4 right-4 flex gap-2">
            <button
              onClick={onLeaveGame}
              className="px-3 py-2 text-sm bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 transition-all"
            >
              🚪 Выйти
            </button>
            {isCreator && (
              <button
                onClick={onDeleteGame}
                className="px-3 py-2 text-sm bg-red-500 text-white rounded-lg hover:bg-red-600 transition-all"
              >
                🗑 Удалить
              </button>
            )}
          </div>
          <h1 className="text-4xl font-bold mb-6 text-center text-gray-800 dark:text-gray-200 drop-shadow-lg">
            ⏳ Ожидание игрока
          </h1>
          <p className="text-gray-600 dark:text-gray-400 mb-6 text-center text-lg">
            {displayRoomCode ? (
              <>
                Код комнаты: <span className="font-mono font-bold text-blue-600 dark:text-blue-400 text-xl">{displayRoomCode}</span>
                <br />
                <span className="text-sm text-gray-500 dark:text-gray-500">ID игры: {gameId}</span>
              </>
            ) : (
              <>
                ID игры: <span className="font-mono font-bold text-blue-600 dark:text-blue-400 text-xl">{gameId}</span>
              </>
            )}
          </p>
          <div className="mb-4 bg-gray-50 dark:bg-gray-700/50 rounded-xl p-4 border border-gray-200 dark:border-gray-600">
            <div className="font-bold text-gray-800 dark:text-gray-200 mb-2">Игроки</div>
            <div className="space-y-2 text-sm text-gray-700 dark:text-gray-300">
              <div className="flex items-center justify-between">
                <span>Создатель: @{gameState.players?.p1?.username || 'p1'}</span>
                <span className={`font-semibold ${gameState.players?.p1?.ready ? 'text-green-500' : 'text-gray-400'}`}>
                  {gameState.players?.p1?.ready ? '✅ Готов' : '⏳ Не готов'}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span>Гость: @{gameState.players?.p2?.username || '—'}</span>
                <span className={`font-semibold ${gameState.players?.p2?.ready ? 'text-green-500' : 'text-gray-400'}`}>
                  {gameState.players?.p2?.ready ? '✅ Готов' : '⏳ Не готов'}
                </span>
              </div>
            </div>
          </div>
          <div className="mb-6">
            <input
              type="text"
              value={shareLink}
              readOnly
              className="w-full px-4 py-3 border-3 border-gray-300 dark:border-gray-600 rounded-xl dark:bg-gray-700 dark:text-gray-200 text-sm font-mono shadow-lg"
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
            className="w-full px-6 py-4 bg-blue-500 text-white rounded-xl hover:bg-blue-600 mb-6 shadow-xl font-bold text-lg transition-all hover:scale-105 active:scale-95"
          >
            📋 Копировать ссылку
          </button>
          <div className="text-center">
            <div className="animate-spin rounded-full h-16 w-16 border-b-4 border-blue-500 mx-auto mb-4"></div>
            <p className="text-gray-600 dark:text-gray-400 font-semibold text-lg">Ожидание противника...</p>
          </div>
        </div>
      </div>
    )
  }

  // Экран создания игры
  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-blue-50 via-sky-50 to-cyan-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900">
      <div className="bg-white/95 dark:bg-gray-800/95 backdrop-blur-sm rounded-2xl shadow-2xl p-8 max-w-lg w-full border-4 border-blue-300 dark:border-blue-700">
        <div className="flex flex-wrap items-center gap-2 mb-4 bg-white/90 dark:bg-gray-800/80 px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700">
          <span className="text-sm text-gray-600 dark:text-gray-300">Код комнаты:</span>
          <span className="font-mono font-bold text-blue-600 dark:text-blue-300">{roomCode || '—'}</span>
          <button
            onClick={handleJoinByCode}
            className="px-3 py-1 text-sm bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 transition-all"
          >
            ➕ Подключиться по коду
          </button>
        </div>
        <h1 className="text-5xl font-bold mb-8 text-center text-gray-800 dark:text-gray-200 drop-shadow-lg">
          ⚓ Морской бой
        </h1>
        
        <div className="mb-8">
          <label className="block text-xl font-bold mb-4 text-gray-800 dark:text-gray-200">Режим игры:</label>
          <div className="space-y-3">
            {[
              { mode: 'full', name: 'Классика (10×10)', desc: '1×4, 2×3, 3×2, 4×1' },
              { mode: 'classic', name: 'Обычный (8×8)', desc: '2×3, 2×2, 4×1' },
              { mode: 'fast', name: 'Быстрый (6×6)', desc: '1×3, 1×2, 2×1' }
            ].map(({ mode, name, desc }) => (
              <button
                key={mode}
                onClick={() => setSelectedMode(mode)}
                className={`w-full px-6 py-4 rounded-xl border-3 transition-all shadow-lg ${
                  selectedMode === mode
                    ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/30 shadow-xl scale-105 ring-4 ring-blue-200 dark:ring-blue-800'
                    : 'border-gray-300 dark:border-gray-600 hover:border-blue-300 dark:hover:border-blue-700 hover:shadow-xl'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="text-left">
                    <div className="font-bold text-lg text-gray-800 dark:text-gray-200">{name}</div>
                    <div className="text-sm text-gray-600 dark:text-gray-400">{desc}</div>
                  </div>
                  {selectedMode === mode && (
                    <span className="text-blue-500 text-3xl font-bold">✓</span>
                  )}
                </div>
              </button>
            ))}
          </div>
        </div>

        <div className="mb-8">
          <label className="block text-xl font-bold mb-4 text-gray-800 dark:text-gray-200">Таймер:</label>
          <div className="flex gap-3">
            <button
              onClick={() => setSelectedTimer(false)}
              className={`flex-1 px-6 py-4 rounded-xl border-3 transition-all shadow-lg font-bold text-lg ${
                !selectedTimer
                  ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/30 shadow-xl scale-105 ring-4 ring-blue-200 dark:ring-blue-800'
                  : 'border-gray-300 dark:border-gray-600 hover:border-blue-300 dark:hover:border-blue-700'
              }`}
            >
              {!selectedTimer && '✓ '}Без таймера
            </button>
            <button
              onClick={() => setSelectedTimer(true)}
              className={`flex-1 px-6 py-4 rounded-xl border-3 transition-all shadow-lg font-bold text-lg ${
                selectedTimer
                  ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/30 shadow-xl scale-105 ring-4 ring-blue-200 dark:ring-blue-800'
                  : 'border-gray-300 dark:border-gray-600 hover:border-blue-300 dark:hover:border-blue-700'
              }`}
            >
              {selectedTimer && '✓ '}С таймером
            </button>
          </div>
        </div>

        <button
          onClick={handleCreate}
          disabled={creating}
          className="w-full px-6 py-5 bg-blue-500 text-white rounded-xl hover:bg-blue-600 disabled:opacity-50 font-bold text-xl shadow-xl transition-all hover:scale-105 active:scale-95"
        >
          {creating ? '⏳ Создание...' : '🎮 Создать игру'}
        </button>
      </div>
    </div>
  )
}

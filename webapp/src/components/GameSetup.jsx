import { useState, useEffect } from 'react'
import Board from './Board'
import { api } from '../utils/api'

export default function GameSetup({ gameState, playerId, user, onStateUpdate, socket, onLeaveGame, onDeleteGame, onClearGame, isCreator }) {
  const [placingShip, setPlacingShip] = useState(null)
  const [placing, setPlacing] = useState(false)
  const [autoPlaced, setAutoPlaced] = useState(false)
  const [horizontal, setHorizontal] = useState(true)
  const [copied, setCopied] = useState(false)
  const roomCode = (typeof window !== 'undefined' && localStorage.getItem('roomCode')) || ''
  const urlParams = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null
  const botParam = (urlParams && urlParams.get('bot')) || 'seabattles_game_bot'
  const shareLink = roomCode ? `https://t.me/${botParam.replace('@', '')}?start=room-${roomCode}` : null

  // Слушаем WebSocket обновления для синхронизации состояния
  useEffect(() => {
    if (!socket || !gameState?.id) return

    const handleGameState = (state) => {
      if (!state || state.id !== gameState.id) return
      if (state.player_id && playerId && state.player_id !== playerId) return

      console.log('GameSetup: получено обновление game_state через WebSocket', { 
        gameId: state.id, 
        phase: state.phase,
        player_id: state.player_id
      })
      if (onStateUpdate) onStateUpdate(state)
    }

    socket.on('game_state', handleGameState)

    return () => {
      socket.off('game_state', handleGameState)
    }
  }, [socket, gameState?.id, playerId, onStateUpdate])

  if (!gameState || !gameState.id || !playerId || !gameState.players) {
    return <div className="flex items-center justify-center min-h-screen">Загрузка...</div>
  }

  const myPlayer = gameState.players[playerId]
  if (!myPlayer) {
    return <div className="flex items-center justify-center min-h-screen">Ошибка: игрок не найден</div>
  }

  // Проверяем наличие board
  if (!myPlayer.board || !Array.isArray(myPlayer.board) || myPlayer.board.length === 0) {
    return <div className="flex items-center justify-center min-h-screen">Загрузка поля...</div>
  }

  const handleAutoPlace = async () => {
    if (!confirm('Автоматически расставить все корабли? Текущая расстановка будет удалена.')) {
      return
    }

    try {
      setPlacing(true)
      const res = await api.post(`/api/game/${gameState.id}/auto-place`, {
        player_id: playerId
      })
      if (res.game_state) {
        onStateUpdate(res.game_state)
        setAutoPlaced(true)
      }
    } catch (err) {
      alert(err.message || 'Ошибка')
    } finally {
      setPlacing(false)
    }
  }

  const handlePlaceShip = async (row, col) => {
    if (!placingShip || placing) return

    try {
      setPlacing(true)
      const res = await api.post(`/api/game/${gameState.id}/place-ship`, {
        size: placingShip,
        row,
        col,
        horizontal: horizontal,
        player_id: playerId
      })
      if (res.game_state) {
        onStateUpdate(res.game_state)
        setPlacingShip(null)
      }
    } catch (err) {
      alert(err.message || 'Невозможно разместить')
    } finally {
      setPlacing(false)
    }
  }

  const handleRemoveShip = async (shipIndex) => {
    if (!confirm('Удалить этот корабль? Он вернется в список доступных для размещения.')) return

    try {
      setPlacing(true)
      const res = await api.post(`/api/game/${gameState.id}/remove-ship`, {
        ship_index: shipIndex,
        player_id: playerId
      })
      if (res.game_state) {
        onStateUpdate(res.game_state)
      }
    } catch (err) {
      alert(err.message || 'Ошибка удаления корабля')
    } finally {
      setPlacing(false)
    }
  }

  const handleReady = async () => {
    // Проверяем, все ли корабли размещены
    const shipsToPlace = gameState.ships_to_place || []
    if (shipsToPlace.length > 0) {
      alert(`Не все корабли размещены! Осталось разместить: ${shipsToPlace.map(s => `${s.count}×${s.size}`).join(', ')}`)
      return
    }

    if (!confirm('Готовы начать игру? После подтверждения начнется бой.')) return

    try {
      const res = await api.post(`/api/game/${gameState.id}/ready`, {
        player_id: playerId
      })
      if (res.game_state) {
        onStateUpdate(res.game_state)
      }
    } catch (err) {
      alert(err.message || 'Ошибка')
    }
  }

  const shipsToPlace = gameState.ships_to_place || []
  const allShipsPlaced = shipsToPlace.length === 0

  const handleJoinByCode = () => {
    const code = prompt('Введите код комнаты (например, ABCD1234):', roomCode || '')
    if (!code) return
    const normalized = code.trim().toUpperCase()
    localStorage.setItem('roomCode', normalized)
    const bot = botParam.replace('@', '')
    const base = window.location.origin + window.location.pathname
    window.location.href = `${base}?startapp=room-${normalized}&bot=${bot}`
  }

  const handleShare = async () => {
    if (!shareLink) return
    try {
      // Копируем в буфер
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(shareLink)
      }
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      console.error('Share error', err)
    }
  }

  return (
    <div className="min-h-screen p-4 pb-20 bg-gradient-to-b from-blue-50 via-sky-50 to-cyan-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900">
      <div className="max-w-4xl mx-auto">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
          <div className="flex items-center gap-2 bg-white/80 dark:bg-gray-800/80 px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700">
            <span className="text-sm text-gray-600 dark:text-gray-300">Код комнаты:</span>
            <span className="font-mono font-bold text-blue-600 dark:text-blue-300">{roomCode || '—'}</span>
            <button
              onClick={handleShare}
              disabled={!shareLink}
              className="px-3 py-1 text-sm bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50 transition-all"
            >
              🔗 Поделиться
            </button>
            {copied && <span className="text-xs text-green-500">Скопировано</span>}
            <button
              onClick={handleJoinByCode}
              className="px-3 py-1 text-sm bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 transition-all"
            >
              ➕ Подключиться по коду
            </button>
          </div>
          <div className="flex gap-2">
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
            <button
              onClick={onClearGame}
              className="px-3 py-2 text-sm bg-orange-500 text-white rounded-lg hover:bg-orange-600 transition-all"
            >
              🧹 Очистить игру
            </button>
          </div>
        </div>
        <h1 className="text-4xl font-bold mb-6 text-center text-gray-800 dark:text-gray-200 drop-shadow-lg">
          ⚓ Расстановка кораблей
        </h1>

        {autoPlaced && (
          <div className="bg-green-100 dark:bg-green-900/40 border-3 border-green-500 rounded-xl p-4 mb-6 shadow-lg">
            <p className="text-green-800 dark:text-green-200 font-bold text-center mb-2 text-lg">
              ✅ Корабли расставлены автоматически!
            </p>
            <p className="text-sm text-green-700 dark:text-green-300 text-center">
              Вы можете редактировать расстановку или нажать "Готово"
            </p>
          </div>
        )}

        <div className="bg-white/90 dark:bg-gray-800/90 backdrop-blur-sm rounded-2xl shadow-2xl p-6 mb-6 border-2 border-blue-200 dark:border-blue-700">
          <h2 className="text-xl font-bold mb-4 text-gray-800 dark:text-gray-200">Корабли для размещения:</h2>
          <div className="flex flex-wrap gap-3 mb-4">
            {shipsToPlace.map((ship, idx) => (
              <button
                key={idx}
                onClick={() => setPlacingShip(ship.size)}
                disabled={placing}
                className={`px-5 py-3 rounded-xl font-bold text-lg transition-all shadow-lg ${
                  placingShip === ship.size
                    ? 'bg-blue-600 text-white scale-110 shadow-xl ring-4 ring-blue-300'
                    : 'bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200 hover:bg-gray-300 dark:hover:bg-gray-600'
                } disabled:opacity-50`}
              >
                {ship.size}×{ship.count}
              </button>
            ))}
          </div>

          {placingShip && (
            <div className="mt-4 pt-4 border-t-2 border-gray-200 dark:border-gray-700">
              <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 sm:gap-4">
                <span className="text-gray-700 dark:text-gray-300 font-semibold whitespace-nowrap">Ориентация:</span>
                <div className="flex gap-3 w-full sm:w-auto">
                  <button
                    onClick={() => setHorizontal(true)}
                    className={`flex-1 sm:flex-none px-4 py-2 rounded-lg font-semibold transition-all ${
                      horizontal
                        ? 'bg-blue-500 text-white shadow-lg'
                        : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300'
                    }`}
                  >
                    ➡ Горизонтально
                  </button>
                  <button
                    onClick={() => setHorizontal(false)}
                    className={`flex-1 sm:flex-none px-4 py-2 rounded-lg font-semibold transition-all ${
                      !horizontal
                        ? 'bg-blue-500 text-white shadow-lg'
                        : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300'
                    }`}
                  >
                    ⬇ Вертикально
                  </button>
                </div>
              </div>
            </div>
          )}

          {myPlayer.ships && myPlayer.ships.length > 0 && (
            <div className="mt-4 pt-4 border-t-2 border-gray-200 dark:border-gray-700">
              <h3 className="text-sm font-bold mb-3 text-gray-700 dark:text-gray-300">Размещенные корабли:</h3>
              <div className="flex flex-wrap gap-2">
                {myPlayer.ships.map((ship, idx) => (
                  <button
                    key={idx}
                    onClick={() => handleRemoveShip(idx)}
                    disabled={placing}
                    className="px-4 py-2 bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300 rounded-lg text-sm font-semibold hover:bg-red-200 dark:hover:bg-red-900/60 disabled:opacity-50 transition-all shadow-md"
                  >
                    ✕ Удалить {ship.size}×1
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="flex justify-center mb-6">
          <div className="bg-white/90 dark:bg-gray-800/90 backdrop-blur-sm rounded-2xl shadow-2xl p-6 border-2 border-blue-200 dark:border-blue-700">
            <Board
              board={myPlayer.board}
              size={gameState.config?.size || 10}
              showShips={true}
              interactive={!!placingShip && !placing}
              onCellClick={handlePlaceShip}
            />
          </div>
        </div>

        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <button
            onClick={handleAutoPlace}
            disabled={placing}
            className="px-8 py-4 bg-green-500 text-white rounded-xl hover:bg-green-600 disabled:opacity-50 shadow-xl font-bold text-lg transition-all hover:scale-105 active:scale-95"
          >
            {placing ? '⏳ Расстановка...' : '🎲 Авто-расстановка'}
          </button>
          
          {allShipsPlaced && (
            <button
              onClick={handleReady}
              disabled={placing || myPlayer.ready}
              className="px-8 py-4 bg-blue-500 text-white rounded-xl hover:bg-blue-600 disabled:opacity-50 shadow-xl font-bold text-lg transition-all hover:scale-105 active:scale-95"
            >
              {myPlayer.ready ? '✅ Готов' : '✅ Готово'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

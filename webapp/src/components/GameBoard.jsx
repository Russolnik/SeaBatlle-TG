import { useState, useEffect, useRef } from 'react'
import Board from './Board'
import GameInfo from './GameInfo'
import { api } from '../utils/api'

export default function GameBoard({ gameState, playerId, user, onStateUpdate, socket, onLeaveGame, onDeleteGame, isCreator }) {
  const [isMyTurn, setIsMyTurn] = useState(false)
  const [attacking, setAttacking] = useState(false)
  const containerRef = useRef(null)
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

      console.log('GameBoard: получено обновление game_state через WebSocket', { 
        gameId: state.id, 
        phase: state.phase,
        current_player: state.current_player,
        player_id: state.player_id
      })
      if (onStateUpdate) onStateUpdate(state)
    }

    socket.on('game_state', handleGameState)

    return () => {
      socket.off('game_state', handleGameState)
    }
  }, [socket, gameState?.id, playerId, onStateUpdate])

  useEffect(() => {
    if (gameState && playerId) {
      const isTurn = gameState.current_player === playerId
      setIsMyTurn(isTurn)
      console.log('GameBoard: обновление isMyTurn', { 
        current_player: gameState.current_player, 
        playerId, 
        isMyTurn: isTurn 
      })
    }
  }, [gameState?.current_player, playerId])

  // Предотвращаем скролл наверх при обновлении
  useEffect(() => {
    if (containerRef.current) {
      const scrollY = window.scrollY
      requestAnimationFrame(() => {
        window.scrollTo(0, scrollY)
      })
    }
  }, [gameState])

  if (!gameState || !gameState.id || !playerId || !gameState.players) {
    return <div className="flex items-center justify-center min-h-screen">Загрузка...</div>
  }

  const myPlayer = gameState.players[playerId]
  const opponentId = playerId === 'p1' ? 'p2' : 'p1'
  const opponent = gameState.players[opponentId]

  if (!myPlayer) {
    return <div className="flex items-center justify-center min-h-screen">Ошибка: игрок не найден</div>
  }

  // Проверяем наличие board и attacks
  if (!myPlayer.board || !Array.isArray(myPlayer.board) || myPlayer.board.length === 0) {
    return <div className="flex items-center justify-center min-h-screen">Загрузка поля...</div>
  }

  if (!myPlayer.attacks || !Array.isArray(myPlayer.attacks) || myPlayer.attacks.length === 0) {
    return <div className="flex items-center justify-center min-h-screen">Загрузка поля...</div>
  }

  const handleAttack = async (row, col) => {
    if (!isMyTurn || attacking) return

    try {
      setAttacking(true)
      const res = await api.post(`/api/game/${gameState.id}/attack`, {
        row,
        col,
        player_id: playerId
      })
      
      if (res.game_state) {
        onStateUpdate(res.game_state)
      }
    } catch (err) {
      alert(err.message || 'Ошибка атаки')
    } finally {
      setAttacking(false)
    }
  }

  const handleSurrender = async () => {
    if (!confirm('Сдаться?')) return

    try {
      await api.post(`/api/game/${gameState.id}/surrender`, {
        player_id: playerId
      })
    } catch (err) {
      alert(err.message || 'Ошибка')
    }
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

  return (
    <div ref={containerRef} className="min-h-screen p-4 pb-20 bg-gradient-to-b from-blue-50 via-sky-50 to-cyan-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900">
      <div className="max-w-5xl mx-auto">
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
            <button
              onClick={() => {
                const code = prompt('Введите код комнаты (например, ABCD1234):', roomCode || '')
                if (!code) return
                const normalized = code.trim().toUpperCase()
                localStorage.setItem('roomCode', normalized)
                const bot = botParam.replace('@', '')
                const base = window.location.origin + window.location.pathname
                window.location.href = `${base}?startapp=room-${normalized}&bot=${bot}`
              }}
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
          </div>
        </div>
        <GameInfo gameState={gameState} playerId={playerId} isMyTurn={isMyTurn} />

        <div className="grid grid-cols-1 gap-8 mt-6">
          {/* Поле противника - СВЕРХУ */}
          <div className="bg-white/95 dark:bg-gray-800/95 backdrop-blur-sm rounded-2xl shadow-2xl p-6 border-4 border-blue-300 dark:border-blue-700">
            <h2 className="text-2xl font-bold mb-4 text-center text-gray-800 dark:text-gray-200 drop-shadow-lg">
              🎯 Поле противника
            </h2>
            <div className="flex justify-center">
              <Board
                board={myPlayer.attacks}
                size={gameState.config?.size || 10}
                interactive={isMyTurn && !attacking}
                onCellClick={handleAttack}
              />
            </div>
            {attacking && (
              <div className="text-center mt-4 text-blue-600 dark:text-blue-400 text-lg font-bold">
                ⚡ Атака...
              </div>
            )}
          </div>

          {/* Ваше поле - СНИЗУ */}
          <div className="bg-white/95 dark:bg-gray-800/95 backdrop-blur-sm rounded-2xl shadow-2xl p-6 border-4 border-blue-300 dark:border-blue-700">
            <h2 className="text-2xl font-bold mb-4 text-center text-gray-800 dark:text-gray-200 drop-shadow-lg">
              📍 Ваше поле
            </h2>
            <div className="flex justify-center">
              <Board
                board={myPlayer.board}
                size={gameState.config?.size || 10}
                showShips={true}
              />
            </div>
          </div>
        </div>

        <div className="mt-8 flex justify-center">
          <button
            onClick={handleSurrender}
            disabled={attacking}
            className="px-10 py-4 bg-red-500 text-white rounded-xl hover:bg-red-600 disabled:opacity-50 shadow-2xl font-bold text-lg transition-all hover:scale-105 active:scale-95"
          >
            🚩 Сдаться
          </button>
        </div>
      </div>
    </div>
  )
}

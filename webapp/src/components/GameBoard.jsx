import { useState, useEffect } from 'react'
import Board from './Board'
import GameInfo from './GameInfo'
import { api } from '../utils/api'

export default function GameBoard({ gameState, playerId, onStateUpdate, socket }) {
  const [isMyTurn, setIsMyTurn] = useState(false)
  const [attacking, setAttacking] = useState(false)

  useEffect(() => {
    if (gameState) {
      setIsMyTurn(gameState.current_player === playerId)
    }
  }, [gameState, playerId])

  if (!gameState || !playerId || !gameState.players) {
    return <div className="flex items-center justify-center min-h-screen">Загрузка...</div>
  }

  const myPlayer = gameState.players[playerId]
  const opponentId = playerId === 'p1' ? 'p2' : 'p1'
  const opponent = gameState.players[opponentId]

  if (!myPlayer) {
    return <div className="flex items-center justify-center min-h-screen">Ошибка: игрок не найден</div>
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

  return (
    <div className="min-h-screen p-4 pb-20 bg-gradient-to-br from-blue-50 to-blue-100 dark:from-gray-900 dark:to-gray-800">
      <div className="max-w-6xl mx-auto">
        <GameInfo gameState={gameState} playerId={playerId} isMyTurn={isMyTurn} />

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl p-4">
            <h2 className="text-xl font-bold mb-4 text-center text-gray-800 dark:text-gray-200">
              Ваше поле
            </h2>
            <div className="flex justify-center">
              <Board
                board={myPlayer.board}
                size={gameState.config?.size || 10}
                showShips={true}
              />
            </div>
          </div>

          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl p-4">
            <h2 className="text-xl font-bold mb-4 text-center text-gray-800 dark:text-gray-200">
              Поле противника
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
              <div className="text-center mt-2 text-blue-600 dark:text-blue-400">
                Атака...
              </div>
            )}
          </div>
        </div>

        <div className="mt-6 flex justify-center">
          <button
            onClick={handleSurrender}
            disabled={attacking}
            className="px-8 py-3 bg-red-500 text-white rounded-xl hover:bg-red-600 disabled:opacity-50 shadow-lg font-semibold transition-all"
          >
            🚩 Сдаться
          </button>
        </div>
      </div>
    </div>
  )
}

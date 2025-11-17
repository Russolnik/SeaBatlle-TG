import { useState, useEffect } from 'react'
import Board from './Board'
import GameInfo from './GameInfo'
import { api } from '../utils/api'

export default function GameBoard({ gameState, playerId, onStateUpdate, socket }) {
  const [selectedCell, setSelectedCell] = useState(null)
  const [isMyTurn, setIsMyTurn] = useState(false)

  useEffect(() => {
    if (gameState) {
      const currentPlayer = gameState.current_player
      setIsMyTurn(currentPlayer === playerId)
    }
  }, [gameState, playerId])

  const handleAttack = async (row, col) => {
    if (!isMyTurn) return
    if (selectedCell) return // Уже выбрана клетка

    try {
      setSelectedCell({ row, col })
      
      const response = await api.post(`/api/game/${gameState.id}/attack`, {
        row,
        col,
        player_id: playerId
      })

      // Обновляем состояние
      if (response.game_state) {
        onStateUpdate(response.game_state)
      }
    } catch (error) {
      console.error('Ошибка атаки:', error)
      alert(error.message || 'Ошибка при атаке')
    } finally {
      setSelectedCell(null)
    }
  }

  const handleSurrender = async () => {
    if (!confirm('Вы уверены, что хотите сдаться?')) return

    try {
      await api.post(`/api/game/${gameState.id}/surrender`, {
        player_id: playerId
      })
    } catch (error) {
      console.error('Ошибка сдачи:', error)
      alert(error.message || 'Ошибка при сдаче')
    }
  }

  if (!gameState) return null

  const myPlayer = gameState.players[playerId]
  const opponentId = playerId === 'p1' ? 'p2' : 'p1'
  const opponent = gameState.players[opponentId]

  if (!myPlayer || !opponent) return null

  return (
    <div className="min-h-screen p-4 pb-20">
      <div className="max-w-6xl mx-auto">
        <GameInfo
          gameState={gameState}
          playerId={playerId}
          isMyTurn={isMyTurn}
        />

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
          {/* Мое поле */}
          <div className="fade-in">
            <h2 className="text-lg font-bold mb-2 text-center">
              Ваше поле
            </h2>
            <Board
              board={myPlayer.board}
              size={gameState.config.size}
              interactive={false}
              showShips={true}
            />
          </div>

          {/* Поле противника */}
          <div className="fade-in">
            <h2 className="text-lg font-bold mb-2 text-center">
              Поле противника
            </h2>
            <Board
              board={myPlayer.attacks}
              size={gameState.config.size}
              interactive={isMyTurn}
              showShips={false}
              onCellClick={handleAttack}
              selectedCell={selectedCell}
            />
          </div>
        </div>

        <div className="mt-6 flex justify-center gap-4">
          <button
            onClick={handleSurrender}
            className="px-6 py-3 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors"
          >
            🚩 Сдаться
          </button>
        </div>
      </div>
    </div>
  )
}


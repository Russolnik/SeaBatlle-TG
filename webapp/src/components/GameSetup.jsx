import { useState } from 'react'
import Board from './Board'
import { api } from '../utils/api'

export default function GameSetup({ gameState, playerId, onStateUpdate, socket }) {
  const [placingShip, setPlacingShip] = useState(null)
  const [placing, setPlacing] = useState(false)

  if (!gameState || !playerId || !gameState.players) {
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
    try {
      setPlacing(true)
      const res = await api.post(`/api/game/${gameState.id}/auto-place`, {
        player_id: playerId
      })
      if (res.game_state) {
        onStateUpdate(res.game_state)
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
        horizontal: true,
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

  const shipsToPlace = gameState.ships_to_place || []

  return (
    <div className="min-h-screen p-4 pb-20">
      <div className="max-w-2xl mx-auto">
        <h1 className="text-2xl font-bold mb-4 text-center">Расстановка кораблей</h1>

        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-4 mb-4">
          <h2 className="text-lg font-bold mb-2">Корабли для размещения:</h2>
          <div className="flex flex-wrap gap-2">
            {shipsToPlace.map((ship, idx) => (
              <button
                key={idx}
                onClick={() => setPlacingShip(ship.size)}
                disabled={placing}
                className={`px-4 py-2 rounded ${
                  placingShip === ship.size
                    ? 'bg-blue-500 text-white'
                    : 'bg-gray-200 dark:bg-gray-700'
                } disabled:opacity-50`}
              >
                {ship.size}×{ship.count}
              </button>
            ))}
          </div>
        </div>

        <div className="flex justify-center mb-4">
          <Board
            board={myPlayer.board}
            size={gameState.config?.size || 10}
            showShips={true}
            interactive={!!placingShip && !placing}
            onCellClick={handlePlaceShip}
          />
        </div>

        <div className="flex justify-center">
          <button
            onClick={handleAutoPlace}
            disabled={placing}
            className="px-6 py-3 bg-green-500 text-white rounded-lg hover:bg-green-600 disabled:opacity-50"
          >
            {placing ? 'Расстановка...' : '🎲 Авто-расстановка'}
          </button>
        </div>
      </div>
    </div>
  )
}

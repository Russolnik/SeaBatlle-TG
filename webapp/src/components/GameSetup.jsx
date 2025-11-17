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
    <div className="min-h-screen p-4 pb-20 bg-gradient-to-br from-blue-50 to-blue-100 dark:from-gray-900 dark:to-gray-800">
      <div className="max-w-3xl mx-auto">
        <h1 className="text-3xl font-bold mb-6 text-center text-gray-800 dark:text-gray-200">
          Расстановка кораблей
        </h1>

        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl p-6 mb-6">
          <h2 className="text-lg font-bold mb-4 text-gray-800 dark:text-gray-200">Корабли для размещения:</h2>
          <div className="flex flex-wrap gap-3">
            {shipsToPlace.map((ship, idx) => (
              <button
                key={idx}
                onClick={() => setPlacingShip(ship.size)}
                disabled={placing}
                className={`px-6 py-3 rounded-lg font-semibold transition-all ${
                  placingShip === ship.size
                    ? 'bg-blue-500 text-white shadow-lg scale-105'
                    : 'bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200 hover:bg-gray-300 dark:hover:bg-gray-600'
                } disabled:opacity-50`}
              >
                {ship.size}×{ship.count}
              </button>
            ))}
          </div>
        </div>

        <div className="flex justify-center mb-6">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl p-4">
            <Board
              board={myPlayer.board}
              size={gameState.config?.size || 10}
              showShips={true}
              interactive={!!placingShip && !placing}
              onCellClick={handlePlaceShip}
            />
          </div>
        </div>

        <div className="flex justify-center gap-4">
          <button
            onClick={handleAutoPlace}
            disabled={placing}
            className="px-8 py-4 bg-green-500 text-white rounded-xl hover:bg-green-600 disabled:opacity-50 shadow-lg font-semibold transition-all"
          >
            {placing ? 'Расстановка...' : '🎲 Авто-расстановка'}
          </button>
        </div>
      </div>
    </div>
  )
}

import { useState, useEffect } from 'react'
import Board from './Board'
import { api } from '../utils/api'

export default function GameSetup({ gameState, playerId, onStateUpdate, socket }) {
  const [placingShip, setPlacingShip] = useState(null)
  const [shipPosition, setShipPosition] = useState({ row: 0, col: 0, horizontal: true })

  const handleAutoPlace = async () => {
    try {
      const response = await api.post(`/api/game/${gameState.id}/auto-place`, {
        player_id: playerId
      })
      if (response.game_state) {
        onStateUpdate(response.game_state)
      }
    } catch (error) {
      console.error('Ошибка авто-расстановки:', error)
      alert(error.message || 'Ошибка при авто-расстановке')
    }
  }

  const handlePlaceShip = async (row, col, horizontal) => {
    if (!placingShip) return

    try {
      const response = await api.post(`/api/game/${gameState.id}/place-ship`, {
        size: placingShip,
        row,
        col,
        horizontal,
        player_id: playerId
      })

      if (response.game_state) {
        onStateUpdate(response.game_state)
        setPlacingShip(null)
      }
    } catch (error) {
      console.error('Ошибка размещения корабля:', error)
      alert(error.message || 'Невозможно разместить корабль здесь')
    }
  }

  const handleCellClick = (row, col) => {
    if (!placingShip) return
    handlePlaceShip(row, col, shipPosition.horizontal)
  }

  if (!gameState || !gameState.players) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p className="text-red-500">Ошибка: данные игры не найдены</p>
      </div>
    )
  }

  const myPlayer = gameState.players[playerId]
  if (!myPlayer) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p className="text-red-500">Ошибка: ваш игрок не найден</p>
      </div>
    )
  }

  if (!myPlayer.board || !Array.isArray(myPlayer.board)) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p className="text-red-500">Ошибка: поле не инициализировано</p>
      </div>
    )
  }

  const shipsToPlace = gameState.ships_to_place || []

  return (
    <div className="min-h-screen p-4 pb-20">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-2xl font-bold mb-4 text-center">Расстановка кораблей</h1>

        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-4 mb-4">
          <h2 className="text-lg font-bold mb-2">Корабли для размещения:</h2>
          <div className="flex flex-wrap gap-2">
            {shipsToPlace.map((ship, idx) => (
              <button
                key={idx}
                onClick={() => setPlacingShip(ship.size)}
                className={`px-4 py-2 rounded ${
                  placingShip === ship.size
                    ? 'bg-blue-500 text-white'
                    : 'bg-gray-200 dark:bg-gray-700'
                }`}
              >
                {ship.size}×{ship.count > 0 ? ship.count : '✓'}
              </button>
            ))}
          </div>
        </div>

        <div className="flex justify-center mb-4">
          <Board
            board={myPlayer.board}
            size={gameState.config.size}
            interactive={!!placingShip}
            showShips={true}
            onCellClick={handleCellClick}
          />
        </div>

        <div className="flex justify-center gap-4">
          <button
            onClick={() => setShipPosition(prev => ({ ...prev, horizontal: !prev.horizontal }))}
            className="px-6 py-3 bg-blue-500 text-white rounded-lg hover:bg-blue-600"
          >
            ↻ Повернуть
          </button>
          <button
            onClick={handleAutoPlace}
            className="px-6 py-3 bg-green-500 text-white rounded-lg hover:bg-green-600"
          >
            🎲 Авто-расстановка
          </button>
        </div>
      </div>
    </div>
  )
}


import { useState } from 'react'
import Board from './Board'
import { api } from '../utils/api'

export default function GameSetup({ gameState, playerId, onStateUpdate, socket }) {
  const [placingShip, setPlacingShip] = useState(null)
  const [placing, setPlacing] = useState(false)
  const [autoPlaced, setAutoPlaced] = useState(false)

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

  const handleRemoveShip = async (shipIndex) => {
    if (!confirm('Удалить этот корабль?')) return

    try {
      setPlacing(true)
      const ship = myPlayer.ships[shipIndex]
      if (ship && ship.cells) {
        // Очищаем клетки корабля на доске локально
        const newBoard = myPlayer.board.map(row => [...row])
        for (const [r, c] of ship.cells) {
          if (r < newBoard.length && c < newBoard[r].length) {
            newBoard[r][c] = '🌊'
          }
        }
        const newShips = [...myPlayer.ships]
        newShips.splice(shipIndex, 1)
        
        // Обновляем локально
        const updatedPlayer = {
          ...myPlayer,
          board: newBoard,
          ships: newShips,
          ready: false
        }
        onStateUpdate({
          ...gameState,
          players: {
            ...gameState.players,
            [playerId]: updatedPlayer
          }
        })
      }
    } catch (err) {
      alert(err.message || 'Ошибка')
    } finally {
      setPlacing(false)
    }
  }

  const handleReady = async () => {
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

  return (
    <div className="min-h-screen p-4 pb-20 bg-gradient-to-b from-blue-50 to-blue-100 dark:from-gray-900 dark:to-gray-800">
      <div className="max-w-3xl mx-auto">
        <h1 className="text-3xl font-bold mb-6 text-center text-gray-800 dark:text-gray-200">
          Расстановка кораблей
        </h1>

        {autoPlaced && (
          <div className="bg-green-100 dark:bg-green-900/30 border-2 border-green-500 rounded-xl p-4 mb-4">
            <p className="text-green-800 dark:text-green-200 font-semibold text-center mb-2">
              ✅ Корабли расставлены автоматически!
            </p>
            <p className="text-sm text-green-700 dark:text-green-300 text-center">
              Вы можете редактировать расстановку или нажать "Готово"
            </p>
          </div>
        )}

        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl p-4 mb-4">
          <h2 className="text-lg font-bold mb-3 text-gray-800 dark:text-gray-200">Корабли для размещения:</h2>
          <div className="flex flex-wrap gap-2 mb-3">
            {shipsToPlace.map((ship, idx) => (
              <button
                key={idx}
                onClick={() => setPlacingShip(ship.size)}
                disabled={placing}
                className={`px-4 py-2 rounded-lg font-semibold transition-all ${
                  placingShip === ship.size
                    ? 'bg-blue-500 text-white shadow-lg scale-105'
                    : 'bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200 hover:bg-gray-300 dark:hover:bg-gray-600'
                } disabled:opacity-50`}
              >
                {ship.size}×{ship.count}
              </button>
            ))}
          </div>

          {myPlayer.ships && myPlayer.ships.length > 0 && (
            <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
              <h3 className="text-sm font-semibold mb-2 text-gray-700 dark:text-gray-300">Размещенные корабли:</h3>
              <div className="flex flex-wrap gap-2">
                {myPlayer.ships.map((ship, idx) => (
                  <button
                    key={idx}
                    onClick={() => handleRemoveShip(idx)}
                    disabled={placing}
                    className="px-3 py-1 bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 rounded-lg text-sm hover:bg-red-200 dark:hover:bg-red-900/50 disabled:opacity-50 transition-all"
                  >
                    ✕ {ship.size}×1
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="flex justify-center mb-4">
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

        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <button
            onClick={handleAutoPlace}
            disabled={placing}
            className="px-6 py-3 bg-green-500 text-white rounded-xl hover:bg-green-600 disabled:opacity-50 shadow-lg font-semibold transition-all"
          >
            {placing ? '⏳ Расстановка...' : '🎲 Авто-расстановка'}
          </button>
          
          {allShipsPlaced && (
            <button
              onClick={handleReady}
              disabled={placing || myPlayer.ready}
              className="px-6 py-3 bg-blue-500 text-white rounded-xl hover:bg-blue-600 disabled:opacity-50 shadow-lg font-semibold transition-all"
            >
              {myPlayer.ready ? '✅ Готов' : '✅ Готово'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

export default function GameInfo({ gameState, playerId, isMyTurn }) {
  if (!gameState) return null

  const myPlayer = gameState.players[playerId]
  const opponentId = playerId === 'p1' ? 'p2' : 'p1'
  const opponent = gameState.players[opponentId]

  if (!myPlayer || !opponent) return null

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-4 mb-4">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <span className={`text-2xl ${isMyTurn ? 'animate-pulse' : ''}`}>
            {isMyTurn ? '👉' : '⏰'}
          </span>
          <span className="font-bold">
            {isMyTurn ? 'Ваш ход' : 'Ход противника'}
          </span>
        </div>

        {gameState.is_timed && gameState.time_remaining && (
          <div className="flex items-center gap-2">
            <span>⏱</span>
            <span className="font-mono">{formatTime(gameState.time_remaining)}</span>
          </div>
        )}

        <div className="flex gap-4 text-sm">
          <div>
            <span className="text-gray-600 dark:text-gray-400">Ваши корабли: </span>
            <span className="font-bold">{myPlayer.ships_remaining || 0}</span>
          </div>
          <div>
            <span className="text-gray-600 dark:text-gray-400">Корабли противника: </span>
            <span className="font-bold">{opponent.ships_remaining || 0}</span>
          </div>
        </div>
      </div>

      {gameState.last_move && (
        <div className="mt-2 text-sm text-gray-600 dark:text-gray-400">
          Последний ход: {gameState.last_move}
        </div>
      )}
    </div>
  )
}


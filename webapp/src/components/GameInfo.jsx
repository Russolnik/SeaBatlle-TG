export default function GameInfo({ gameState, playerId, isMyTurn }) {
  if (!gameState || !playerId || !gameState.players) return null

  const myPlayer = gameState.players[playerId]
  const opponentId = playerId === 'p1' ? 'p2' : 'p1'
  const opponent = gameState.players[opponentId]

  if (!myPlayer) return null

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-4 mb-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className={`text-2xl ${isMyTurn ? 'animate-pulse' : ''}`}>
            {isMyTurn ? '👉' : '⏰'}
          </span>
          <span className="font-bold">
            {isMyTurn ? 'Ваш ход' : 'Ход противника'}
          </span>
        </div>

        <div className="flex gap-4 text-sm">
          <div>
            <span className="text-gray-600 dark:text-gray-400">Ваши: </span>
            <span className="font-bold">{myPlayer?.ships_remaining ?? 0}</span>
          </div>
          {opponent && (
            <div>
              <span className="text-gray-600 dark:text-gray-400">Противник: </span>
              <span className="font-bold">{opponent?.ships_remaining ?? 0}</span>
            </div>
          )}
        </div>
      </div>

      {gameState.last_move && (
        <div className="mt-2 text-sm text-gray-600 dark:text-gray-400 font-semibold">
          {gameState.last_move}
        </div>
      )}
      
      {myPlayer?.ships && myPlayer.ships.length > 0 && (
        <div className="mt-3 pt-3 border-t border-gray-200 dark:border-gray-700">
          <div className="text-xs text-gray-600 dark:text-gray-400 mb-1">Подбитые корабли:</div>
          <div className="flex flex-wrap gap-1">
            {myPlayer.ships.map((ship, idx) => (
              <span
                key={idx}
                className={`px-2 py-1 rounded text-xs font-semibold ${
                  ship.destroyed
                    ? 'bg-red-500 text-white'
                    : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300'
                }`}
              >
                {ship.size}×1 {ship.destroyed ? '💥' : '✅'}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

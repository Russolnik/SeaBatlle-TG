export default function GameInfo({ gameState, playerId, isMyTurn }) {
  if (!gameState || !playerId || !gameState.players) return null

  const myPlayer = gameState.players[playerId]
  const opponentId = playerId === 'p1' ? 'p2' : 'p1'
  const opponent = gameState.players[opponentId]

  if (!myPlayer) return null

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl p-6 mb-6 border-2 border-blue-200 dark:border-blue-800">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className={`w-12 h-12 rounded-full flex items-center justify-center text-2xl ${
            isMyTurn 
              ? 'bg-green-500 animate-pulse' 
              : 'bg-gray-400 dark:bg-gray-600'
          }`}>
            {isMyTurn ? '👉' : '⏰'}
          </div>
          <div>
            <div className="text-sm text-gray-600 dark:text-gray-400">Текущий ход</div>
            <div className="text-xl font-bold text-gray-800 dark:text-gray-200">
              {isMyTurn ? 'Ваш ход' : 'Ход противника'}
            </div>
          </div>
        </div>

        <div className="flex gap-6 text-sm">
          <div className="bg-blue-100 dark:bg-blue-900/30 px-4 py-2 rounded-lg">
            <div className="text-gray-600 dark:text-gray-400 text-xs">Ваши корабли</div>
            <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">{myPlayer?.ships_remaining ?? 0}</div>
          </div>
          {opponent && (
            <div className="bg-red-100 dark:bg-red-900/30 px-4 py-2 rounded-lg">
              <div className="text-gray-600 dark:text-gray-400 text-xs">Противник</div>
              <div className="text-2xl font-bold text-red-600 dark:text-red-400">{opponent?.ships_remaining ?? 0}</div>
            </div>
          )}
        </div>
      </div>

      {gameState.last_move && (
        <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
          <div className="text-sm text-gray-600 dark:text-gray-400">
            Последний ход: <span className="font-semibold text-gray-800 dark:text-gray-200">{gameState.last_move}</span>
          </div>
        </div>
      )}
    </div>
  )
}

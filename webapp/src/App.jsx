import { useState, useEffect } from 'react'
import GameBoard from './components/GameBoard'
import GameSetup from './components/GameSetup'
import GameLobby from './components/GameLobby'
import { useTelegramAuth } from './hooks/useTelegramAuth'
import { useWebSocket } from './hooks/useWebSocket'
import { api } from './utils/api'

function App() {
  const [gameState, setGameState] = useState(null)
  const [gameId, setGameId] = useState(null)
  const [playerId, setPlayerId] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  
  const { user, authToken, loading: authLoading } = useTelegramAuth()
  const { socket, connected } = useWebSocket(gameId, authToken)

  // Получаем gameId из URL параметров
  useEffect(() => {
    if (authLoading) return // Ждем авторизации
    
    const params = new URLSearchParams(window.location.search)
    const id = params.get('gameId')
    const mode = params.get('mode') || 'full'  // По умолчанию режим 10×10 для веб-версии
    
    if (id) {
      setGameId(id)
      loadGameState(id)
    } else {
      // Создаем новую игру
      createNewGame(mode)
    }
  }, [authLoading])

  // Слушаем обновления через WebSocket
  useEffect(() => {
    if (!socket || !connected) return

    socket.on('game_state', (state) => {
      setGameState(state)
    })

    socket.on('move', (data) => {
      loadGameState(gameId)
    })

    socket.on('error', (error) => {
      setError(error.message)
    })

    return () => {
      socket.off('game_state')
      socket.off('move')
      socket.off('error')
    }
  }, [socket, connected, gameId])

  const createNewGame = async (mode) => {
    try {
      setLoading(true)
      const userData = user || { id: Date.now(), username: 'Player' }
      const response = await api.post('/api/game/create', {
        mode,
        is_timed: false,
        user_id: userData.id,
        username: userData.username || userData.first_name || `user_${userData.id}`
      })
      const { game_id, player_id } = response
      setGameId(game_id)
      setPlayerId(player_id)
      await loadGameState(game_id)
    } catch (err) {
      setError(err.message || 'Ошибка при создании игры')
    } finally {
      setLoading(false)
    }
  }

  const loadGameState = async (id) => {
    try {
      const userData = user || { id: Date.now() }
      const state = await api.get(`/api/game/${id}/state?player_id=${playerId || 'p1'}`)
      setGameState(state)
      if (state.player_id) {
        setPlayerId(state.player_id)
      }
    } catch (err) {
      // Если игра не найдена, пытаемся присоединиться
      if (err.message.includes('not found') || err.message.includes('404')) {
        try {
          const userData = user || { id: Date.now(), username: 'Player' }
          const joinResponse = await api.post(`/api/game/${id}/join`, {
            user_id: userData.id,
            username: userData.username || userData.first_name || `user_${userData.id}`
          })
          const { player_id, game_state } = joinResponse
          setPlayerId(player_id)
          setGameState(game_state)
        } catch (joinErr) {
          setError(joinErr.message || 'Ошибка при присоединении к игре')
        }
      } else {
        setError(err.message || 'Ошибка при загрузке игры')
      }
    }
  }

  if (loading || authLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
          <p className="text-gray-600 dark:text-gray-400">Загрузка...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-screen p-4">
        <div className="text-center bg-red-100 dark:bg-red-900 p-6 rounded-lg">
          <p className="text-red-800 dark:text-red-200">{error}</p>
          <button
            onClick={() => window.location.reload()}
            className="mt-4 px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
          >
            Перезагрузить
          </button>
        </div>
      </div>
    )
  }

  if (!gameState) {
    return <GameLobby gameId={gameId} onJoin={loadGameState} onCreateGame={createNewGame} user={user} />
  }

  // Если игра в процессе расстановки
  if (gameState.phase === 'setup') {
    return (
      <GameSetup
        gameState={gameState}
        playerId={playerId}
        onStateUpdate={setGameState}
        socket={socket}
      />
    )
  }

  // Если игра в процессе боя
  if (gameState.phase === 'battle') {
    return (
      <GameBoard
        gameState={gameState}
        playerId={playerId}
        onStateUpdate={setGameState}
        socket={socket}
      />
    )
  }

  return (
    <div className="flex items-center justify-center min-h-screen">
      <p>Ожидание...</p>
    </div>
  )
}

export default App


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
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  
  const { user, authToken, loading: authLoading } = useTelegramAuth()
  const { socket, connected } = useWebSocket(gameId, authToken)

  // Получаем gameId, roomCode и group_id из URL или localStorage
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const urlGameId = params.get('gameId')
    const urlGroupId = params.get('group_id')
    
    // Обработка startapp=room-XXXXXX (Mini App deep link)
    const startapp = params.get('startapp')
    if (startapp && startapp.startsWith('room-')) {
      const roomCode = startapp.replace('room-', '')
      localStorage.setItem('roomCode', roomCode)
      // roomCode будет использован при создании игры
    }
    
    if (urlGameId) {
      setGameId(urlGameId)
      // Сохраняем в localStorage
      localStorage.setItem('activeGameId', urlGameId)
    } else {
      // Проверяем localStorage
      const savedGameId = localStorage.getItem('activeGameId')
      if (savedGameId) {
        setGameId(savedGameId)
      }
    }
    
    // Сохраняем group_id в localStorage для использования при создании игры
    if (urlGroupId) {
      localStorage.setItem('group_id', urlGroupId)
    }
  }, [])

  // Загружаем активную игру после авторизации
  useEffect(() => {
    if (authLoading || !user) return
    
    // Если нет gameId - проверяем активную игру пользователя
    if (!gameId) {
      loadActiveGame()
    } else {
      loadGame()
    }
  }, [authLoading, user, gameId])

  // Слушаем WebSocket обновления
  useEffect(() => {
    if (!socket || !connected) return

    const handleGameState = (state) => {
      if (state && state.id) {
        // Сохраняем позицию скролла перед обновлением
        const scrollY = window.scrollY
        
        // Обновляем состояние игры
        setGameState(state)
        setGameId(state.id)
        localStorage.setItem('activeGameId', state.id)
        
        // Обновляем playerId если он изменился
        if (state.player_id) {
          setPlayerId(state.player_id)
        }
        
        // Восстанавливаем позицию скролла после обновления
        requestAnimationFrame(() => {
          window.scrollTo(0, scrollY)
        })
      }
    }

    socket.on('game_state', handleGameState)

    return () => {
      socket.off('game_state', handleGameState)
    }
  }, [socket, connected, gameId])

  const loadActiveGame = async () => {
    if (!user) return
    
    try {
      setLoading(true)
      setError(null)
      
      const response = await api.get(`/api/user/active-game?user_id=${user.id}`)
      
      if (response.game && response.game.game_id) {
        const { game_id, player_id, game_state } = response.game
        setGameId(game_id)
        setPlayerId(player_id)
        setGameState(game_state)
        localStorage.setItem('activeGameId', game_id)
      } else {
        // Нет активной игры
        localStorage.removeItem('activeGameId')
      }
    } catch (err) {
      console.error('Ошибка загрузки активной игры:', err)
      localStorage.removeItem('activeGameId')
    } finally {
      setLoading(false)
    }
  }

  const loadGame = async () => {
    if (!gameId || !user) return
    
    try {
      setLoading(true)
      setError(null)
      
      // Пытаемся получить состояние игры
      const state = await api.get(`/api/game/${gameId}/state?player_id=p1`)
      
      // Проверяем, в игре ли пользователь
      const p1 = state.players?.p1
      const p2 = state.players?.p2
      const isInGame = (p1?.user_id === user.id) || (p2?.user_id === user.id)
      
      if (!isInGame && (!p2 || !p2.user_id)) {
        // Присоединяемся к игре, если есть место
        try {
          const joinRes = await api.post(`/api/game/${gameId}/join`, {
            user_id: user.id,
            username: user.username || user.first_name || `user_${user.id}`
          })
          setPlayerId(joinRes.player_id)
          setGameState(joinRes.game_state)
          localStorage.setItem('activeGameId', gameId)
        } catch (joinErr) {
          // Если не удалось присоединиться (игра заполнена), просто загружаем состояние
          setGameState(state)
          if (p1?.user_id === user.id) setPlayerId('p1')
          else if (p2?.user_id === user.id) setPlayerId('p2')
          localStorage.setItem('activeGameId', gameId)
        }
      } else {
        setGameState(state)
        if (p1?.user_id === user.id) setPlayerId('p1')
        else if (p2?.user_id === user.id) setPlayerId('p2')
        localStorage.setItem('activeGameId', gameId)
      }
    } catch (err) {
      // Если игра не найдена - удаляем из localStorage и проверяем активную игру
      if (err.message?.includes('404') || err.message?.includes('not found')) {
        localStorage.removeItem('activeGameId')
        // Пытаемся присоединиться
        try {
          const joinRes = await api.post(`/api/game/${gameId}/join`, {
            user_id: user.id,
            username: user.username || user.first_name || `user_${user.id}`
          })
          setPlayerId(joinRes.player_id)
          setGameState(joinRes.game_state)
          localStorage.setItem('activeGameId', gameId)
        } catch (joinErr) {
          // Если не удалось - проверяем активную игру
          loadActiveGame()
        }
      } else {
        setError(err.message || 'Ошибка загрузки игры')
      }
    } finally {
      setLoading(false)
    }
  }

  const createGame = async (mode, is_timed = false) => {
    try {
      setLoading(true)
      setError(null)
      
      // Получаем group_id и room_code из URL или localStorage
      const params = new URLSearchParams(window.location.search)
      const urlGroupId = params.get('group_id')
      const savedGroupId = localStorage.getItem('group_id')
      const group_id = urlGroupId || savedGroupId || null
      
      // Проверяем, есть ли room_code (комната уже создана через /play)
      const startapp = params.get('startapp')
      let room_code = null
      if (startapp && startapp.startsWith('room-')) {
        room_code = startapp.replace('room-', '')
      } else {
        room_code = localStorage.getItem('roomCode')
      }
      
      const res = await api.post('/api/game/create', {
        mode,
        is_timed,
        user_id: user.id,
        username: user.username || user.first_name || `user_${user.id}`,
        group_id: group_id,
        room_code: room_code  // Передаем room_code, если комната уже создана
      })
      
      setGameId(res.game_id)
      setPlayerId(res.player_id)
      setGameState(res.game_state)
      localStorage.setItem('activeGameId', res.game_id)
      
      // Очищаем roomCode после использования
      if (room_code) {
        localStorage.removeItem('roomCode')
      }
    } catch (err) {
      setError(err.message || 'Ошибка создания игры')
    } finally {
      setLoading(false)
    }
  }

  if (authLoading || loading) {
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
          <p className="text-red-800 dark:text-red-200 mb-4">{error}</p>
          <button
            onClick={() => {
              localStorage.removeItem('activeGameId')
              window.location.reload()
            }}
            className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
          >
            Перезагрузить
          </button>
        </div>
      </div>
    )
  }

  // Если нет игры - показываем лобби
  if (!gameState) {
    return <GameLobby gameId={gameId} onCreateGame={createGame} user={user} />
  }

  // Если игра в расстановке
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

  // Если игра в бою
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

  // Лобби
  return <GameLobby gameId={gameId} onCreateGame={createGame} user={user} />
}

export default App

import { useState, useEffect, useRef } from 'react'
import { io } from 'socket.io-client'

const WS_URL = import.meta.env.VITE_WS_URL || 
               import.meta.env.VITE_BACKEND_URL || 
               'https://seabatlle-tg.onrender.com'

const httpToWs = (url) => {
  if (url.startsWith('ws://') || url.startsWith('wss://')) return url
  return url.replace('http://', 'ws://').replace('https://', 'wss://')
}

export function useWebSocket(gameId, authToken) {
  const [socket, setSocket] = useState(null)
  const [connected, setConnected] = useState(false)
  const socketRef = useRef(null)

  useEffect(() => {
    if (!gameId || !authToken) return

    const wsUrl = httpToWs(WS_URL)
    const newSocket = io(wsUrl, {
      auth: { token: authToken },
      query: { game_id: gameId },
      transports: ['websocket', 'polling'],
      reconnection: true,
    })

    newSocket.on('connect', () => {
      console.log('WebSocket подключен')
      setConnected(true)
    })

    newSocket.on('disconnect', () => {
      console.log('WebSocket отключен')
      setConnected(false)
    })

    newSocket.on('connect_error', (error) => {
      console.error('WebSocket ошибка:', error)
    })

    socketRef.current = newSocket
    setSocket(newSocket)

    return () => {
      if (socketRef.current) {
        socketRef.current.disconnect()
      }
    }
  }, [gameId, authToken])

  return { socket, connected }
}

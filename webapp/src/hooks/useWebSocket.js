import { useState, useEffect, useRef } from 'react'
import { io } from 'socket.io-client'

// Для WebSocket нужно использовать правильный протокол
const getWSUrl = () => {
  if (import.meta.env.VITE_WS_URL) {
    return import.meta.env.VITE_WS_URL
  }
  if (import.meta.env.PROD) {
    // В продакшене используем wss:// для безопасного WebSocket
    const apiUrl = import.meta.env.VITE_API_URL || 'https://your-backend-domain.com'
    return apiUrl.replace('http://', 'ws://').replace('https://', 'wss://')
  }
  return 'http://localhost:5000'
}

const WS_URL = getWSUrl()

export function useWebSocket(gameId, authToken) {
  const [socket, setSocket] = useState(null)
  const [connected, setConnected] = useState(false)
  const socketRef = useRef(null)

  useEffect(() => {
    if (!gameId || !authToken) return

    // Создаем подключение
    const newSocket = io(`${WS_URL}/ws/game/${gameId}`, {
      auth: {
        token: authToken,
      },
      transports: ['websocket', 'polling'],
    })

    newSocket.on('connect', () => {
      console.log('WebSocket подключен')
      setConnected(true)
    })

    newSocket.on('disconnect', () => {
      console.log('WebSocket отключен')
      setConnected(false)
    })

    newSocket.on('error', (error) => {
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


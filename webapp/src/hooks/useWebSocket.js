import { useState, useEffect, useRef } from 'react'
import { io } from 'socket.io-client'

// Кэш для WebSocket URL
let cachedWSUrl = null

// Функция для преобразования HTTP URL в WebSocket URL
const httpToWs = (url) => {
  if (url.startsWith('ws://') || url.startsWith('wss://')) {
    return url
  }
  return url.replace('http://', 'ws://').replace('https://', 'wss://')
}

// Функция для получения WebSocket URL
const getWSUrl = async () => {
  // Если указан явно - используем его
  if (import.meta.env.VITE_WS_URL) {
    return import.meta.env.VITE_WS_URL
  }
  
  // Если есть кэш - используем его
  if (cachedWSUrl) {
    return cachedWSUrl
  }
  
  // В продакшене сразу используем продакшн URL (не проверяем localhost)
  if (import.meta.env.PROD) {
    const prodUrl = import.meta.env.VITE_API_URL || 
                   import.meta.env.VITE_BACKEND_URL || 
                   'https://seabatlle-tg.onrender.com'
    cachedWSUrl = httpToWs(prodUrl)
    return cachedWSUrl
  }
  
  // В разработке пробуем localhost, затем продакшн как fallback
  const localhostUrl = 'http://localhost:5000'
  const prodUrl = import.meta.env.VITE_BACKEND_URL || 'https://seabatlle-tg.onrender.com'
  
  // Пробуем localhost
  try {
    const response = await fetch(`${localhostUrl}/health`, {
      method: 'GET',
      signal: AbortSignal.timeout(2000),
    })
    if (response.ok) {
      cachedWSUrl = httpToWs(localhostUrl)
      return cachedWSUrl
    }
  } catch {
    // localhost недоступен, используем продакшн
  }
  
  // Если localhost недоступен - используем продакшн
  cachedWSUrl = httpToWs(prodUrl)
  return cachedWSUrl
}

// Для синхронного доступа (будет использован при первом подключении)
const getWSUrlSync = () => {
  if (import.meta.env.VITE_WS_URL) {
    return import.meta.env.VITE_WS_URL
  }
  // По умолчанию пробуем localhost
  return 'ws://localhost:5000'
}

export function useWebSocket(gameId, authToken) {
  const [socket, setSocket] = useState(null)
  const [connected, setConnected] = useState(false)
  const socketRef = useRef(null)

  useEffect(() => {
    if (!gameId || !authToken) return

    // Функция для создания подключения
    const connectSocket = async () => {
      // Получаем рабочий WebSocket URL
      const wsUrl = await getWSUrl()
      
      // Создаем подключение
      const newSocket = io(`${wsUrl}/ws/game/${gameId}`, {
        auth: {
          token: authToken,
        },
        transports: ['websocket', 'polling'],
        reconnection: true,
        reconnectionDelay: 1000,
        reconnectionAttempts: 5,
      })

      newSocket.on('connect', () => {
        console.log('WebSocket подключен к:', wsUrl)
        setConnected(true)
      })

      newSocket.on('disconnect', () => {
        console.log('WebSocket отключен')
        setConnected(false)
      })

      newSocket.on('connect_error', async (error) => {
        console.error('WebSocket ошибка подключения:', error)
        
        // Если ошибка и это localhost - пробуем продакшн
        if (wsUrl.includes('localhost')) {
          const prodUrl = httpToWs(import.meta.env.VITE_BACKEND_URL || 'https://seabatlle-tg.onrender.com')
          if (prodUrl !== wsUrl) {
            console.log('Пробуем подключиться к продакшн серверу:', prodUrl)
            cachedWSUrl = null // Сбрасываем кэш
            newSocket.disconnect()
            
            // Пробуем подключиться к продакшн
            const prodSocket = io(`${prodUrl}/ws/game/${gameId}`, {
              auth: { token: authToken },
              transports: ['websocket', 'polling'],
            })
            
            prodSocket.on('connect', () => {
              console.log('WebSocket подключен к продакшн:', prodUrl)
              cachedWSUrl = prodUrl
              setConnected(true)
              socketRef.current = prodSocket
              setSocket(prodSocket)
            })
          }
        }
      })

      newSocket.on('error', (error) => {
        console.error('WebSocket ошибка:', error)
      })

      socketRef.current = newSocket
      setSocket(newSocket)
    }

    connectSocket()

    return () => {
      if (socketRef.current) {
        socketRef.current.disconnect()
      }
    }
  }, [gameId, authToken])

  return { socket, connected }
}


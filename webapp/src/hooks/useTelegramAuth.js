import { useState, useEffect } from 'react'
import { api } from '../utils/api'

export function useTelegramAuth() {
  const [user, setUser] = useState(null)
  const [authToken, setAuthToken] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const initAuth = async () => {
      try {
        // Проверяем наличие Telegram WebApp
        if (window.Telegram?.WebApp) {
          const tg = window.Telegram.WebApp
          
          // Проверяем наличие пользователя и initData
          if (tg.initDataUnsafe?.user && tg.initData) {
            const tgUser = tg.initDataUnsafe.user
            const initData = tg.initData

            console.log('Авторизация через Telegram:', { userId: tgUser.id, username: tgUser.username })

            try {
              const response = await api.post('/api/auth', {
                init_data: initData,
                user: tgUser,
              })

              if (response && response.token) {
                setUser(tgUser)
                setAuthToken(response.token)
                console.log('Авторизация успешна')
              } else {
                throw new Error('Токен не получен от сервера')
              }
            } catch (authError) {
              console.error('Ошибка авторизации на сервере:', authError)
              // При ошибке авторизации используем данные пользователя из Telegram
              // для возможности работы в режиме разработки
              setUser(tgUser)
              setAuthToken('temp_token')
            }
          } else {
            console.warn('Telegram WebApp данные не найдены, используем режим разработки')
            // Для разработки или если данные не загружены
            const devUser = { id: 123456, first_name: 'Dev', username: 'dev' }
            setUser(devUser)
            setAuthToken('dev_token')
          }
        } else {
          console.warn('Telegram WebApp не найден, используем режим разработки')
          // Для разработки вне Telegram
          const devUser = { id: 123456, first_name: 'Dev', username: 'dev' }
          setUser(devUser)
          setAuthToken('dev_token')
        }
      } catch (error) {
        console.error('Критическая ошибка авторизации:', error)
        // Даже при ошибке устанавливаем dev пользователя для возможности работы
        const devUser = { id: 123456, first_name: 'Dev', username: 'dev' }
        setUser(devUser)
        setAuthToken('dev_token')
      } finally {
        setLoading(false)
      }
    }

    initAuth()
  }, [])

  return { user, authToken, loading }
}

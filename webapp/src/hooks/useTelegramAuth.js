import { useState, useEffect } from 'react'
import { api } from '../utils/api'

export function useTelegramAuth() {
  const [user, setUser] = useState(null)
  const [authToken, setAuthToken] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const initAuth = async () => {
      try {
        // Получаем данные из Telegram WebApp
        if (window.Telegram?.WebApp?.initDataUnsafe?.user) {
          const tgUser = window.Telegram.WebApp.initDataUnsafe.user
          const initData = window.Telegram.WebApp.initData

          // Отправляем на сервер для валидации и получения токена
          const response = await api.post('/api/auth', {
            init_data: initData,
            user: tgUser,
          })

          setUser(tgUser)
          setAuthToken(response.token)
        } else {
          // Для разработки (если не в Telegram)
          const devUser = {
            id: 123456,
            first_name: 'Dev User',
            username: 'dev_user',
          }
          setUser(devUser)
          setAuthToken('dev_token')
        }
      } catch (error) {
        console.error('Ошибка авторизации:', error)
      } finally {
        setLoading(false)
      }
    }

    initAuth()
  }, [])

  return { user, authToken, loading }
}


import { useState, useEffect } from 'react'
import { api } from '../utils/api'

export function useTelegramAuth() {
  const [user, setUser] = useState(null)
  const [authToken, setAuthToken] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const initAuth = async () => {
      try {
        if (window.Telegram?.WebApp?.initDataUnsafe?.user) {
          const tgUser = window.Telegram.WebApp.initDataUnsafe.user
          const initData = window.Telegram.WebApp.initData

          const response = await api.post('/api/auth', {
            init_data: initData,
            user: tgUser,
          })

          setUser(tgUser)
          setAuthToken(response.token)
        } else {
          // Для разработки
          const devUser = { id: 123456, first_name: 'Dev', username: 'dev' }
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

const API_URL = import.meta.env.VITE_API_URL || 
                import.meta.env.VITE_BACKEND_URL || 
                'https://seabatlle-tg.onrender.com'

async function request(url, options = {}) {
  try {
    const response = await fetch(`${API_URL}${url}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
    })

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: `HTTP ${response.status}` }))
      throw new Error(error.message || `HTTP ${response.status}`)
    }

    return response.json()
  } catch (error) {
    throw error
  }
}

export const api = {
  get(url) {
    return request(url, { method: 'GET' })
  },

  post(url, data) {
    return request(url, {
      method: 'POST',
      body: JSON.stringify(data),
    })
  },
}

export default function GameLobby({ gameId, onJoin }) {
  const shareLink = `${window.location.origin}${window.location.pathname}?gameId=${gameId}`

  const copyLink = () => {
    navigator.clipboard.writeText(shareLink)
    alert('Ссылка скопирована!')
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6 max-w-md w-full">
        <h1 className="text-2xl font-bold mb-4 text-center">Ожидание игрока</h1>
        <p className="text-gray-600 dark:text-gray-400 mb-4 text-center">
          ID игры: <span className="font-mono font-bold">{gameId}</span>
        </p>
        <p className="text-gray-600 dark:text-gray-400 mb-4">
          Отправьте ссылку другу или подождите, пока кто-то присоединится:
        </p>
        <div className="flex gap-2 mb-4">
          <input
            type="text"
            value={shareLink}
            readOnly
            className="flex-1 px-3 py-2 border rounded dark:bg-gray-700 dark:border-gray-600"
          />
          <button
            onClick={copyLink}
            className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
          >
            Копировать
          </button>
        </div>
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto"></div>
          <p className="mt-2 text-gray-600 dark:text-gray-400">Ожидание...</p>
        </div>
      </div>
    </div>
  )
}


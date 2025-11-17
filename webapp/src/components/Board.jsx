export default function Board({ board, size = 10, interactive = false, showShips = false, onCellClick }) {
  // Проверяем, что board существует и является массивом
  if (!board || !Array.isArray(board) || board.length === 0) {
    return (
      <div className="p-4 text-center text-gray-500">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto mb-2"></div>
        <p>Загрузка поля...</p>
      </div>
    )
  }
  
  // Если board пустой или неполный, создаем пустую доску
  const actualSize = board.length || size

  const handleClick = (row, col) => {
    if (!interactive || !onCellClick) return
    if (!board[row] || !board[row][col]) return
    const cell = board[row][col]
    // Разрешаем клик только по пустым клеткам
    if (cell !== '🌊' && cell !== '') return
    onCellClick(row, col)
  }

  const getCellState = (row, col) => {
    if (!board[row] || !board[row][col]) return 'empty'
    const cell = board[row][col]
    
    // Проверяем состояние клетки
    if (cell === '🔥' || cell === 'HIT') return 'hit'
    if (cell === '⚫' || cell === 'MISS') return 'miss'
    if (cell === '❌' || cell === 'DESTROYED') return 'destroyed'
    if (showShips && (cell === '🟥' || cell === 'SHIP')) return 'ship'
    return 'empty'
  }

  const getCellClass = (row, col) => {
    const state = getCellState(row, col)
    let classes = 'w-10 h-10 sm:w-12 sm:h-12 flex items-center justify-center border-2 transition-all duration-200 relative'
    
    // Базовые стили для разных состояний
    switch (state) {
      case 'empty':
        classes += ' bg-blue-100 dark:bg-blue-900/30 border-blue-300 dark:border-blue-700'
        if (interactive) {
          classes += ' cursor-pointer hover:bg-blue-200 dark:hover:bg-blue-800 hover:scale-105 active:scale-95'
        }
        break
      case 'ship':
        classes += ' bg-blue-500 dark:bg-blue-600 border-blue-600 dark:border-blue-700'
        // Квадрат с закругленными углами
        classes += ' rounded-lg'
        break
      case 'hit':
        classes += ' bg-red-500 dark:bg-red-600 border-red-600 dark:border-red-700'
        classes += ' rounded-lg'
        // Крестик для попадания
        break
      case 'miss':
        classes += ' bg-gray-300 dark:bg-gray-600 border-gray-400 dark:border-gray-500'
        classes += ' rounded-full'
        // Круг для промаха
        break
      case 'destroyed':
        classes += ' bg-red-700 dark:bg-red-800 border-red-800 dark:border-red-900'
        classes += ' rounded-lg'
        // Крестик для уничтоженного
        break
    }
    
    return classes
  }

  const renderCellContent = (row, col) => {
    const state = getCellState(row, col)
    
    switch (state) {
      case 'hit':
        return (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-6 h-6 border-2 border-white rounded"></div>
            <div className="absolute w-6 h-0.5 bg-white rotate-45"></div>
            <div className="absolute w-6 h-0.5 bg-white -rotate-45"></div>
          </div>
        )
      case 'miss':
        return (
          <div className="w-3 h-3 bg-gray-500 dark:bg-gray-400 rounded-full"></div>
        )
      case 'destroyed':
        return (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-6 h-6 border-2 border-white rounded"></div>
            <div className="absolute w-6 h-0.5 bg-white rotate-45"></div>
            <div className="absolute w-6 h-0.5 bg-white -rotate-45"></div>
          </div>
        )
      case 'ship':
        return (
          <div className="w-full h-full bg-blue-500 dark:bg-blue-600 rounded-lg"></div>
        )
      default:
        return null
    }
  }

  return (
    <div className="inline-block p-2 bg-white dark:bg-gray-900 rounded-xl shadow-xl border border-gray-200 dark:border-gray-700">
      <div className="grid gap-1" style={{ gridTemplateColumns: `repeat(${actualSize}, minmax(0, 1fr))` }}>
        {Array.from({ length: actualSize }, (_, row) =>
          Array.from({ length: actualSize }, (_, col) => (
            <button
              key={`${row}-${col}`}
              className={getCellClass(row, col)}
              onClick={() => handleClick(row, col)}
              disabled={!interactive || getCellState(row, col) !== 'empty'}
              type="button"
            >
              {renderCellContent(row, col)}
            </button>
          ))
        )}
      </div>
    </div>
  )
}

export default function Board({ board, size = 10, interactive = false, showShips = false, onCellClick }) {
  // Проверяем, что board существует и является массивом
  if (!board || !Array.isArray(board) || board.length === 0) {
    // Создаем пустую доску для отображения
    const emptySize = size || 10
    return (
      <div className="inline-block p-4 bg-gradient-to-br from-sky-100 via-blue-50 to-cyan-50 dark:from-gray-800 dark:via-gray-800 dark:to-gray-900 rounded-2xl shadow-2xl border-4 border-blue-300 dark:border-blue-700">
        <div className="grid gap-1" style={{ gridTemplateColumns: `repeat(${emptySize}, minmax(0, 1fr))` }}>
          {Array.from({ length: emptySize }, (_, row) =>
            Array.from({ length: emptySize }, (_, col) => (
              <div
                key={`${row}-${col}`}
                className="w-7 h-7 sm:w-9 sm:h-9 flex items-center justify-center border-2 border-blue-400 dark:border-blue-600 bg-blue-200 dark:bg-gray-700 rounded-md transition-all"
              />
            ))
          )}
        </div>
      </div>
    )
  }
  
  const actualSize = Math.max(board.length, size) || size

  const handleClick = (row, col) => {
    if (!interactive || !onCellClick) return
    if (!board[row] || !board[row][col]) return
    const cell = board[row][col]
    // Разрешаем клик только по пустым клеткам
    if (cell !== '🌊' && cell !== '') return
    onCellClick(row, col)
  }

  const getCellState = (row, col) => {
    if (!board || !board[row] || !board[row][col]) return 'empty'
    const cell = board[row][col]
    
    if (cell === '🟥' || cell === 'ship') return 'ship'
    if (cell === '🔥' || cell === 'hit') return 'hit'
    if (cell === '⚫' || cell === 'miss') return 'miss'
    if (cell === '❌' || cell === 'destroyed') return 'destroyed'
    return 'empty'
  }

  const getCellClass = (row, col) => {
    const state = getCellState(row, col)
    let classes = 'w-7 h-7 sm:w-9 sm:h-9 flex items-center justify-center border-2 rounded-md transition-all duration-200 relative'
    
    if (interactive && state === 'empty') {
      classes += ' cursor-pointer hover:scale-110 hover:shadow-lg active:scale-95 border-blue-500 dark:border-blue-400 bg-blue-200 dark:bg-blue-900/40 hover:bg-blue-300 dark:hover:bg-blue-800/60'
    } else if (!interactive) {
      classes += ' border-blue-400 dark:border-blue-600'
    }
    
    switch (state) {
      case 'ship':
        if (showShips) {
          classes += ' bg-blue-600 dark:bg-blue-500 border-blue-700 dark:border-blue-600 shadow-md'
          // Добавляем визуализацию корабля
          classes += ' before:content-[""] before:absolute before:inset-0 before:bg-gradient-to-br before:from-blue-500 before:to-blue-700 before:rounded-md before:opacity-80'
        } else {
          classes += ' bg-blue-200 dark:bg-gray-700 border-blue-400 dark:border-blue-600'
        }
        break
      case 'hit':
        classes += ' bg-red-500 dark:bg-red-600 border-red-600 dark:border-red-700 shadow-lg'
        // Крестик для попадания
        classes += ' before:content-["✕"] before:text-white before:font-bold before:text-lg before:absolute'
        break
      case 'miss':
        classes += ' bg-gray-300 dark:bg-gray-600 border-gray-400 dark:border-gray-500'
        // Точка для промаха
        classes += ' after:content-[""] after:absolute after:w-2 after:h-2 after:bg-gray-500 dark:after:bg-gray-400 after:rounded-full'
        break
      case 'destroyed':
        classes += ' bg-red-700 dark:bg-red-800 border-red-800 dark:border-red-900 shadow-lg'
        classes += ' before:content-["✕"] before:text-white before:font-bold before:text-xl before:absolute'
        break
      default:
        classes += ' bg-blue-100 dark:bg-gray-800 border-blue-300 dark:border-blue-600'
    }
    
    return classes
  }

  // Если доска не нормализована, показываем пустую
  if (!board || !Array.isArray(board) || board.length === 0) {
    return (
      <div className="inline-block p-4 bg-gradient-to-br from-sky-100 via-blue-50 to-cyan-50 dark:from-gray-800 dark:via-gray-800 dark:to-gray-900 rounded-2xl shadow-2xl border-4 border-blue-300 dark:border-blue-700">
        <div className="grid gap-1" style={{ gridTemplateColumns: `repeat(${actualSize}, minmax(0, 1fr))` }}>
          {Array.from({ length: actualSize }, (_, row) =>
            Array.from({ length: actualSize }, (_, col) => (
              <div
                key={`${row}-${col}`}
                className="w-7 h-7 sm:w-9 sm:h-9 flex items-center justify-center border-2 border-blue-400 dark:border-blue-600 bg-blue-200 dark:bg-gray-700 rounded-md transition-all"
              />
            ))
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="inline-block p-4 bg-gradient-to-br from-sky-100 via-blue-50 to-cyan-50 dark:from-gray-800 dark:via-gray-800 dark:to-gray-900 rounded-2xl shadow-2xl border-4 border-blue-300 dark:border-blue-700">
      <div className="grid gap-1" style={{ gridTemplateColumns: `repeat(${actualSize}, minmax(0, 1fr))` }}>
        {Array.from({ length: actualSize }, (_, row) =>
          Array.from({ length: actualSize }, (_, col) => (
            <button
              key={`${row}-${col}`}
              className={getCellClass(row, col)}
              onClick={() => handleClick(row, col)}
              disabled={!interactive || getCellState(row, col) !== 'empty'}
              type="button"
              aria-label={`Cell ${row}, ${col}`}
            />
          ))
        )}
      </div>
    </div>
  )
}

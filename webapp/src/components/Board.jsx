export default function Board({ board, size = 10, interactive = false, showShips = false, onCellClick }) {
  // Кириллические буквы для координат (А-К, пропуская Ё)
  const letters = ['А', 'Б', 'В', 'Г', 'Д', 'Е', 'Ж', 'З', 'И', 'К']
  
  // Проверяем, что board существует и является массивом
  if (!board || !Array.isArray(board) || board.length === 0) {
    // Создаем пустую доску для отображения
    const emptySize = size || 10
    return (
      <div className="inline-block p-2 bg-gray-900 dark:bg-gray-900 rounded-lg shadow-xl border-2 border-gray-700 dark:border-gray-700">
        {/* Заголовок с буквами */}
        <div className="grid gap-0.5 mb-0.5" style={{ gridTemplateColumns: `24px repeat(${emptySize}, minmax(0, 1fr))` }}>
          <div className="w-6"></div>
          {Array.from({ length: emptySize }, (_, col) => (
            <div
              key={`header-${col}`}
              className="w-8 h-6 sm:w-10 sm:h-8 flex items-center justify-center text-gray-300 dark:text-gray-400 font-bold text-xs sm:text-sm"
            >
              {letters[col] || String.fromCharCode(65 + col)}
            </div>
          ))}
        </div>
        
        {/* Сетка */}
        <div className="grid gap-0.5" style={{ gridTemplateColumns: `24px repeat(${emptySize}, minmax(0, 1fr))` }}>
          {Array.from({ length: emptySize }, (_, row) => (
            <>
              {/* Номер строки */}
              <div
                key={`row-label-${row}`}
                className="w-6 h-8 sm:h-10 flex items-center justify-center text-gray-300 dark:text-gray-400 font-bold text-xs sm:text-sm"
              >
                {row + 1}
              </div>
              {/* Клетки строки */}
              {Array.from({ length: emptySize }, (_, col) => (
                <div
                  key={`${row}-${col}`}
                  className="w-8 h-8 sm:w-10 sm:h-10 flex items-center justify-center border border-gray-600 dark:border-gray-600 bg-gray-800 dark:bg-gray-800 transition-all"
                />
              ))}
            </>
          ))}
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
    let classes = 'w-8 h-8 sm:w-10 sm:h-10 flex items-center justify-center border border-gray-600 dark:border-gray-600 transition-all duration-200 relative'
    
    if (interactive && state === 'empty') {
      classes += ' cursor-pointer hover:scale-105 hover:shadow-lg active:scale-95 bg-gray-800 dark:bg-gray-800 hover:bg-gray-700 dark:hover:bg-gray-700 border-gray-500 dark:border-gray-500'
    } else if (!interactive) {
      classes += ' bg-gray-800 dark:bg-gray-800'
    }
    
    switch (state) {
      case 'ship':
        if (showShips) {
          classes += ' bg-blue-600 dark:bg-blue-500 border-blue-500 dark:border-blue-400 shadow-md'
          // Визуализация корабля - синий прямоугольник
        } else {
          classes += ' bg-gray-800 dark:bg-gray-800 border-gray-600 dark:border-gray-600'
        }
        break
      case 'hit':
        classes += ' bg-red-600 dark:bg-red-600 border-red-500 dark:border-red-500 shadow-lg'
        // Крестик для попадания
        classes += ' before:content-["✕"] before:text-white before:font-bold before:text-base sm:before:text-lg before:absolute'
        break
      case 'miss':
        classes += ' bg-gray-700 dark:bg-gray-700 border-gray-600 dark:border-gray-600'
        // Точка для промаха
        classes += ' after:content-[""] after:absolute after:w-2 after:h-2 after:bg-gray-400 dark:after:bg-gray-500 after:rounded-full'
        break
      case 'destroyed':
        classes += ' bg-red-800 dark:bg-red-800 border-red-700 dark:border-red-700 shadow-lg'
        classes += ' before:content-["✕"] before:text-white before:font-bold before:text-base sm:before:text-xl before:absolute'
        break
      default:
        classes += ' bg-gray-800 dark:bg-gray-800 border-gray-600 dark:border-gray-600'
    }
    
    return classes
  }

  // Если доска не нормализована, показываем пустую
  if (!board || !Array.isArray(board) || board.length === 0) {
    return (
      <div className="inline-block p-2 bg-gray-900 dark:bg-gray-900 rounded-lg shadow-xl border-2 border-gray-700 dark:border-gray-700">
        {/* Заголовок с буквами */}
        <div className="grid gap-0.5 mb-0.5" style={{ gridTemplateColumns: `24px repeat(${actualSize}, minmax(0, 1fr))` }}>
          <div className="w-6"></div>
          {Array.from({ length: actualSize }, (_, col) => (
            <div
              key={`header-${col}`}
              className="w-8 h-6 sm:w-10 sm:h-8 flex items-center justify-center text-gray-300 dark:text-gray-400 font-bold text-xs sm:text-sm"
            >
              {letters[col] || String.fromCharCode(65 + col)}
            </div>
          ))}
        </div>
        
        {/* Сетка */}
        <div className="grid gap-0.5" style={{ gridTemplateColumns: `24px repeat(${actualSize}, minmax(0, 1fr))` }}>
          {Array.from({ length: actualSize }, (_, row) => (
            <>
              {/* Номер строки */}
              <div
                key={`row-label-${row}`}
                className="w-6 h-8 sm:h-10 flex items-center justify-center text-gray-300 dark:text-gray-400 font-bold text-xs sm:text-sm"
              >
                {row + 1}
              </div>
              {/* Клетки строки */}
              {Array.from({ length: actualSize }, (_, col) => (
                <div
                  key={`${row}-${col}`}
                  className="w-8 h-8 sm:w-10 sm:h-10 flex items-center justify-center border border-gray-600 dark:border-gray-600 bg-gray-800 dark:bg-gray-800 transition-all"
                />
              ))}
            </>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="inline-block p-2 bg-gray-900 dark:bg-gray-900 rounded-lg shadow-xl border-2 border-gray-700 dark:border-gray-700">
      {/* Заголовок с буквами */}
      <div className="grid gap-0.5 mb-0.5" style={{ gridTemplateColumns: `24px repeat(${actualSize}, minmax(0, 1fr))` }}>
        <div className="w-6"></div>
        {Array.from({ length: actualSize }, (_, col) => (
          <div
            key={`header-${col}`}
            className="w-8 h-6 sm:w-10 sm:h-8 flex items-center justify-center text-gray-300 dark:text-gray-400 font-bold text-xs sm:text-sm"
          >
            {letters[col] || String.fromCharCode(65 + col)}
          </div>
        ))}
      </div>
      
      {/* Сетка с клетками */}
      <div className="grid gap-0.5" style={{ gridTemplateColumns: `24px repeat(${actualSize}, minmax(0, 1fr))` }}>
        {Array.from({ length: actualSize }, (_, row) => (
          <>
            {/* Номер строки */}
            <div
              key={`row-label-${row}`}
              className="w-6 h-8 sm:h-10 flex items-center justify-center text-gray-300 dark:text-gray-400 font-bold text-xs sm:text-sm"
            >
              {row + 1}
            </div>
            {/* Клетки строки */}
            {Array.from({ length: actualSize }, (_, col) => (
              <button
                key={`${row}-${col}`}
                className={getCellClass(row, col)}
                onClick={() => handleClick(row, col)}
                disabled={!interactive || getCellState(row, col) !== 'empty'}
                type="button"
                aria-label={`Cell ${letters[col] || String.fromCharCode(65 + col)}${row + 1}`}
              />
            ))}
          </>
        ))}
      </div>
    </div>
  )
}

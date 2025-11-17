const CELL_STATES = {
  EMPTY: '🌊',
  SHIP: '🟥',
  HIT: '🔥',
  MISS: '⚫',
  DESTROYED: '❌',
}

export default function Board({ board, size = 10, interactive = false, showShips = false, onCellClick }) {
  // Проверяем, что board существует и является массивом
  if (!board || !Array.isArray(board) || board.length === 0) {
    // Создаем пустую доску для отображения
    const emptyBoard = Array.from({ length: size }, () => Array.from({ length: size }, () => '🌊'))
    return (
      <div className="inline-block p-3 bg-gradient-to-br from-blue-50 to-blue-100 dark:from-gray-800 dark:to-gray-900 rounded-xl shadow-lg border-2 border-blue-200 dark:border-blue-700">
        <div className="grid gap-1" style={{ gridTemplateColumns: `repeat(${size}, minmax(0, 1fr))` }}>
          {Array.from({ length: size }, (_, row) =>
            Array.from({ length: size }, (_, col) => (
              <div
                key={`${row}-${col}`}
                className="w-8 h-8 sm:w-10 sm:h-10 flex items-center justify-center text-xs sm:text-sm border-2 border-blue-300 dark:border-blue-600 bg-blue-100 dark:bg-gray-700 rounded transition-all"
              >
                {emptyBoard[row][col]}
              </div>
            ))
          )}
        </div>
      </div>
    )
  }
  
  const actualSize = board.length || size

  const handleClick = (row, col) => {
    if (!interactive || !onCellClick) return
    if (!board[row] || !board[row][col]) return
    const cell = board[row][col]
    if (cell !== CELL_STATES.EMPTY && cell !== '🌊') return
    onCellClick(row, col)
  }

  const getCellContent = (row, col) => {
    if (!board[row] || !board[row][col]) return CELL_STATES.EMPTY
    return board[row][col]
  }

  const getCellClass = (row, col) => {
    const cell = getCellContent(row, col)
    let classes = 'w-8 h-8 sm:w-10 sm:h-10 flex items-center justify-center text-xs sm:text-sm border-2 rounded transition-all duration-150'
    
    if (interactive && (cell === CELL_STATES.EMPTY || cell === '🌊')) {
      classes += ' cursor-pointer hover:scale-110 hover:shadow-md active:scale-95 border-blue-400 dark:border-blue-500 bg-blue-100 dark:bg-blue-900/30'
    } else if (!interactive) {
      classes += ' border-blue-300 dark:border-blue-600'
    }
    
    if (cell === CELL_STATES.HIT || cell === '🔥') {
      classes += ' bg-red-500 dark:bg-red-600 border-red-600 dark:border-red-700 text-white font-bold shadow-lg'
    } else if (cell === CELL_STATES.MISS || cell === '⚫') {
      classes += ' bg-gray-400 dark:bg-gray-600 border-gray-500 dark:border-gray-500'
    } else if (cell === CELL_STATES.DESTROYED || cell === '❌') {
      classes += ' bg-red-700 dark:bg-red-800 border-red-800 dark:border-red-900 text-white font-bold shadow-lg'
    } else if (showShips && (cell === CELL_STATES.SHIP || cell === '🟥')) {
      classes += ' bg-blue-500 dark:bg-blue-600 border-blue-600 dark:border-blue-700 shadow-md'
    } else {
      classes += ' bg-blue-50 dark:bg-gray-800'
    }
    
    return classes
  }

  return (
    <div className="inline-block p-3 bg-gradient-to-br from-blue-50 to-blue-100 dark:from-gray-800 dark:to-gray-900 rounded-xl shadow-lg border-2 border-blue-200 dark:border-blue-700">
      <div className="grid gap-1" style={{ gridTemplateColumns: `repeat(${actualSize}, minmax(0, 1fr))` }}>
        {Array.from({ length: actualSize }, (_, row) =>
          Array.from({ length: actualSize }, (_, col) => (
            <button
              key={`${row}-${col}`}
              className={getCellClass(row, col)}
              onClick={() => handleClick(row, col)}
              disabled={!interactive || (getCellContent(row, col) !== CELL_STATES.EMPTY && getCellContent(row, col) !== '🌊')}
              type="button"
            >
              {getCellContent(row, col)}
            </button>
          ))
        )}
      </div>
    </div>
  )
}

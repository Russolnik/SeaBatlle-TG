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
      <div className="inline-block p-2 bg-white dark:bg-gray-900 rounded-lg shadow-lg">
        <div className="grid gap-0" style={{ gridTemplateColumns: `repeat(${size}, minmax(0, 1fr))` }}>
          {Array.from({ length: size }, (_, row) =>
            Array.from({ length: size }, (_, col) => (
              <div
                key={`${row}-${col}`}
                className="w-10 h-10 flex items-center justify-center text-sm border border-gray-300 dark:border-gray-600 bg-blue-50 dark:bg-gray-800"
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
    let classes = 'w-10 h-10 flex items-center justify-center text-sm border border-gray-300 dark:border-gray-600 rounded'
    
    if (interactive && (cell === CELL_STATES.EMPTY || cell === '🌊')) {
      classes += ' cursor-pointer hover:bg-blue-100 dark:hover:bg-blue-900'
    }
    
    if (cell === CELL_STATES.HIT || cell === '🔥') {
      classes += ' bg-red-500 text-white'
    } else if (cell === CELL_STATES.MISS || cell === '⚫') {
      classes += ' bg-gray-400 dark:bg-gray-600'
    } else if (cell === CELL_STATES.DESTROYED || cell === '❌') {
      classes += ' bg-red-700 text-white'
    } else if (showShips && (cell === CELL_STATES.SHIP || cell === '🟥')) {
      classes += ' bg-blue-400 dark:bg-blue-600'
    } else {
      classes += ' bg-blue-50 dark:bg-gray-800'
    }
    
    return classes
  }

  return (
    <div className="inline-block p-2 bg-white dark:bg-gray-900 rounded-lg shadow-lg">
      <div className="grid gap-0" style={{ gridTemplateColumns: `repeat(${actualSize}, minmax(0, 1fr))` }}>
        {Array.from({ length: actualSize }, (_, row) =>
          Array.from({ length: actualSize }, (_, col) => (
            <button
              key={`${row}-${col}`}
              className={getCellClass(row, col)}
              onClick={() => handleClick(row, col)}
              disabled={!interactive}
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

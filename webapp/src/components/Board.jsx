import { useMemo } from 'react'

const CELL_STATES = {
  EMPTY: '🌊',
  SHIP: '🟥',
  HIT: '🔥',
  MISS: '⚫',
  DESTROYED: '❌',
}

export default function Board({
  board,
  size = 10,
  interactive = false,
  showShips = false,
  onCellClick,
  selectedCell = null,
}) {
  const letters = useMemo(() => {
    return Array.from({ length: size }, (_, i) => String.fromCharCode(65 + i))
  }, [size])

  const handleCellClick = (row, col) => {
    if (!interactive || !onCellClick) return
    if (board[row][col] !== CELL_STATES.EMPTY && board[row][col] !== '🌊') return
    
    onCellClick(row, col)
  }

  const getCellClass = (row, col, cell) => {
    const baseClass = 'cell w-8 h-8 sm:w-10 sm:h-10 flex items-center justify-center text-xs sm:text-sm font-medium border border-gray-300 dark:border-gray-600 rounded transition-all'
    
    if (selectedCell && selectedCell.row === row && selectedCell.col === col) {
      return `${baseClass} ring-2 ring-blue-500 scale-110`
    }

    if (interactive && cell === CELL_STATES.EMPTY) {
      return `${baseClass} cursor-pointer hover:bg-blue-100 dark:hover:bg-blue-900 active:scale-95`
    }

    if (cell === CELL_STATES.HIT || cell === '🔥') {
      return `${baseClass} bg-red-500 text-white`
    }

    if (cell === CELL_STATES.MISS || cell === '⚫') {
      return `${baseClass} bg-gray-400 dark:bg-gray-600`
    }

    if (cell === CELL_STATES.DESTROYED || cell === '❌') {
      return `${baseClass} bg-red-700 text-white`
    }

    if (showShips && (cell === CELL_STATES.SHIP || cell === '🟥')) {
      return `${baseClass} bg-blue-400 dark:bg-blue-600`
    }

    return `${baseClass} bg-blue-50 dark:bg-gray-800`
  }

  return (
    <div className="inline-block p-2 bg-white dark:bg-gray-900 rounded-lg shadow-lg">
      <div className="grid gap-0" style={{ gridTemplateColumns: `repeat(${size + 1}, minmax(0, 1fr))` }}>
        {/* Пустая ячейка в углу */}
        <div className="w-8 h-8 sm:w-10 sm:h-10"></div>
        
        {/* Буквы сверху */}
        {letters.map((letter, col) => (
          <div
            key={`header-${col}`}
            className="w-8 h-8 sm:w-10 sm:h-10 flex items-center justify-center text-xs sm:text-sm font-bold text-gray-700 dark:text-gray-300"
          >
            {letter}
          </div>
        ))}

        {/* Строки с цифрами и клетками */}
        {Array.from({ length: size }, (_, row) => (
          <div key={`row-${row}`} className="contents">
            {/* Номер строки */}
            <div className="w-8 h-8 sm:w-10 sm:h-10 flex items-center justify-center text-xs sm:text-sm font-bold text-gray-700 dark:text-gray-300">
              {row + 1}
            </div>
            
            {/* Клетки поля */}
            {Array.from({ length: size }, (_, col) => {
              const cell = board[row]?.[col] || CELL_STATES.EMPTY
              return (
                <button
                  key={`cell-${row}-${col}`}
                  className={getCellClass(row, col, cell)}
                  onClick={() => handleCellClick(row, col)}
                  disabled={!interactive || (cell !== CELL_STATES.EMPTY && cell !== '🌊')}
                >
                  {cell}
                </button>
              )
            })}
          </div>
        ))}
      </div>
    </div>
  )
}


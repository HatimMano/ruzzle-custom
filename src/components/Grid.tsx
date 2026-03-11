import { useCallback, useEffect, useRef, useState } from 'react'
import type { Cell, Grid as GridType } from '../lib/gridGenerator'

type FeedbackType = 'valid' | 'duplicate' | 'invalid' | null

interface GridProps {
  grid: GridType
  onWordSubmit: (cells: Cell[]) => FeedbackType
  disabled?: boolean
  discoveryPath?: Cell[] // chemin à mettre en évidence (mode découverte)
}

const FEEDBACK_COLORS: Record<NonNullable<FeedbackType>, string> = {
  valid: 'bg-green-500 border-green-400 text-white scale-110',
  duplicate: 'bg-orange-500 border-orange-400 text-white',
  invalid: 'bg-red-500 border-red-400 text-white',
}

const FEEDBACK_ANIM: Record<NonNullable<FeedbackType>, string> = {
  valid: 'animate-pop animate-glow',
  duplicate: 'animate-shake',
  invalid: 'animate-shake',
}

export default function Grid({ grid, onWordSubmit, disabled, discoveryPath }: GridProps) {
  const [selectedCells, setSelectedCells] = useState<Cell[]>([])
  const [feedback, setFeedback] = useState<FeedbackType>(null)
  const [feedbackCells, setFeedbackCells] = useState<Set<string>>(new Set())
  const isDragging = useRef(false)
  const feedbackTimer = useRef<number>(0)

  const cellKey = (c: Cell) => `${c.row},${c.col}`

  const discoveryKeys = discoveryPath ? new Set(discoveryPath.map(cellKey)) : null
  const discoveryOrder = discoveryPath
    ? Object.fromEntries(discoveryPath.map((c, i) => [cellKey(c), i + 1]))
    : null

  const isSelected = (c: Cell) => selectedCells.some(s => cellKey(s) === cellKey(c))
  const isLast = (c: Cell) => selectedCells.length > 0 && cellKey(selectedCells[selectedCells.length - 1]) === cellKey(c)

  const canSelect = (cell: Cell): boolean => {
    if (selectedCells.length === 0) return true
    if (isSelected(cell)) return false
    const last = selectedCells[selectedCells.length - 1]
    return Math.abs(cell.row - last.row) <= 1 && Math.abs(cell.col - last.col) <= 1
  }

  const submitSelection = useCallback(() => {
    if (selectedCells.length < 5) {
      setSelectedCells([])
      return
    }
    const result = onWordSubmit(selectedCells)
    if (result) {
      const keys = new Set(selectedCells.map(cellKey))
      setFeedback(result)
      setFeedbackCells(keys)
      clearTimeout(feedbackTimer.current)
      feedbackTimer.current = window.setTimeout(() => {
        setFeedback(null)
        setFeedbackCells(new Set())
      }, result === 'valid' ? 600 : 400)
    }
    setSelectedCells([])
    isDragging.current = false
  }, [selectedCells, onWordSubmit])

  const handleCellDown = (cell: Cell) => {
    if (disabled) return
    isDragging.current = true
    setFeedback(null)
    setFeedbackCells(new Set())
    setSelectedCells([cell])
  }

  const handleCellEnter = (cell: Cell) => {
    if (!isDragging.current || disabled) return
    if (canSelect(cell)) setSelectedCells(prev => [...prev, cell])
  }

  const handleCellUp = (cell: Cell) => {
    if (!isDragging.current || disabled) return
    if (canSelect(cell) && !isSelected(cell)) {
      setSelectedCells(prev => {
        const next = [...prev, cell]
        if (next.length >= 5) {
          const result = onWordSubmit(next)
          if (result) {
            const keys = new Set(next.map(cellKey))
            setFeedback(result)
            setFeedbackCells(keys)
            clearTimeout(feedbackTimer.current)
            feedbackTimer.current = window.setTimeout(() => {
              setFeedback(null)
              setFeedbackCells(new Set())
            }, result === 'valid' ? 600 : 400)
          }
        }
        isDragging.current = false
        return []
      })
    } else {
      submitSelection()
    }
  }

  useEffect(() => {
    const onMouseUp = () => { if (isDragging.current) submitSelection() }
    window.addEventListener('mouseup', onMouseUp)
    window.addEventListener('touchend', onMouseUp)
    return () => {
      window.removeEventListener('mouseup', onMouseUp)
      window.removeEventListener('touchend', onMouseUp)
    }
  }, [submitSelection])

  const getCellFromTouch = (touch: React.Touch): Cell | null => {
    const el = document.elementFromPoint(touch.clientX, touch.clientY)
    if (!el) return null
    const rowStr = el.getAttribute('data-row')
    const colStr = el.getAttribute('data-col')
    if (rowStr === null || colStr === null) return null
    return grid[parseInt(rowStr)][parseInt(colStr)]
  }

  const handleTouchMove = (e: React.TouchEvent) => {
    e.preventDefault()
    const touch = e.touches[0]
    const cell = getCellFromTouch(touch)
    if (cell && canSelect(cell)) setSelectedCells(prev => [...prev, cell])
  }

  const currentWord = selectedCells.map(c => c.letter.toUpperCase()).join('')

  return (
    <div className="flex flex-col items-center gap-4">
      {/* Mot en cours */}
      {!discoveryPath && !disabled && (
        <div className="h-10 flex items-center">
          <span className={`text-2xl font-bold tracking-widest transition-all ${
            selectedCells.length > 0 ? 'text-blue-300' : 'text-slate-600'
          }`}>
            {currentWord || '···'}
          </span>
        </div>
      )}

      {/* Grille */}
      <div
        className={`grid grid-cols-4 gap-3 p-3 bg-slate-800/50 rounded-2xl border border-slate-700 select-none ${disabled ? 'pointer-events-none' : ''}`}
        onTouchMove={handleTouchMove}
      >
        {grid.map((row, r) =>
          row.map((cell, c) => {
            const key = cellKey(cell)
            const selected = isSelected(cell)
            const last = isLast(cell)
            const inFeedback = feedbackCells.has(key)
            const fbColor = feedback && inFeedback ? FEEDBACK_COLORS[feedback] : ''
            const fbAnim = feedback && inFeedback ? FEEDBACK_ANIM[feedback] : ''
            const selectedIdx = selectedCells.findIndex(s => cellKey(s) === key)
            const inDiscovery = discoveryKeys?.has(key)
            const discoveryIdx = discoveryOrder?.[key]

            return (
              <div
                key={`${r}-${c}`}
                data-row={r}
                data-col={c}
                onMouseDown={() => handleCellDown(cell)}
                onMouseEnter={() => handleCellEnter(cell)}
                onMouseUp={() => handleCellUp(cell)}
                onTouchStart={() => handleCellDown(cell)}
                className={`
                  relative w-[72px] h-[72px] flex items-center justify-center
                  rounded-xl border-2 font-bold text-xl uppercase
                  transition-all duration-150 touch-none
                  ${disabled ? 'cursor-default' : 'cursor-pointer'}
                  ${inFeedback && feedback
                    ? `${fbColor} ${fbAnim}`
                    : inDiscovery
                    ? 'bg-violet-600 border-violet-400 text-white shadow-lg shadow-violet-500/40'
                    : selected
                    ? last
                      ? 'bg-blue-500 border-blue-400 text-white scale-105 shadow-lg shadow-blue-500/40'
                      : 'bg-blue-700 border-blue-600 text-blue-100'
                    : 'bg-slate-700 border-slate-600 text-slate-100 hover:bg-slate-600 hover:border-slate-500'
                  }
                `}
              >
                {cell.letter.toUpperCase()}
                {inDiscovery && discoveryIdx && (
                  <span className="absolute top-0.5 right-1.5 text-[10px] text-violet-200 font-normal">
                    {discoveryIdx}
                  </span>
                )}
                {selected && !inFeedback && !inDiscovery && (
                  <span className="absolute top-0.5 right-1.5 text-[10px] text-blue-300 font-normal">
                    {selectedIdx + 1}
                  </span>
                )}
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}

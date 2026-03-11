import { useEffect, useRef, useState } from 'react'

interface TimerProps {
  duration: number // secondes
  onEnd: () => void
  running: boolean
}

export default function Timer({ duration, onEnd, running }: TimerProps) {
  const [remaining, setRemaining] = useState(duration)
  const intervalRef = useRef<number>(0)
  const onEndRef = useRef(onEnd)
  onEndRef.current = onEnd

  useEffect(() => {
    setRemaining(duration)
  }, [duration])

  useEffect(() => {
    if (!running) {
      clearInterval(intervalRef.current)
      return
    }
    intervalRef.current = window.setInterval(() => {
      setRemaining(prev => {
        if (prev <= 1) {
          clearInterval(intervalRef.current)
          onEndRef.current()
          return 0
        }
        return prev - 1
      })
    }, 1000)
    return () => clearInterval(intervalRef.current)
  }, [running])

  const pct = remaining / duration
  const mins = Math.floor(remaining / 60)
  const secs = remaining % 60
  const timeStr = `${mins}:${secs.toString().padStart(2, '0')}`

  const color = pct > 0.5 ? 'text-green-400' : pct > 0.25 ? 'text-yellow-400' : 'text-red-400'
  const ringColor = pct > 0.5 ? 'stroke-green-400' : pct > 0.25 ? 'stroke-yellow-400' : 'stroke-red-400'

  const radius = 28
  const circumference = 2 * Math.PI * radius
  const dashOffset = circumference * (1 - pct)

  return (
    <div className="relative w-20 h-20 flex items-center justify-center">
      <svg className="absolute inset-0 -rotate-90" width="80" height="80">
        <circle cx="40" cy="40" r={radius} fill="none" stroke="#1e293b" strokeWidth="6" />
        <circle
          cx="40" cy="40" r={radius}
          fill="none"
          strokeWidth="6"
          strokeDasharray={circumference}
          strokeDashoffset={dashOffset}
          strokeLinecap="round"
          className={`${ringColor} transition-all duration-1000`}
        />
      </svg>
      <span className={`text-lg font-bold tabular-nums ${color}`}>{timeStr}</span>
    </div>
  )
}

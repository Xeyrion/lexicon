import { useCallback, useEffect, useReducer, useState } from 'react'
import type { PendingSessionCard, SessionCard } from '../types'

interface LearningState {
  pending: PendingSessionCard[]
  learning: SessionCard[]
}

type LearningAction =
  | { type: 'add'; card: SessionCard; dueAt: number; now: number }
  | { type: 'tick'; now: number }
  | { type: 'shift' }
  | { type: 'reset' }

function reducer(state: LearningState, action: LearningAction): LearningState {
  switch (action.type) {
    case 'add': {
      if (action.dueAt <= action.now) {
        return { ...state, learning: [...state.learning, action.card] }
      }
      const pending = [...state.pending, { card: action.card, dueAt: action.dueAt }]
      pending.sort((a, b) => a.dueAt - b.dueAt)
      return { ...state, pending }
    }
    case 'tick': {
      if (state.pending.length === 0) return state
      const ready = state.pending.filter((item) => item.dueAt <= action.now)
      if (ready.length === 0) return state
      return {
        pending: state.pending.filter((item) => item.dueAt > action.now),
        learning: [...state.learning, ...ready.map((item) => item.card)],
      }
    }
    case 'shift':
      return { ...state, learning: state.learning.slice(1) }
    case 'reset':
      return { pending: [], learning: [] }
  }
}

export function useLearningSteps() {
  const [state, dispatch] = useReducer(reducer, { pending: [], learning: [] })
  const [now, setNow] = useState(() => Date.now())

  const add = useCallback((card: SessionCard, dueAt: number) => {
    const current = Date.now()
    setNow(current)
    dispatch({ type: 'add', card, dueAt, now: current })
  }, [])

  const shift = useCallback(() => {
    dispatch({ type: 'shift' })
  }, [])

  const reset = useCallback(() => {
    dispatch({ type: 'reset' })
    setNow(Date.now())
  }, [])

  useEffect(() => {
    if (state.pending.length === 0) return
    const tick = () => {
      const current = Date.now()
      setNow(current)
      dispatch({ type: 'tick', now: current })
    }
    tick()
    const interval = window.setInterval(tick, 1000)
    const onVisible = () => {
      if (document.visibilityState === 'visible') tick()
    }
    window.addEventListener('focus', tick)
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      window.clearInterval(interval)
      window.removeEventListener('focus', tick)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [state.pending.length])

  return {
    pending: state.pending,
    learning: state.learning,
    now,
    add,
    shift,
    reset,
  }
}

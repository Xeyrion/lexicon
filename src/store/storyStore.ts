import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import type { Story, StoryMeta, StorySave, StoryVarValue } from '../types'
import { createFileBackedStorage } from '../lib/storage'
import {
  applyEffects,
  findNode,
  isChoiceAvailable,
  startVars,
} from '../lib/story'
import { isPlainObject, sanitizeStories } from '../lib/validation'

const STORAGE_NAME = 'lexicon-stories-v1'

interface StoryState {
  /** Imported stories only; the built-in one ships with the app. */
  stories: Story[]
  saves: Record<string, StorySave>
  meta: Record<string, StoryMeta>
  importStory: (story: Story) => void
  removeStory: (id: string) => void
  startStory: (story: Story) => void
  choose: (story: Story, choiceId: string) => void
  undo: (story: Story) => void
  clearSave: (storyId: string) => void
}

function nowIso(): string {
  return new Date().toISOString()
}

function emptyMeta(): StoryMeta {
  return { unlockedEndings: [], runs: 0 }
}

function sanitizeSaves(value: unknown): Record<string, StorySave> {
  if (!isPlainObject(value)) return {}
  const saves: Record<string, StorySave> = {}
  for (const [storyId, raw] of Object.entries(value)) {
    if (!isPlainObject(raw) || typeof raw.nodeId !== 'string') continue
    const vars: Record<string, StoryVarValue> = {}
    if (isPlainObject(raw.vars)) {
      for (const [name, item] of Object.entries(raw.vars)) {
        if (typeof item === 'string' || typeof item === 'boolean') vars[name] = item
        else if (typeof item === 'number' && Number.isFinite(item)) vars[name] = item
      }
    }
    const history: StorySave['history'] = []
    if (Array.isArray(raw.history)) {
      for (const entry of raw.history) {
        if (!isPlainObject(entry)) continue
        if (typeof entry.nodeId !== 'string' || typeof entry.choiceId !== 'string') continue
        const snapshot: Record<string, StoryVarValue> = {}
        if (isPlainObject(entry.vars)) {
          for (const [name, item] of Object.entries(entry.vars)) {
            if (typeof item === 'string' || typeof item === 'boolean') snapshot[name] = item
            else if (typeof item === 'number' && Number.isFinite(item)) snapshot[name] = item
          }
        }
        history.push({ nodeId: entry.nodeId, choiceId: entry.choiceId, vars: snapshot })
      }
    }
    saves[storyId] = {
      nodeId: raw.nodeId,
      vars,
      visited: Array.isArray(raw.visited)
        ? raw.visited.filter((item): item is string => typeof item === 'string')
        : [raw.nodeId],
      history,
      updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : nowIso(),
    }
  }
  return saves
}

function sanitizeMeta(value: unknown): Record<string, StoryMeta> {
  if (!isPlainObject(value)) return {}
  const meta: Record<string, StoryMeta> = {}
  for (const [storyId, raw] of Object.entries(value)) {
    if (!isPlainObject(raw)) continue
    meta[storyId] = {
      unlockedEndings: Array.isArray(raw.unlockedEndings)
        ? raw.unlockedEndings.filter((item): item is string => typeof item === 'string')
        : [],
      runs: typeof raw.runs === 'number' && Number.isFinite(raw.runs) ? raw.runs : 0,
    }
  }
  return meta
}

export const useStoryStore = create<StoryState>()(
  persist(
    (setState, get) => ({
      stories: [],
      saves: {},
      meta: {},

      importStory: (story) => {
        setState((state) => {
          const others = state.stories.filter((item) => item.id !== story.id)
          return { stories: [story, ...others] }
        })
      },

      removeStory: (id) => {
        setState((state) => {
          const saves = { ...state.saves }
          const meta = { ...state.meta }
          delete saves[id]
          delete meta[id]
          return { stories: state.stories.filter((item) => item.id !== id), saves, meta }
        })
      },

      startStory: (story) => {
        setState((state) => {
          const previous = state.meta[story.id] ?? emptyMeta()
          return {
            saves: {
              ...state.saves,
              [story.id]: {
                nodeId: story.start,
                vars: startVars(story),
                visited: [story.start],
                history: [],
                updatedAt: nowIso(),
              },
            },
            meta: { ...state.meta, [story.id]: { ...previous, runs: previous.runs + 1 } },
          }
        })
      },

      choose: (story, choiceId) => {
        const state = get()
        const save = state.saves[story.id]
        if (!save) return
        const node = findNode(story, save.nodeId)
        if (!node) return
        const choice = (node.choices ?? []).find((item) => item.id === choiceId)
        if (!choice || !isChoiceAvailable(choice, save.vars)) return

        const nextVars = applyEffects(save.vars, choice.effects)
        const nextNode = findNode(story, choice.to)
        const visited = save.visited.includes(choice.to)
          ? save.visited
          : [...save.visited, choice.to]

        const meta = state.meta[story.id] ?? emptyMeta()
        const unlocked =
          nextNode?.ending && !meta.unlockedEndings.includes(nextNode.ending)
            ? [...meta.unlockedEndings, nextNode.ending]
            : meta.unlockedEndings

        setState({
          saves: {
            ...state.saves,
            [story.id]: {
              nodeId: choice.to,
              vars: nextVars,
              visited,
              // Snapshot the state *before* the choice so undo can restore vars.
              history: [...save.history, { nodeId: save.nodeId, choiceId, vars: save.vars }],
              updatedAt: nowIso(),
            },
          },
          meta: { ...state.meta, [story.id]: { ...meta, unlockedEndings: unlocked } },
        })
      },

      undo: (story) => {
        const state = get()
        const save = state.saves[story.id]
        if (!save || save.history.length === 0) return
        const history = [...save.history]
        const previous = history.pop()
        if (!previous) return
        setState({
          saves: {
            ...state.saves,
            [story.id]: {
              nodeId: previous.nodeId,
              vars: previous.vars,
              // `visited` is exploration history: stepping back does not unsee.
              visited: save.visited,
              history,
              updatedAt: nowIso(),
            },
          },
        })
      },

      clearSave: (storyId) => {
        setState((state) => {
          const saves = { ...state.saves }
          delete saves[storyId]
          return { saves }
        })
      },
    }),
    {
      name: STORAGE_NAME,
      version: 1,
      storage: createJSONStorage(() =>
        // Every choice is a deliberate click, not typing: a shorter debounce
        // shrinks the window where closing the tab loses the last step.
        createFileBackedStorage({ kind: 'stories', debounceMs: 300 }),
      ),
      partialize: (state) => ({
        stories: state.stories,
        saves: state.saves,
        meta: state.meta,
      }),
      merge: (persisted, current) => {
        const saved = isPlainObject(persisted) ? persisted : {}
        return {
          ...current,
          stories: sanitizeStories(saved.stories),
          saves: sanitizeSaves(saved.saves),
          meta: sanitizeMeta(saved.meta),
        }
      },
    },
  ),
)

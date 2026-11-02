export interface GameEntry {
  id: string
  title: string
  subtitle: string
  description: string
  tags: string[]
  status: 'ready' | 'soon'
  route: string
}

/**
 * The hub renders this list. Adding a game = one entry here + one route +
 * one module under `src/game/<id>/`; the hub itself never changes.
 */
export const GAMES: GameEntry[] = [
  {
    id: 'remake',
    title: '人生模拟器',
    subtitle: '一年一年地过完一生',
    description: '抽天赋、分配属性，然后一年一年地活下去。正文里的词可以点开查。',
    tags: ['文字', '人生'],
    status: 'ready',
    route: '/game/remake',
  },
]

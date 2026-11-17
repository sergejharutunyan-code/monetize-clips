import type { Trend } from './types'

export type View = 'dashboard' | 'trends' | 'studio' | 'videos' | 'assemble' | 'publish' | 'styles' | 'accounts' | 'playbook'

/** What a page should open on: a video project, or a trend to write about. */
export interface Focus {
  clipId?: string
  trend?: Trend
  angle?: string
}

export type Go = (view: View, focus?: Focus) => void

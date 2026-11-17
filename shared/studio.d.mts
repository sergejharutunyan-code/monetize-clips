// Types for studio.mjs (the module is plain JavaScript so the backend can run it as-is).

export type FormatId = 'story' | 'howto' | 'explainer' | 'myth' | 'whatif' | 'top3'

export interface Format {
  id: FormatId
  label: string
  blurb: string
  beats: string[]
}

export interface CaptionStyle {
  font: 'marker' | 'block' | 'rounded'
  fill: string
  stroke: string
  box: 'none' | 'pill' | 'paper'
  accent: string
  uppercase: boolean
}

export interface StylePreset {
  id: string
  name: string
  look: string
  palette: string
  motion: string
  character: string
  voice: string
  music: string
  caption: CaptionStyle
  builtIn?: boolean
}

export interface SourceLink {
  title: string
  url: string
}

export type TrendSource = 'ai' | 'google' | 'wikipedia' | 'youtube' | 'examples' | 'manual'

export interface Trend {
  id: string
  source: TrendSource
  title: string
  summary: string
  whyNow?: string
  niche?: string
  freshness?: 'today' | 'this_week' | 'this_month' | 'evergreen'
  angles?: { format: FormatId; idea: string }[]
  sources?: SourceLink[]
  url?: string
  caution?: string
  /** e.g. "200K+ searches" or "1.2M views". */
  traffic?: string
  thumb?: string
  fetchedAt: string
}

export interface Scene {
  n: number
  start: number
  duration: number
  visual: string
  camera: string
  narration: string
  onScreenText: string
  sfx: string
}

export interface Plot {
  title: string
  hook: string
  logline: string
  format: FormatId
  tone: string
  seconds: number
  beats: string[]
  characters: { name: string; look: string }[]
  scenes: Scene[]
  narration: string
  narrationWords: number
  caption: string
  hashtags: string[]
  factNotes: string
  provider: 'claude' | 'local'
  createdAt: string
}

export interface PromptPart {
  index: number
  scenes: number[]
  start: number
  seconds: number
  duration: number
  prompt: string
}

export interface TrendRequestInput {
  niche?: string
  region?: string
  count?: number
  focus?: string
  model?: string
}

export interface PlotRequestInput {
  trend: Pick<Trend, 'title'> & Partial<Pick<Trend, 'summary' | 'whyNow' | 'url' | 'sources'>>
  angle?: string
  format: FormatId
  style: StylePreset
  seconds: number
  tone?: string
  factCheck?: boolean
  model?: string
}

/** Parameters for the SDK's beta.messages.create. */
export type MessageRequest = Record<string, unknown> & {
  model: string
  messages: { role: 'user' | 'assistant'; content: unknown }[]
}

export const CLAUDE_MODEL: string
export const WORDS_PER_SECOND: number
export const FORMATS: Format[]
export const FORMAT_IDS: FormatId[]
export const TONES: string[]
export const STYLE_PRESETS: StylePreset[]
export const TREND_TOOL: { name: string }
export const PLOT_TOOL: { name: string }

export function formatById(id: string): Format
export function durationPlan(seconds: number): { seconds: number; words: number; scenes: number }
export function toolInput(message: unknown, toolName: string): unknown
export function searchSources(message: unknown): SourceLink[]
export function buildTrendRequest(input?: TrendRequestInput): MessageRequest
export function normalizeTrends(input: unknown, extraSources?: SourceLink[]): Trend[]
export function buildPlotRequest(input: PlotRequestInput): MessageRequest
export function nudgeFor(toolName: string): { role: 'user'; content: string }
export function normalizePlot(
  input: unknown,
  ctx: { seconds: number; format: string; tone?: string; trend?: { title?: string }; provider?: 'claude' | 'local' },
): Plot
export function composeHiggsfieldPrompts(
  plot: Plot,
  style: StylePreset,
  opts?: { maxSeconds?: number; narration?: 'voiceover' | 'model'; aspect?: string },
): PromptPart[]
export function characterSheetPrompt(plot: Plot, style: StylePreset): string
export function plotToText(plot: Plot, style: StylePreset, parts: PromptPart[]): string
export function localPlot(input: {
  trend: { title: string }
  format: FormatId
  style: StylePreset
  seconds: number
  tone?: string
}): Plot

export type CreateMessage = (params: MessageRequest) => Promise<unknown>
export function runForTool(create: CreateMessage, params: MessageRequest, toolName: string): Promise<{ input: unknown; sources: SourceLink[] }>
export function researchTrendsWith(create: CreateMessage, opts: TrendRequestInput): Promise<Trend[]>
export function writePlotWith(create: CreateMessage, opts: PlotRequestInput): Promise<Plot>

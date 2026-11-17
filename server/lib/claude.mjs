// Claude on the server: trend research (with web search) and plot writing.
// The requests and the loop live in shared/studio.mjs so the browser's
// "own key" mode sends exactly the same thing.

import Anthropic from '@anthropic-ai/sdk'
import { CLAUDE_MODEL, researchTrendsWith, writePlotWith } from '../../shared/studio.mjs'

export const MODEL = process.env.CLIPFORGE_MODEL || CLAUDE_MODEL
export const isConfigured = () => Boolean(process.env.ANTHROPIC_API_KEY)

let client
const getClient = () => (client ??= new Anthropic()) // reads ANTHROPIC_API_KEY (and ANTHROPIC_BASE_URL)

/** Call Claude, turning SDK errors into messages worth showing (with an HTTP status). */
async function create(params) {
  try {
    return await getClient().beta.messages.create(params)
  } catch (e) {
    const err = (message, status) => Object.assign(new Error(message), { status })
    if (e instanceof Anthropic.AuthenticationError) throw err('The server’s Anthropic API key was rejected.', 502)
    if (e instanceof Anthropic.RateLimitError) throw err('Claude is rate-limited right now. Try again in a minute.', 429)
    if (e instanceof Anthropic.APIError) throw err(`Claude request failed (${e.status ?? 'network'}): ${e.message}`, 502)
    throw e
  }
}

export const researchTrends = (opts) => researchTrendsWith(create, { ...opts, model: MODEL })
export const writePlot = (opts) => writePlotWith(create, { ...opts, model: MODEL })

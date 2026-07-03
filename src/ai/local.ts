import type { TwoPartConcept } from '../types'
import { HASHTAG_BANK } from '../data'

/**
 * Deterministic, offline concept generator. Produces a plausible two-part clip
 * breakdown from a video's metadata using proven hook/premise templates. This is
 * the "workshop" engine — it lets the whole flow run with no API key, and doubles
 * as the fallback when the Claude proxy is unreachable.
 */
export function analyzeLocal(video: {
  title: string
  creator: string
  niche: string
}): TwoPartConcept {
  const { title, creator, niche } = video
  const tags = (extra: string[]) =>
    [...HASHTAG_BANK.base.slice(0, 3), ...(HASHTAG_BANK[niche] ?? []).slice(0, 2), ...extra]

  return {
    sourceTitle: title,
    sourceCreator: creator,
    niche,
    angle:
      `The moment carries a clear tension and a delayed payoff, which is ideal for a ` +
      `two-part split: Part 1 sets the stakes and cuts on the cliffhanger to drive ` +
      `follows and "part 2?" comments; Part 2 delivers the resolution and rewards the ` +
      `return visit. Both are strong standalone ${niche.toLowerCase()} clips.`,
    part1: {
      label: 'Part 1 — The Hook',
      premiseShort: `Set up the ${niche.toLowerCase()} moment and cut right before the payoff.`,
      premiseBroad:
        `Open cold on the highest-tension beat of "${title}". Establish who and what's at ` +
        `stake in under 10 seconds, then hard-cut on the cliffhanger so viewers have to ` +
        `follow for the resolution. No payoff here — the whole job of this clip is to make ` +
        `people need Part 2.`,
      hook: `Wait for it… this is where it gets crazy.`,
      caption: `Part 1 — you are NOT ready for part 2 😅 Follow so you don't miss it.`,
      hashtags: tags(['#part1', '#waitforit']),
      clipWindow: '0:00–0:18',
    },
    part2: {
      label: 'Part 2 — The Payoff',
      premiseShort: `Deliver the resolution and the one-line takeaway.`,
      premiseBroad:
        `Pick up exactly where Part 1 cut off and pay off the tension immediately — lead ` +
        `with the result, then give the single sentence that makes the moment worth sharing. ` +
        `Close with a reason to follow ${creator ? `(and credit ${creator})` : ''} so the ` +
        `return viewer converts.`,
      hook: `Here's what actually happened…`,
      caption: `Part 2 — the payoff 🔥 Part 1 is on the profile. Full clip + credit in comments.`,
      hashtags: tags(['#part2', '#payoff']),
      clipWindow: '0:15–0:45',
    },
    provider: 'local',
  }
}

import type { Platform, PlatformPost } from '../types'
import { PLATFORM_META } from '../data'
import { fmtDateTime } from '../utils'

/** The small coloured tile that stands for a platform. */
export function PlatformIcon({ platform, size = 22 }: { platform: Platform; size?: number }) {
  return (
    <span
      className="platform-icon"
      style={{ width: size, height: size, fontSize: Math.round(size * 0.52), background: PLATFORM_META[platform].color }}
      aria-hidden
    >
      {PLATFORM_META[platform].glyph}
    </span>
  )
}

const POST_LABEL: Record<PlatformPost['status'], string> = {
  not_posted: 'not posted',
  scheduled: 'scheduled',
  publishing: 'publishing',
  published: 'live',
  draft: 'draft sent',
  failed: 'failed',
}

export const postLabel = (post: PlatformPost) => POST_LABEL[post.status]

/** One-line description of where a post stands, for tooltips and lists. */
export function describePost(post: PlatformPost): string {
  const name = PLATFORM_META[post.platform].label
  switch (post.status) {
    case 'scheduled':
      return `${name}: scheduled for ${fmtDateTime(post.scheduledAt)}${post.jobId ? ' (posts automatically)' : ' (post it yourself)'}`
    case 'publishing':
      return `${name}: ${post.note || 'publishing'}…`
    case 'published':
      return `${name}: live`
    case 'draft':
      return `${name}: draft sent — finish it in the app`
    case 'failed':
      return `${name}: failed — ${post.error || 'see details'}`
    default:
      return `${name}: not posted`
  }
}

/** Status pill for a post. */
export function PostBadge({ post }: { post: PlatformPost }) {
  return <span className={`badge post-${post.status}`}>{postLabel(post)}</span>
}

/** Platform dots for a clip row: filled when something is out or on its way, marked when failed. */
export function PlatformDots({ posts }: { posts: PlatformPost[] }) {
  return (
    <span className="platform-dots">
      {posts.map((post) => (
        <span
          key={post.platform}
          className={`pd ${post.status !== 'not_posted' ? 'on' : ''} ${post.status === 'failed' ? 'bad' : ''} ${post.status === 'publishing' ? 'busy' : ''}`}
          style={{ background: PLATFORM_META[post.platform].color }}
          title={describePost(post)}
        >
          {post.status === 'failed' ? '!' : PLATFORM_META[post.platform].glyph}
        </span>
      ))}
    </span>
  )
}

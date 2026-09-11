import { Icon } from '../components/Icon'
import { FeatureIcon } from '../components/FeatureIcon'
import { Emoji } from '../components/Emoji'
import { HeroMark } from '../components/Mark'
import { useBrowser } from '../../browser/store'
import { useDataset } from '../../fmhy/store'
import { FEATURES, HERO, HERO_ACTIONS, type HomeAction } from '../../fmhy/home'
import { openExternal, type PlatformInfo } from '../../platform'
import { SyncBanner } from './FmhyPage'
import { UpdateBanner } from './UpdateBanner'
import './views.css'
import './Home.css'

export function Home({ platform }: { platform: PlatformInfo }) {
  const navigate = useBrowser((s) => s.navigate)
  const setPaletteOpen = useBrowser((s) => s.setPaletteOpen)
  const status = useDataset((s) => s.status)

  const follow = (action: HomeAction) => {
    if (action.target.startsWith('http')) {
      // Off-site destinations open in the app's browser, not the OS one.
      navigate({ view: 'web', url: action.target })
      return
    }
    navigate({ view: 'categories', page: action.target })
  }

  return (
    <div className="home scroll">
      <div className="home__inner">
        <SyncBanner />
        <UpdateBanner />

        <header className="hero">
          <div className="hero__text">
            {/*
              * FMHY's announcement pill names the current month's post. Ours
              * points at the posts index instead, so it cannot go stale.
              */}
            <button
              className="hero__badge"
              onClick={() => navigate({ view: 'web', url: 'https://fmhy.net/posts' })}
            >
              Latest Updates <Emoji name="sparkles" size={14} />
            </button>
            <h1 className="hero__name">{HERO.name}</h1>
            <p className="hero__tagline">{HERO.tagline}</p>
            <div className="hero__actions">
              {HERO_ACTIONS.map((action) => (
                <button
                  key={action.label}
                  className={`hero__button hero__button--${action.kind}`}
                  onClick={() => follow(action)}
                >
                  {action.label}
                </button>
              ))}
              <button
                className="hero__button hero__button--alt"
                onClick={() => setPaletteOpen(true)}
                title={`Search (${platform.modKey}K)`}
              >
                <Icon name="search" size={13} /> Search
              </button>
            </div>
          </div>
          <HeroMark />
        </header>

        <h2 className="home__browse">
          Or browse these pages <Emoji name="sparkles" size={17} />
        </h2>

        <div className="features">
          {FEATURES.map((feature) => (
            <button
              key={feature.slug}
              className="feature"
              onClick={() => navigate({ view: 'categories', page: feature.slug })}
            >
              <span className="feature__icon">
                <FeatureIcon name={feature.icon} color={feature.color} />
              </span>
              <span className="feature__title">{feature.title}</span>
              <span className="feature__details">{feature.details}</span>
            </button>
          ))}
        </div>

        {status && (
          <p
            style={{
              marginTop: 'var(--space-9)',
              fontSize: 'var(--text-sm)',
              color: 'var(--text-tertiary)',
            }}
          >
            {status.links.toLocaleString()} resources indexed locally ·{' '}
            <button
              className="link-button"
              onClick={() => void openExternal('https://fmhy.net')}
            >
              fmhy.net
            </button>
          </p>
        )}
      </div>
    </div>
  )
}

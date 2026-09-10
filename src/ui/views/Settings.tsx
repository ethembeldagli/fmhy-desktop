import { useEffect, useState } from 'react'
import { useBrowser, type ThemePreference } from '../../browser/store'
import { useDataset } from '../../fmhy/store'
import { onEvent } from '../../platform'
import {
  appIcon,
  contentView,
  openExternal,
  type AppInfo,
  adblock,
  privacy as privacyApi,
  shield,
  type AdblockStatus,
  type PrivacySettings,
  type IconSettings,
  type PlatformInfo,
  type ShieldSettings,
} from '../../platform'
import { FMHY_SOURCES } from '../../fmhy/catalog'
import './views.css'
import './Settings.css'

const SECTIONS = [
  'Appearance',
  'Browser',
  'FMHY',
  'Search',
  'Downloads',
  'Privacy',
  'Shortcuts',
  'About',
] as const

type Section = (typeof SECTIONS)[number]

function Field({
  label,
  help,
  children,
}: {
  label: string
  help?: string
  children?: React.ReactNode
}) {
  return (
    <div className="field">
      <div>
        <div className="field__label">{label}</div>
        {help && <div className="field__help">{help}</div>}
      </div>
      {children && <div className="field__control">{children}</div>}
    </div>
  )
}

function Segmented<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T
  options: { value: T; label: string }[]
  onChange: (value: T) => void
}) {
  return (
    <div className="segmented" role="radiogroup">
      {options.map((option) => (
        <button
          key={option.value}
          role="radio"
          aria-checked={value === option.value}
          className={`segmented__option${value === option.value ? ' segmented__option--active' : ''}`}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}

function formatWhen(seconds: number): string {
  if (!seconds) return 'never'
  const delta = Date.now() / 1000 - seconds
  if (delta < 90) return 'just now'
  if (delta < 3600) return `${Math.round(delta / 60)} minutes ago`
  if (delta < 86400) return `${Math.round(delta / 3600)} hours ago`
  return new Date(seconds * 1000).toLocaleDateString()
}

function FmhySettings() {
  const { status, syncing, progress, error, sync } = useDataset()

  return (
    <div style={{ marginTop: 'var(--space-6)' }}>
      <div className="notice">
        Content comes from FMHY's public wiki source, fetched directly from{' '}
        <strong>github.com/fmhy/edit</strong> and stored locally. Nothing about your use of it is
        sent anywhere.
      </div>

      <div style={{ marginTop: 'var(--space-6)' }}>
        <Field
          label="Local index"
          help={
            status
              ? `${status.links.toLocaleString()} resources across ${status.sections.toLocaleString()} sections in ${status.pages} pages.`
              : 'No index yet. It builds automatically on first launch.'
          }
        />
        <Field label="Last updated" help={status ? formatWhen(status.lastSynced) : 'never'}>
          <button className="button" disabled={syncing} onClick={() => void sync()}>
            {syncing ? 'Updating…' : 'Update now'}
          </button>
        </Field>
        {syncing && progress && (
          <Field
            label="Progress"
            help={`${progress.label} · ${progress.done}/${progress.total} pages`}
          />
        )}
        {error && <Field label="Last error" help={error} />}
      </div>
    </div>
  )
}

function Toggle({
  label,
  help,
  checked,
  onChange,
}: {
  label: string
  help: string
  checked: boolean
  onChange: (value: boolean) => void
}) {
  return (
    <Field label={label} help={help}>
      <Segmented
        value={checked ? 'on' : 'off'}
        onChange={(next) => onChange(next === 'on')}
        options={[
          { value: 'on', label: 'On' },
          { value: 'off', label: 'Off' },
        ]}
      />
    </Field>
  )
}

function PrivacyControls() {
  const [settings, setSettings] = useState<PrivacySettings | null>(null)

  useEffect(() => {
    void privacyApi.settings().then(setSettings)
  }, [])

  if (!settings) return null

  const update = (patch: Partial<PrivacySettings>) => {
    const next = { ...settings, ...patch }
    setSettings(next)
    void privacyApi.set(next)
  }

  return (
    <div style={{ marginTop: 'var(--space-6)' }}>
      <Toggle
        label="Private browsing"
        help="Sites open in an ephemeral session: cookies, cache and local storage are kept in memory and never written to disk. Applies to pages opened after the change, and means you will not stay signed in to anything."
        checked={settings.privateBrowsing}
        onChange={(privateBrowsing) => update({ privateBrowsing })}
      />
      <Toggle
        label="Clear browsing data on exit"
        help="Wipe cookies, cache and local storage when the app closes, while keeping them during a session."
        checked={settings.clearOnExit}
        onChange={(clearOnExit) => update({ clearOnExit })}
      />
    </div>
  )
}

function AdblockSection() {
  const [status, setStatus] = useState<AdblockStatus | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    void adblock.status().then(setStatus)
    // The build runs in the background; the status event reports when it lands.
    const unlisten = onEvent<AdblockStatus>('adblock://status', setStatus)
    return () => {
      void unlisten.then((off) => off())
    }
  }, [])

  if (!status) return null

  if (!status.supported) {
    return (
      <div className="notice" style={{ marginTop: 'var(--space-6)' }}>
        Content blocking is not available on this platform yet.
      </div>
    )
  }

  const detail = status.ready
    ? `${status.rules.toLocaleString()} rules from ${status.sourceFilters.toLocaleString()} filters, compiled in ${status.compileMillis} ms.`
    : status.enabled
      ? 'Building the rule list…'
      : 'Blocking is off.'

  return (
    <div style={{ marginTop: 'var(--space-6)' }}>
      <div className="notice">
        <strong>Ads and trackers are blocked before they load.</strong> Filter lists are
        compiled into rules the browser engine enforces in its own network path — the same
        mechanism Safari content blockers use, so no extension is involved.
      </div>

      <div style={{ marginTop: 'var(--space-6)' }}>
        <Toggle
          label="Block ads and trackers"
          help={detail}
          checked={status.enabled}
          onChange={(enabled) => {
            setStatus({ ...status, enabled })
            setBusy(true)
            void adblock.setEnabled(enabled).finally(() => setBusy(false))
          }}
        />
        <Field
          label="Filter lists"
          help={status.sources.filter((s) => s.enabled).map((s) => s.title).join(' · ')}
        >
          <button
            className="button"
            disabled={busy || !status.enabled}
            onClick={() => {
              setBusy(true)
              void adblock.refresh().finally(() => setBusy(false))
            }}
          >
            {busy ? 'Updating…' : 'Update lists'}
          </button>
        </Field>
        {status.lastError && <Field label="Last error" help={status.lastError} />}
      </div>
    </div>
  )
}

function BrowserSettings() {
  const [settings, setSettings] = useState<ShieldSettings | null>(null)

  useEffect(() => {
    void shield.settings().then(setSettings)
  }, [])

  if (!settings) return null

  const update = (patch: Partial<ShieldSettings>) => {
    const next = { ...settings, ...patch }
    setSettings(next)
    void shield.set(next)
  }

  return (
    <div>
      <AdblockSection />

      <div className="notice" style={{ marginTop: 'var(--space-8)' }}>
        <strong>These run inside the page, not as an extension.</strong> The engines this app
        embeds cannot load browser extensions, so protection is built in instead. It takes effect
        on pages opened after a change.
      </div>

      <div style={{ marginTop: 'var(--space-6)' }}>
        <Toggle
          label="Block popups"
          help="Stops window.open unless it follows a real click on a link — the popunder pattern sketchy sites rely on."
          checked={settings.blockPopups}
          onChange={(blockPopups) => update({ blockPopups })}
        />
        <Toggle
          label="Remove interstitials"
          help="Removes full-screen overlays that cover the page, and restores scrolling when a page locks it."
          checked={settings.removeOverlays}
          onChange={(removeOverlays) => update({ removeOverlays })}
        />
        <Toggle
          label="Hide ad containers"
          help="Hides elements that identify themselves as advertising. Cosmetic only — it does not block network requests."
          checked={settings.hideAds}
          onChange={(hideAds) => update({ hideAds })}
        />
      </div>
    </div>
  )
}

function AppIconField() {
  const [settings, setSettings] = useState<IconSettings | null>(null)

  useEffect(() => {
    void appIcon.settings().then(setSettings)
  }, [])

  // macOS applies the system-wide icon style (Default, Dark, Clear, Tinted)
  // itself, so offering a control here would only conflict with it.
  if (!settings?.switchable) return null

  return (
    <Field
      label="App icon"
      help="Which icon this app shows in the taskbar and window. macOS manages this itself."
    >
      <Segmented<'light' | 'dark'>
        value={settings.variant}
        onChange={(variant) => {
          setSettings({ ...settings, variant })
          void appIcon.set(variant)
        }}
        options={[
          { value: 'light', label: 'Light' },
          { value: 'dark', label: 'Dark' },
        ]}
      />
    </Field>
  )
}

export function Settings({ app, platform }: { app: AppInfo; platform: PlatformInfo }) {
  const [section, setSection] = useState<Section>('Appearance')
  const theme = useBrowser((s) => s.theme)
  const setTheme = useBrowser((s) => s.setTheme)
  const railCollapsed = useBrowser((s) => s.railCollapsed)
  const toggleRail = useBrowser((s) => s.toggleRail)

  const mod = platform.modKey

  return (
    <div className="settings">
      <nav className="settings__nav" aria-label="Settings sections">
        {SECTIONS.map((name) => (
          <button
            key={name}
            className={`settings__nav-item${section === name ? ' settings__nav-item--active' : ''}`}
            onClick={() => setSection(name)}
          >
            {name}
          </button>
        ))}
      </nav>

      <div className="settings__panel">
        <div className="settings__panel-inner">
          <h1 className="view__title" style={{ fontSize: 'var(--text-xl)' }}>
            {section}
          </h1>

          {section === 'Appearance' && (
            <div style={{ marginTop: 'var(--space-6)' }}>
              <Field label="Theme" help="Match the operating system, or pin a single appearance.">
                <Segmented<ThemePreference>
                  value={theme}
                  onChange={setTheme}
                  options={[
                    { value: 'system', label: 'System' },
                    { value: 'light', label: 'Light' },
                    { value: 'dark', label: 'Dark' },
                  ]}
                />
              </Field>
              <AppIconField />
              <Field label="Sidebar" help={`Collapse the navigation rail to icons (${mod}B).`}>
                <Segmented
                  value={railCollapsed ? 'collapsed' : 'expanded'}
                  onChange={(next) => {
                    if ((next === 'collapsed') !== railCollapsed) toggleRail()
                  }}
                  options={[
                    { value: 'expanded', label: 'Expanded' },
                    { value: 'collapsed', label: 'Collapsed' },
                  ]}
                />
              </Field>
            </div>
          )}

          {section === 'Privacy' && (
            <div style={{ marginTop: 'var(--space-6)' }}>
              <div className="notice">
                <strong>Nothing leaves this machine.</strong> History, favorites and downloads are
                stored in a local SQLite database. The app collects no telemetry, and the only
                requests it makes on its own are for the public FMHY dataset and your filter
                lists. Trackers are blocked by EasyPrivacy in the content blocker.
              </div>

              <PrivacyControls />
              <div style={{ marginTop: 'var(--space-6)' }}>
                <Field
                  label="Clear browsing data"
                  help="Removes cookies, cache and local storage from every site opened in the app."
                >
                  <button className="button button--danger" onClick={() => void contentView.clearData()}>
                    Clear data
                  </button>
                </Field>
              </div>
            </div>
          )}

          {section === 'Shortcuts' && (
            <table className="shortcut-table" style={{ marginTop: 'var(--space-6)' }}>
              <tbody>
                {[
                  ['Command palette', `${mod}K`],
                  ['Focus address bar', `${mod}L`],
                  ['New tab', `${mod}T`],
                  ['Close tab', `${mod}W`],
                  ['Reopen closed tab', `${mod}⇧T`],
                  ['Next / previous tab', `${mod}⌥→ / ←`],
                  ['Jump to tab 1–8', `${mod}1–8`],
                  ['Back / forward', `${mod}[ / ]`],
                  ['Reload', `${mod}R`],
                  ['Toggle sidebar', `${mod}B`],
                  ['Find in page', `${mod}F`],
                ].map(([action, keys]) => (
                  <tr key={action}>
                    <td>{action}</td>
                    <td>{keys}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {section === 'About' && (
            <div style={{ marginTop: 'var(--space-6)' }}>
              <div className="notice">
                <strong>FMHY Desktop is an unofficial, third-party client.</strong> It is not
                affiliated with, endorsed by, or an official product of FMHY. All indexed content
                belongs to the FMHY project and its contributors.
              </div>
              <div style={{ marginTop: 'var(--space-6)' }}>
                <Field label="Version" help={`FMHY Desktop ${app.version} · ${platform.os}`} />
                <Field
                  label="Local search index"
                  help={
                    app.searchReady
                      ? 'SQLite full-text search is available.'
                      : 'SQLite was built without FTS5; search will be degraded.'
                  }
                />
                <Field label="FMHY website" help="The official project this app indexes.">
                  <button className="link-button" onClick={() => void openExternal(FMHY_SOURCES.site)}>
                    fmhy.net
                  </button>
                </Field>
                <Field label="Dataset source" help="Public wiki content, fetched from FMHY's own repository.">
                  <button
                    className="link-button"
                    onClick={() => void openExternal(FMHY_SOURCES.repo)}
                  >
                    github.com/fmhy/edit
                  </button>
                </Field>
                <Field
                  label="Emoji artwork"
                  help="Twemoji by Twitter/X, licensed CC-BY 4.0. Used so emoji match FMHY's site on every platform."
                >
                  <button
                    className="link-button"
                    onClick={() => void openExternal('https://github.com/jdecked/twemoji')}
                  >
                    Twemoji
                  </button>
                </Field>
                <Field
                  label="Wiki content"
                  help="All indexed content is the work of FMHY and its contributors, used under the terms of their repository."
                />
              </div>
            </div>
          )}

          {section === 'FMHY' && <FmhySettings />}
          {section === 'Browser' && <BrowserSettings />}

          {(section === 'Search' || section === 'Downloads') && (
            <div className="pending" style={{ marginTop: 'var(--space-6)' }}>
              {section} preferences are added alongside that subsystem.
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

import {
  Script, Navigation,
  VStack, HStack,
  Text, Button, Image, TextField, ScrollView, Spacer,
  TabView, Tab,
  Divider,
  useObservable, useState,
  ContentUnavailableView,
} from "scripting"
import type { ShapeStyle, Color, ColorScheme, DynamicShapeStyle } from "scripting"

declare const Safari: {
  present?: (url: string, fullscreen?: boolean) => Promise<void>
  openURL?: (url: string) => Promise<boolean>
} | undefined

// ─── Types ────────────────────────────────────────────────────────────────────

type ThemeStyle = ShapeStyle | DynamicShapeStyle

type JmHost = {
  id: string
  label: string
  url: string
  group: string
  note: string
}

type AppSettings = {
  hostId: string
  customUrl: string
  lastKeyword: string
  lastAlbumId: string
  lastPhotoId: string
  fullscreen: boolean
}

type MainTab = "browse" | "search" | "fav" | "download" | "settings"

type AppTheme = {
  scheme: ColorScheme
  pageBackground: ThemeStyle
  cardBackground: ThemeStyle
  cardGrad: ThemeStyle
  cellBackground: ThemeStyle
  textPrimary: Color
  textSecondary: Color
  textTertiary: Color
  accent: Color
  accentText: Color
  divider: Color
}

// ─── Constants ────────────────────────────────────────────────────────────────

const PINK = "#FF375F"
const PINK_DARK = "#C8284A"
const PINK_GRAD_TOP = "#3A1A2E"
const PINK_GRAD_BOT = "#1E1220"
const CARD_BG = "#1C1C1E"
const CELL_BG = "#2C2C2E"
const DIVIDER = "#38383A"

const SETTINGS_KEY = "jmcomic_scripting_settings_v3"

const HOSTS: JmHost[] = [
  { id: "18comic.vip",        label: "18comic.vip",         url: "https://18comic.vip",        group: "国际通用",   note: "不支援日本/韩国路线" },
  { id: "18comic.ink",        label: "18comic.ink",         url: "https://18comic.ink",        group: "国际通用",   note: "备用国际域名" },
  { id: "jmcomic-zzz.one",    label: "jmcomic-zzz.one",     url: "https://jmcomic-zzz.one",    group: "东南亚路线", note: "东南亚建议使用，默认线路" },
  { id: "jmcomic-zzz.org",    label: "jmcomic-zzz.org",     url: "https://jmcomic-zzz.org",    group: "东南亚路线", note: "东南亚备用" },
  { id: "comic18j-codi.net",  label: "comic18j-codi.net",   url: "https://comic18j-codi.net",  group: "内地域名",   note: "请使用 Chrome 开启" },
  { id: "comic18j-babu.cc",   label: "comic18j-babu.cc",    url: "https://comic18j-babu.cc",   group: "分流 1",     note: "发布页分流线路" },
  { id: "comic18j-babu.club", label: "comic18j-babu.club",  url: "https://comic18j-babu.club", group: "分流 2",     note: "发布页分流线路" },
  { id: "jmcomicmi.net",      label: "jmcomicmi.net 发布页", url: "https://jmcomicmi.net",      group: "发布页",     note: "最新地址发布页" },
]

const DEFAULT_SETTINGS: AppSettings = {
  hostId: "jmcomic-zzz.one",
  customUrl: "",
  lastKeyword: "",
  lastAlbumId: "",
  lastPhotoId: "",
  fullscreen: true,
}

// ─── Utilities ────────────────────────────────────────────────────────────────

const normalizeBaseUrl = (value: string): string => {
  const trimmed = value.trim()
  if (!trimmed) return ""
  const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`
  return withProtocol.replace(/\/+$/, "")
}

const loadSettings = (): AppSettings => {
  const raw = Storage.get<string>(SETTINGS_KEY)
  if (!raw) return DEFAULT_SETTINGS
  try {
    const parsed = JSON.parse(raw) as Partial<AppSettings>
    return {
      hostId: typeof parsed.hostId === "string" ? parsed.hostId : DEFAULT_SETTINGS.hostId,
      customUrl: typeof parsed.customUrl === "string" ? parsed.customUrl : "",
      lastKeyword: typeof parsed.lastKeyword === "string" ? parsed.lastKeyword : "",
      lastAlbumId: typeof parsed.lastAlbumId === "string" ? parsed.lastAlbumId : "",
      lastPhotoId: typeof parsed.lastPhotoId === "string" ? parsed.lastPhotoId : "",
      fullscreen: parsed.fullscreen !== false,
    }
  } catch {
    return DEFAULT_SETTINGS
  }
}

const saveSettings = (settings: AppSettings): void => {
  Storage.set(SETTINGS_KEY, JSON.stringify(settings))
}

const getSelectedHost = (settings: AppSettings): JmHost =>
  HOSTS.find(item => item.id === settings.hostId) ?? HOSTS[0]

const getBaseUrl = (settings: AppSettings): string => {
  if (settings.hostId === "custom") return normalizeBaseUrl(settings.customUrl) || HOSTS[0].url
  return getSelectedHost(settings).url
}

const joinUrl = (base: string, path: string): string =>
  `${base.replace(/\/+$/, "")}/${path.replace(/^\/+/, "")}`

const buildUrl = (settings: AppSettings, mode: string, value?: string): string => {
  const base = getBaseUrl(settings)
  const clean = String(value ?? "").trim()
  switch (mode) {
    case "search":
      return joinUrl(base, `/search/photos?search_query=${encodeURIComponent(clean)}&main_tag=0&o=mr`)
    case "album":
      return joinUrl(base, `/album/${encodeURIComponent(clean)}`)
    case "photo":
      return joinUrl(base, `/photo/${encodeURIComponent(clean)}`)
    case "url":
      return /^https?:\/\//i.test(clean) ? clean : joinUrl(base, clean)
    default:
      return base
  }
}

const openWebReader = async (url: string, fullscreen: boolean): Promise<void> => {
  const safari = typeof Safari !== "undefined" ? Safari : undefined
  if (safari?.present) {
    await safari.present(url, fullscreen)
    return
  }
  if (safari?.openURL) {
    const ok = await safari.openURL(url)
    if (!ok) throw new Error(`无法打开：${url}`)
    return
  }
  throw new Error("当前 Scripting 版本找不到全局 Safari API，请升级 Scripting；或在脚本内复制链接到浏览器打开。")
}

const formatRelativeTime = (timestamp: number): string => {
  const diff = Date.now() - timestamp
  if (diff < 60_000) return "刚刚"
  if (diff < 3_600_000) return `${Math.max(1, Math.floor(diff / 60_000))} 分钟前`
  if (diff < 86_400_000) return `${Math.max(1, Math.floor(diff / 3_600_000))} 小时前`
  if (diff < 172_800_000) return "昨天"
  return `${Math.max(2, Math.floor(diff / 86_400_000))} 天前`
}

// ─── Theme ────────────────────────────────────────────────────────────────────

const buildAppTheme = (): AppTheme => ({
  scheme: "dark",
  pageBackground: "systemBackground",
  cardBackground: CARD_BG,
  cardGrad: {
    light: { colors: [PINK_GRAD_TOP, PINK_GRAD_BOT], startPoint: "top", endPoint: "bottom" },
    dark: { colors: [PINK_GRAD_TOP, PINK_GRAD_BOT], startPoint: "top", endPoint: "bottom" },
  },
  cellBackground: CELL_BG,
  textPrimary: "white",
  textSecondary: "#AEAEB2",
  textTertiary: "#636366",
  accent: PINK,
  accentText: "white",
  divider: DIVIDER,
})

const theme = buildAppTheme()

// ─── Common UI Components ─────────────────────────────────────────────────────

function GlassCard(props: {
  children: import("scripting").VirtualNode[]
  padding?: import("scripting").EdgeInsets
}) {
  return <VStack
    alignment="leading"
    spacing={16}
    padding={props.padding ?? { horizontal: 20, vertical: 20 }}
    frame={{ maxWidth: "infinity" }}
    background={{
      style: theme.cardGrad,
      shape: { type: "rect", cornerRadius: 24, style: "continuous" },
    }}
  >
    {props.children}
  </VStack>
}

function StatTile(props: {
  icon: string
  label: string
  value: string
}) {
  return <VStack
    spacing={8}
    alignment="center"
    frame={{ maxWidth: "infinity" }}
    padding={{ vertical: 16, horizontal: 8 }}
    background={{
      style: "rgba(255,255,255,0.06)",
      shape: { type: "rect", cornerRadius: 16, style: "continuous" },
    }}
  >
    <Image systemName={props.icon} font="title2" foregroundStyle={theme.accent} />
    <Text font="caption" foregroundStyle={theme.textSecondary}>{props.label}</Text>
    <Text font="title2" bold foregroundStyle={theme.textPrimary}>{props.value}</Text>
  </VStack>
}

function ActionButton(props: {
  title: string
  systemImage?: string
  prominent?: boolean
  action: () => void
}) {
  return <Button action={props.action}>
    <HStack
      spacing={6}
      alignment="center"
      frame={{ maxWidth: "infinity" }}
      padding={{ vertical: 14 }}
      background={{
        style: props.prominent ? theme.accent : "rgba(255,255,255,0.08)",
        shape: { type: "rect", cornerRadius: 16, style: "continuous" },
      }}
    >
      {props.systemImage ? <Image systemName={props.systemImage} font="subheadline" foregroundStyle={props.prominent ? theme.accentText : theme.accent} /> : null}
      <Text font="subheadline" bold foregroundStyle={props.prominent ? theme.accentText : theme.accent}>{props.title}</Text>
    </HStack>
  </Button>
}

function SectionHeader(props: { title: string }) {
  return <Text font="headline" bold foregroundStyle={theme.textPrimary} padding={{ horizontal: 4 }}>{props.title}</Text>
}

// ─── History / Favorites (in-memory, could be extended with Storage) ──────────

type HistoryRecord = {
  id: string
  title: string
  type: string
  url: string
  visitedAt: number
}

const HISTORY_KEY = "jmcomic_history_v1"
const FAV_KEY = "jmcomic_favorites_v1"

const loadHistory = (): HistoryRecord[] => {
  const raw = Storage.get<string>(HISTORY_KEY)
  if (!raw) return []
  try {
    return (JSON.parse(raw) as HistoryRecord[]).slice(0, 20)
  } catch { return [] }
}

const saveHistory = (records: HistoryRecord[]): void => {
  Storage.set(HISTORY_KEY, JSON.stringify(records.slice(0, 20)))
}

const pushHistory = (record: HistoryRecord): void => {
  const next = [record, ...loadHistory().filter(item => item.id !== record.id)].slice(0, 20)
  saveHistory(next)
}

const clearHistory = (): void => {
  Storage.remove(HISTORY_KEY)
}

type FavRecord = {
  id: string
  title: string
  type: string
  url: string
  addedAt: number
}

const loadFavorites = (): FavRecord[] => {
  const raw = Storage.get<string>(FAV_KEY)
  if (!raw) return []
  try {
    return (JSON.parse(raw) as FavRecord[]).slice(0, 100)
  } catch { return [] }
}

const saveFavorites = (records: FavRecord[]): void => {
  Storage.set(FAV_KEY, JSON.stringify(records.slice(0, 100)))
}

const isFavorite = (id: string): boolean => loadFavorites().some(item => item.id === id)

const toggleFavorite = (record: FavRecord): boolean => {
  const favs = loadFavorites()
  const idx = favs.findIndex(item => item.id === record.id)
  if (idx >= 0) {
    favs.splice(idx, 1)
    saveFavorites(favs)
    return false
  } else {
    favs.unshift(record)
    saveFavorites(favs)
    return true
  }
}

// ─── Browse Tab ───────────────────────────────────────────────────────────────

function BrowseView(props: {
  settings: AppSettings
  goSearch: () => void
  openUrl: (url: string) => void
}) {
  const history = loadHistory()
  const historyCount = history.length
  const favCount = loadFavorites().length

  const openHome = (): void => {
    const url = buildUrl(props.settings, "home")
    props.openUrl(url)
  }

  const openCategories = (): void => {
    const url = joinUrl(getBaseUrl(props.settings), "/albums/meiman")
    props.openUrl(url)
  }

  return <ScrollView
    background={{ style: theme.pageBackground }}
  >
    <VStack spacing={20} padding={{ horizontal: 16, top: 16, bottom: 40 }} alignment="leading">
      {/* Hero card */}
      <GlassCard>
        <VStack alignment="leading" spacing={4}>
          <Text font="caption" foregroundStyle={theme.accent} uppercase bold>JM · HOME</Text>
          <Text font="largeTitle" bold foregroundStyle={theme.textPrimary}>今日推荐</Text>
        </VStack>
        <Text font="subheadline" foregroundStyle={theme.textSecondary}>
          默认打开美漫分类；阅读会调用 Scripting 的 Safari 网页能力打开。
        </Text>
        <HStack spacing={12}>
          <StatTile icon="heart.fill" label="收藏" value={`${favCount} 本`} />
          <StatTile icon="clock.arrow.circlepath" label="历史" value={`${historyCount} 本`} />
        </HStack>
        <HStack spacing={12}>
          <ActionButton title="刷新" systemImage="arrow.clockwise" prominent action={openHome} />
          <ActionButton title="美漫分类" systemImage="square.grid.2x2" action={openCategories} />
        </HStack>
      </GlassCard>

      <Divider />

      {/* Editor's pick — static demo */}
      <SectionHeader title="编辑推荐" />
      <HStack
        spacing={12}
        padding={{ vertical: 12, horizontal: 16 }}
        background={{
          style: theme.cellBackground,
          shape: { type: "rect", cornerRadius: 16, style: "continuous" },
        }}
        frame={{ maxWidth: "infinity" }}
      >
        <Image filePath="https://cdn-msp2.18comic.org/media/albums/422866/328279t.jpg" />
        <VStack alignment="leading" spacing={4} frame={{ maxWidth: "infinity" }}>
          <Text font="headline" bold foregroundStyle={theme.textPrimary}>禁漫首页精选</Text>
          <Text font="caption" foregroundStyle={theme.textSecondary}>打开禁漫天堂首页</Text>
        </VStack>
        <Image systemName="chevron.right" font="subheadline" foregroundStyle={theme.textTertiary} />
      </HStack>

      {/* Latest updates — history list */}
      <SectionHeader title="最近阅读" />
      {historyCount === 0 ? (
        <Text font="subheadline" foregroundStyle={theme.textTertiary} padding={{ horizontal: 16 }}>还没有阅读记录，去搜索看看吧</Text>
      ) : (
        <VStack spacing={0} alignment="leading">
          {history.slice(0, 8).map(item => (
            <VStack key={item.id} spacing={0} alignment="leading">
              <Button action={() => props.openUrl(item.url)}>
                <HStack spacing={12} padding={{ vertical: 12, horizontal: 16 }} frame={{ maxWidth: "infinity" }}>
                  <Image systemName="book.fill" font="title3" foregroundStyle={theme.accent} />
                  <VStack alignment="leading" spacing={2} frame={{ maxWidth: "infinity" }}>
                    <Text font="subheadline" bold foregroundStyle={theme.textPrimary}>{item.title}</Text>
                    <Text font="caption" foregroundStyle={theme.textSecondary}>{item.type} · {formatRelativeTime(item.visitedAt)}</Text>
                  </VStack>
                  <Image systemName="chevron.right" font="caption" foregroundStyle={theme.textTertiary} />
                </HStack>
              </Button>
              <Divider />
            </VStack>
          ))}
        </VStack>
      )}
    </VStack>
  </ScrollView>
}

// ─── Search Tab ───────────────────────────────────────────────────────────────

function SearchView(props: {
  settings: AppSettings
  openUrl: (url: string, title: string, type: string, id: string) => void
}) {
  const keywordText = useObservable<string>(props.settings.lastKeyword)
  const albumText = useObservable<string>(props.settings.lastAlbumId)
  const photoText = useObservable<string>(props.settings.lastPhotoId)

  const doSearch = (): void => {
    const clean = keywordText.value.trim()
    if (!clean) {
      Dialog.alert({ title: "提示", message: "请输入关键词或 JM 号" })
      return
    }
    const url = buildUrl(props.settings, "search", clean)
    props.openUrl(url, clean, "搜索", `search_${clean}`)
  }

  const openAlbum = (): void => {
    const clean = albumText.value.trim().replace(/^JM/i, "")
    if (!/^\d+$/.test(clean)) {
      Dialog.alert({ title: "提示", message: "Album ID 需为纯数字" })
      return
    }
    const url = buildUrl(props.settings, "album", clean)
    props.openUrl(url, `JM${clean}`, "本子", `album_${clean}`)
  }

  const openPhoto = (): void => {
    const clean = photoText.value.trim().replace(/^JM/i, "")
    if (!/^\d+$/.test(clean)) {
      Dialog.alert({ title: "提示", message: "Photo ID 需为纯数字" })
      return
    }
    const url = buildUrl(props.settings, "photo", clean)
    props.openUrl(url, `Photo ${clean}`, "章节", `photo_${clean}`)
  }

  const openCustomPath = async (): Promise<void> => {
    const value = await Dialog.prompt({
      title: "打开路径或网址",
      message: "例如 /albums 或完整 https:// 链接",
      defaultValue: "/albums",
      confirmLabel: "打开",
      cancelLabel: "取消",
    })
    if (value == null || value.trim().length === 0) return
    const url = buildUrl(props.settings, "url", value)
    props.openUrl(url, "自定义页面", "网页", `url_${Date.now()}`)
  }

  return <ScrollView background={{ style: theme.pageBackground }}>
    <VStack spacing={20} padding={{ horizontal: 16, top: 16, bottom: 40 }} alignment="leading">
      <GlassCard padding={{ horizontal: 20, vertical: 24 }}>
        <Text font="title2" bold foregroundStyle={theme.textPrimary}>搜索漫画</Text>
        <Text font="caption" foregroundStyle={theme.textSecondary}>输入关键词、作者、标签或 JM 车号</Text>
        <TextField
          title="关键词"
          value={keywordText.value}
          onChanged={keywordText.setValue}
          prompt="例如：連載中"
        />
        <ActionButton title="搜索" systemImage="magnifyingglass" prominent action={doSearch} />
      </GlassCard>

      <GlassCard padding={{ horizontal: 20, vertical: 24 }}>
        <Text font="title2" bold foregroundStyle={theme.textPrimary}>直接打开本子</Text>
        <Text font="caption" foregroundStyle={theme.textSecondary}>输入 Album ID（纯数字）</Text>
        <TextField
          title="Album ID"
          value={albumText.value}
          onChanged={albumText.setValue}
          prompt="例如：422866"
          keyboardType="numberPad"
        />
        <ActionButton title="打开本子详情" systemImage="book.closed" action={openAlbum} />
      </GlassCard>

      <GlassCard padding={{ horizontal: 20, vertical: 24 }}>
        <Text font="title2" bold foregroundStyle={theme.textPrimary}>直接打开章节</Text>
        <Text font="caption" foregroundStyle={theme.textSecondary}>输入 Photo ID（纯数字）</Text>
        <TextField
          title="Photo ID"
          value={photoText.value}
          onChanged={photoText.setValue}
          prompt="例如：413446"
          keyboardType="numberPad"
        />
        <ActionButton title="打开章节阅读" systemImage="book" action={openPhoto} />
      </GlassCard>

      <GlassCard padding={{ horizontal: 20, vertical: 24 }}>
        <Text font="title2" bold foregroundStyle={theme.textPrimary}>自定义路径</Text>
        <Text font="caption" foregroundStyle={theme.textSecondary}>输入站内路径或完整网址</Text>
        <ActionButton title="输入并打开" systemImage="link" action={openCustomPath} />
      </GlassCard>
    </VStack>
  </ScrollView>
}

// ─── Favorites Tab ────────────────────────────────────────────────────────────

function FavoritesView(props: { openUrl: (url: string) => void }) {
  const [favs, setFavs] = useState<FavRecord[]>(loadFavorites())

  const removeFav = (id: string): void => {
    const next = favs.filter(item => item.id !== id)
    saveFavorites(next)
    setFavs(next)
  }

  if (favs.length === 0) {
    return <VStack
      frame={{ maxWidth: "infinity", maxHeight: "infinity" }}
      background={{ style: theme.pageBackground }}
    >
      <ContentUnavailableView
        title="还没有收藏"
        systemImage="heart"
        description="在搜索或阅读时收藏的漫画会出现在这里"
      />
    </VStack>
  }

  return <ScrollView background={{ style: theme.pageBackground }}>
    <VStack spacing={0} padding={{ horizontal: 16, vertical: 16 }} alignment="leading">
      {favs.map(item => (
        <VStack key={item.id} spacing={0} alignment="leading">
          <HStack spacing={12} padding={{ vertical: 12, horizontal: 16 }} frame={{ maxWidth: "infinity" }} background={{
            style: theme.cellBackground,
            shape: { type: "rect", cornerRadius: 0, style: "continuous" },
          }}>
            <Button action={() => props.openUrl(item.url)}>
              <HStack spacing={12} frame={{ maxWidth: "infinity" }}>
                <Image systemName="heart.fill" font="title3" foregroundStyle={theme.accent} />
                <VStack alignment="leading" spacing={2} frame={{ maxWidth: "infinity" }}>
                  <Text font="subheadline" bold foregroundStyle={theme.textPrimary}>{item.title}</Text>
                  <Text font="caption" foregroundStyle={theme.textSecondary}>{item.type} · {formatRelativeTime(item.addedAt)}</Text>
                </VStack>
              </HStack>
            </Button>
            <Button action={() => removeFav(item.id)}>
              <Image systemName="trash" font="subheadline" foregroundStyle={theme.textTertiary} />
            </Button>
          </HStack>
          <Divider />
        </VStack>
      ))}
    </VStack>
  </ScrollView>
}

// ─── Download Tab (placeholder) ───────────────────────────────────────────────

function DownloadView() {
  return <VStack
    frame={{ maxWidth: "infinity", maxHeight: "infinity" }}
    background={{ style: theme.pageBackground }}
  >
    <ContentUnavailableView
      title="暂不支持下载"
      systemImage="arrow.down.circle"
      description="本脚本为 WebView 在线阅读模式，下载功能将在后续版本中考虑"
    />
  </VStack>
}

// ─── Settings Tab ─────────────────────────────────────────────────────────────

function SettingsView(props: {
  settings: AppSettings
  setSettings: (next: AppSettings) => void
}) {
  const { settings, setSettings } = props

  const setCustomHost = async (): Promise<void> => {
    const value = await Dialog.prompt({
      title: "自定义域名",
      message: "输入新域名，例如 18comic.example",
      defaultValue: settings.customUrl,
      confirmLabel: "保存",
      cancelLabel: "取消",
    })
    if (value == null) return
    const customUrl = normalizeBaseUrl(value)
    if (!customUrl) return
    setSettings({ ...settings, hostId: "custom", customUrl })
  }

  const toggleFullscreen = (): void => {
    setSettings({ ...settings, fullscreen: !settings.fullscreen })
  }

  const clearAllHistory = async (): Promise<void> => {
    const confirmed = await Dialog.confirm({
      title: "清空历史",
      message: "确定清空全部阅读历史吗？",
      confirmLabel: "清空",
      cancelLabel: "取消",
    })
    if (!confirmed) return
    clearHistory()
    await Dialog.alert({ title: "已清空", message: "阅读历史已清除" })
  }

  return <ScrollView background={{ style: theme.pageBackground }}>
    <VStack spacing={20} padding={{ horizontal: 16, top: 16, bottom: 40 }} alignment="leading">
      {/* Host selection */}
      <GlassCard>
        <Text font="title3" bold foregroundStyle={theme.textPrimary}>线路切换</Text>
        <Text font="caption" foregroundStyle={theme.textSecondary}>
          当前：{settings.hostId === "custom" ? "自定义" : getSelectedHost(settings).label}
        </Text>
        <Text font="caption" foregroundStyle={theme.textSecondary}>
          {getBaseUrl(settings)}
        </Text>

        <VStack spacing={0} alignment="leading">
          {HOSTS.map(host => (
            <VStack key={host.id} spacing={0} alignment="leading">
              <Button action={() => setSettings({ ...settings, hostId: host.id })}>
                <HStack spacing={12} padding={{ vertical: 12 }} frame={{ maxWidth: "infinity" }}>
                  <Image
                    systemName={settings.hostId === host.id ? "checkmark.circle.fill" : "circle"}
                    foregroundStyle={settings.hostId === host.id ? theme.accent : theme.textTertiary}
                  />
                  <VStack alignment="leading" spacing={2} frame={{ maxWidth: "infinity" }}>
                    <Text font="subheadline" bold foregroundStyle={theme.textPrimary}>{host.label}</Text>
                    <Text font="caption" foregroundStyle={theme.textSecondary}>{host.group} · {host.note}</Text>
                  </VStack>
                </HStack>
              </Button>
              <Divider />
            </VStack>
          ))}
        </VStack>

        <Button action={setCustomHost}>
          <HStack
            spacing={8}
            padding={{ vertical: 14 }}
            frame={{ maxWidth: "infinity" }}
            background={{
              style: "rgba(255,255,255,0.08)",
              shape: { type: "rect", cornerRadius: 16, style: "continuous" },
            }}
          >
            <Image systemName="globe" foregroundStyle={theme.accent} />
            <Text bold foregroundStyle={theme.accent}>自定义域名</Text>
          </HStack>
        </Button>
      </GlassCard>

      {/* Display settings */}
      <GlassCard>
        <Text font="title3" bold foregroundStyle={theme.textPrimary}>显示设置</Text>
        <Button action={toggleFullscreen}>
          <HStack spacing={12} frame={{ maxWidth: "infinity" }}>
            <Image systemName={settings.fullscreen ? "arrow.up.left.and.arrow.down.right" : "rectangle"} foregroundStyle={theme.accent} />
            <Text foregroundStyle={theme.textPrimary}>WebView {settings.fullscreen ? "全屏" : "非全屏"}</Text>
            <Spacer />
            <Text foregroundStyle={theme.textSecondary}>{settings.fullscreen ? "开启" : "关闭"}</Text>
          </HStack>
        </Button>
      </GlassCard>

      {/* Data management */}
      <GlassCard>
        <Text font="title3" bold foregroundStyle={theme.textPrimary}>数据管理</Text>
        <Button action={clearAllHistory}>
          <HStack spacing={12} frame={{ maxWidth: "infinity" }}>
            <Image systemName="trash" foregroundStyle={theme.accent} />
            <Text foregroundStyle={theme.textPrimary}>清空阅读历史</Text>
            <Spacer />
          </HStack>
        </Button>
      </GlassCard>

      {/* About */}
      <GlassCard>
        <Text font="title3" bold foregroundStyle={theme.textPrimary}>关于</Text>
        <Text font="subheadline" foregroundStyle={theme.textSecondary}>
          JM 禁漫天堂阅读脚本 v1.0
        </Text>
        <Text font="caption" foregroundStyle={theme.textTertiary}>
          使用 Scripting 全局 Safari API 打开禁漫天堂网站（不再从 scripting 导入 Safari，避免你的版本报错）。首次遇到 Cloudflare 验证请手动完成，之后通常会保持通过状态。本脚本不绕过任何验证机制。
        </Text>
      </GlassCard>
    </VStack>
  </ScrollView>
}

// ─── Main App ─────────────────────────────────────────────────────────────────

function App() {
  const [settings, setSettingsState] = useState<AppSettings>(loadSettings())
  const tabSelection = useObservable<MainTab>("browse")
  const [, forceUpdate] = useState(0)

  const setSettings = (next: AppSettings): void => {
    saveSettings(next)
    setSettingsState(next)
  }

  const openUrl = (url: string, title?: string, type?: string, id?: string): void => {
    if (title && type && id) {
      pushHistory({ id, title, type, url, visitedAt: Date.now() })
    }
    openWebReader(url, settings.fullscreen).then(() => {
      // Force refresh when WebView is dismissed
      forceUpdate(n => n + 1)
    }).catch((error) => {
      Dialog.alert({ title: "打开失败", message: String(error) })
    })
  }

  const openUrlSimple = (url: string): void => {
    openUrl(url)
  }

  return <TabView
    selection={tabSelection}
    background={{ style: theme.pageBackground }}
  >
    <Tab title="浏览" systemImage="house.fill" value="browse">
      <BrowseView settings={settings} goSearch={() => tabSelection.setValue("search")} openUrl={openUrlSimple} />
    </Tab>
    <Tab title="搜索" systemImage="magnifyingglass" value="search" role="search">
      <SearchView settings={settings} openUrl={(url, title, type, id) => openUrl(url, title, type, id)} />
    </Tab>
    <Tab title="收藏" systemImage="heart" value="fav">
      <FavoritesView openUrl={openUrlSimple} />
    </Tab>
    <Tab title="下载" systemImage="arrow.down.circle" value="download">
      <DownloadView />
    </Tab>
    <Tab title="设置" systemImage="gearshape" value="settings">
      <SettingsView settings={settings} setSettings={setSettings} />
    </Tab>
  </TabView>
}

async function run() {
  await Navigation.present({ element: <App /> })
  Script.exit()
}

run().catch(error => {
  console.error(error)
  Script.exit({ error: String(error) })
})

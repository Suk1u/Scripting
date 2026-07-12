import {
  Script,
  Navigation,
  NavigationStack,
  VStack,
  HStack,
  ScrollView,
  Text,
  Button,
  Spacer,
  Divider,
  TextField,
  useState,
  WebViewController,
} from "scripting"

type JmHost = {
  id: string
  label: string
  url: string
  group: string
  note: string
}

type LaunchMode = "home" | "search" | "album" | "photo" | "url"

type AppSettings = {
  hostId: string
  customUrl: string
  lastKeyword: string
  lastAlbumId: string
  lastPhotoId: string
  blockAds: boolean
  fullscreen: boolean
}

const SETTINGS_KEY = "jmcomic_scripting_settings_v1"

// 来自 https://jmcomicmi.net/ 发布页；同一站点的多条回家路线均可在设置中切换。
const HOSTS: JmHost[] = [
  { id: "18comic.vip", label: "18comic.vip", url: "https://18comic.vip", group: "国际通用", note: "发布页标注：不支援日本/韩国路线" },
  { id: "18comic.ink", label: "18comic.ink", url: "https://18comic.ink", group: "国际通用", note: "备用国际通用域名" },
  { id: "jmcomic-zzz.one", label: "jmcomic-zzz.one", url: "https://jmcomic-zzz.one", group: "东南亚路线", note: "发布页建议东南亚路线使用" },
  { id: "jmcomic-zzz.org", label: "jmcomic-zzz.org", url: "https://jmcomic-zzz.org", group: "东南亚路线", note: "东南亚备用域名" },
  { id: "comic18j-codi.net", label: "comic18j-codi.net", url: "https://comic18j-codi.net", group: "内地域名", note: "发布页标注：请使用 Chrome 浏览器开启" },
  { id: "comic18j-babu.cc", label: "comic18j-babu.cc", url: "https://comic18j-babu.cc", group: "分流 1", note: "发布页分流线路" },
  { id: "comic18j-babu.club", label: "comic18j-babu.club", url: "https://comic18j-babu.club", group: "分流 2", note: "发布页分流线路" },
  { id: "jm-88.cc/ZNPJam", label: "jm-88.cc/ZNPJam", url: "https://jm-88.cc/ZNPJam", group: "APP 软件下载", note: "发布页 APP 下载入口；也可作为回家路检查" },
  { id: "jmcomicmi.net", label: "jmcomicmi.net 发布页", url: "https://jmcomicmi.net", group: "发布页", note: "最新地址发布页" },
]

const DEFAULT_SETTINGS: AppSettings = {
  hostId: "18comic.vip",
  customUrl: "",
  lastKeyword: "",
  lastAlbumId: "",
  lastPhotoId: "",
  blockAds: true,
  fullscreen: true,
}

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
      blockAds: parsed.blockAds !== false,
      fullscreen: parsed.fullscreen !== false,
    }
  } catch {
    return DEFAULT_SETTINGS
  }
}

const saveSettings = (settings: AppSettings): void => {
  Storage.set(SETTINGS_KEY, JSON.stringify(settings))
}

const getSelectedHost = (settings: AppSettings): JmHost => {
  return HOSTS.find(item => item.id === settings.hostId) ?? HOSTS[0]
}

const getBaseUrl = (settings: AppSettings): string => {
  if (settings.hostId === "custom") return normalizeBaseUrl(settings.customUrl) || HOSTS[0].url
  return getSelectedHost(settings).url
}

const joinUrl = (base: string, path: string): string => `${base.replace(/\/+$/, "")}/${path.replace(/^\/+/, "")}`

const buildUrl = (settings: AppSettings, mode: LaunchMode, value?: string): string => {
  const base = getBaseUrl(settings)
  const clean = String(value ?? "").trim()
  if (mode === "search") return joinUrl(base, `/search/photos?search_query=${encodeURIComponent(clean)}&main_tag=0&o=mr`)
  if (mode === "album") return joinUrl(base, `/album/${encodeURIComponent(clean)}`)
  if (mode === "photo") return joinUrl(base, `/photo/${encodeURIComponent(clean)}`)
  if (mode === "url") return /^https?:\/\//i.test(clean) ? clean : joinUrl(base, clean)
  return base
}

const shouldBlockRequest = (url: string): boolean => {
  const lower = url.toLowerCase()
  return [
    "doubleclick.net",
    "googlesyndication.com",
    "google-analytics.com",
    "googletagmanager.com",
    "static.cloudflareinsights.com/beacon",
  ].some(item => lower.includes(item))
}

const openWebReader = async (url: string, settings: AppSettings, title = "JM 禁漫天堂"): Promise<void> => {
  const webView = new WebViewController({ ephemeral: false })
  if (settings.blockAds) {
    webView.shouldAllowRequest = async (request: { url: string }) => !shouldBlockRequest(request.url)
  }
  try {
    const ok = await webView.loadURL(url)
    if (!ok) throw new Error("WebView 加载失败")
    await webView.present({ fullscreen: settings.fullscreen, navigationTitle: title })
  } finally {
    webView.dispose()
  }
}

function HostRow(props: {
  host: JmHost
  selected: boolean
  onSelect: () => void
}) {
  return <VStack spacing={6}>
    <HStack spacing={8}>
      <Text>{props.selected ? "✅" : "▫️"}</Text>
      <VStack alignment="leading" spacing={2}>
        <Text>{props.host.label}</Text>
        <Text>{props.host.group} · {props.host.note}</Text>
      </VStack>
      <Spacer />
      <Button title="切换" action={props.onSelect} />
    </HStack>
    <Divider />
  </VStack>
}

function MainView() {
  const [settings, setSettingsState] = useState<AppSettings>(loadSettings())
  const [keyword, setKeyword] = useState(settings.lastKeyword)
  const [albumId, setAlbumId] = useState(settings.lastAlbumId)
  const [photoId, setPhotoId] = useState(settings.lastPhotoId)
  const selectedHost = getSelectedHost(settings)
  const baseUrl = getBaseUrl(settings)

  const setSettings = (next: AppSettings): void => {
    saveSettings(next)
    setSettingsState(next)
  }

  const openHome = async (): Promise<void> => {
    await openWebReader(buildUrl(settings, "home"), settings, selectedHost.label)
  }

  const openSearch = async (): Promise<void> => {
    const clean = keyword.trim()
    if (!clean) {
      await Dialog.alert({ title: "请输入关键词", message: "可以输入漫画名、作者、标签或 JM 车号。" })
      return
    }
    const next = { ...settings, lastKeyword: clean }
    setSettings(next)
    await openWebReader(buildUrl(next, "search", clean), next, `搜索：${clean}`)
  }

  const openAlbum = async (): Promise<void> => {
    const clean = albumId.trim().replace(/^JM/i, "")
    if (!/^\d+$/.test(clean)) {
      await Dialog.alert({ title: "JM 号无效", message: "请输入纯数字，例如 422866。" })
      return
    }
    const next = { ...settings, lastAlbumId: clean }
    setSettings(next)
    await openWebReader(buildUrl(next, "album", clean), next, `JM${clean}`)
  }

  const openPhoto = async (): Promise<void> => {
    const clean = photoId.trim().replace(/^JM/i, "")
    if (!/^\d+$/.test(clean)) {
      await Dialog.alert({ title: "章节号无效", message: "请输入 photo/章节页面的纯数字 ID。" })
      return
    }
    const next = { ...settings, lastPhotoId: clean }
    setSettings(next)
    await openWebReader(buildUrl(next, "photo", clean), next, `Photo ${clean}`)
  }

  const openCustomPath = async (): Promise<void> => {
    const value = await Dialog.prompt({
      title: "打开指定路径或完整网址",
      message: "可输入 /albums、/search/photos?... 或完整 https:// 链接。",
      defaultValue: "/albums",
      confirmLabel: "打开",
      cancelLabel: "取消",
    })
    if (value == null || value.trim().length === 0) return
    await openWebReader(buildUrl(settings, "url", value), settings, "JM 自定义页面")
  }

  const setCustomHost = async (): Promise<void> => {
    const value = await Dialog.prompt({
      title: "自定义域名",
      message: "输入发布页新增的域名，例如 18comic.example 或 https://example.com。",
      defaultValue: settings.customUrl,
      confirmLabel: "保存",
      cancelLabel: "取消",
    })
    if (value == null) return
    const customUrl = normalizeBaseUrl(value)
    if (!customUrl) return
    setSettings({ ...settings, hostId: "custom", customUrl })
  }

  return <NavigationStack>
    <ScrollView>
      <VStack spacing={16} padding={16}>
        <VStack alignment="leading" spacing={6}>
          <Text>JM 禁漫天堂</Text>
          <Text>当前线路：{settings.hostId === "custom" ? "自定义" : selectedHost.label}</Text>
          <Text>{baseUrl}</Text>
        </VStack>

        <HStack spacing={10}>
          <Button title="打开首页" action={openHome} />
          <Button title="分类" action={() => openWebReader(joinUrl(baseUrl, "/albums"), settings, "分类")} />
          <Button title="自定义" action={openCustomPath} />
        </HStack>

        <VStack alignment="leading" spacing={8}>
          <Text>搜索漫画</Text>
          <TextField title="关键词 / JM号" value={keyword} onChanged={setKeyword} />
          <Button title="搜索" action={openSearch} />
        </VStack>

        <VStack alignment="leading" spacing={8}>
          <Text>直接打开 JM 本子</Text>
          <TextField title="Album ID，例如 422866" value={albumId} onChanged={setAlbumId} />
          <Button title="打开本子详情" action={openAlbum} />
        </VStack>

        <VStack alignment="leading" spacing={8}>
          <Text>直接打开章节</Text>
          <TextField title="Photo ID" value={photoId} onChanged={setPhotoId} />
          <Button title="打开章节阅读" action={openPhoto} />
        </VStack>

        <Divider />
        <VStack alignment="leading" spacing={8}>
          <Text>线路设置</Text>
          <Text>发布页地址已全部内置；点“切换”后再次打开页面即可使用该线路。</Text>
          {HOSTS.map(host => <HostRow
            key={host.id}
            host={host}
            selected={settings.hostId === host.id}
            onSelect={() => setSettings({ ...settings, hostId: host.id })}
          />)}
          <HStack spacing={10}>
            <Button title="自定义域名" action={setCustomHost} />
            <Button
              title={settings.blockAds ? "关闭拦截" : "开启拦截"}
              action={() => setSettings({ ...settings, blockAds: !settings.blockAds })}
            />
            <Button
              title={settings.fullscreen ? "非全屏" : "全屏"}
              action={() => setSettings({ ...settings, fullscreen: !settings.fullscreen })}
            />
          </HStack>
        </VStack>

        <Divider />
        <VStack alignment="leading" spacing={6}>
          <Text>Cloudflare 说明</Text>
          <Text>脚本不会绕过或破解 Cloudflare。首次打开如出现验证，请在 WebView 内按网站要求完成；WebView 使用持久 Cookie，之后通常会自动保持通过状态。</Text>
        </VStack>
      </VStack>
    </ScrollView>
  </NavigationStack>
}

async function run() {
  await Navigation.present({ element: <MainView /> })
  Script.exit()
}

run().catch(error => {
  console.error(error)
  Script.exit({ error: String(error) })
})

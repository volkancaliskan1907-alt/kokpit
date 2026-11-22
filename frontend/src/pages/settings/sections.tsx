import type { ReactNode } from 'react'
import {
  AppstoreOutlined, ApartmentOutlined, BarChartOutlined, BgColorsOutlined, CheckSquareOutlined, DatabaseOutlined, EditOutlined, EnvironmentOutlined,
  FormOutlined, InboxOutlined, KeyOutlined, ProfileOutlined, ScanOutlined, SettingOutlined, SwapOutlined, TableOutlined, TagsOutlined, ThunderboltOutlined, UnorderedListOutlined,
} from '@ant-design/icons'

export interface SectionMeta {
  key: string
  label: string
  desc: string
  icon: ReactNode
}

export interface NavGroup {
  /** Bu gruptaki bölümler hangi sayfa bileşenine ait (kaydet / kaydedilmemiş takibi için) */
  page: 'general' | 'sources' | 'orders' | 'kitt' | 'dekit'
  title: string
  icon: ReactNode
  items: SectionMeta[]
}

export const NAV: NavGroup[] = [
  {
    page: 'general', title: 'Genel', icon: <SettingOutlined />,
    items: [
      { key: 'general', label: 'Kurum ve Bakım', desc: 'Şirket adı, uygulama başlığı, dosya kontrol aralığı ve önbellek.', icon: <SettingOutlined /> },
    ],
  },
  {
    page: 'sources', title: 'Veri', icon: <DatabaseOutlined />,
    items: [
      { key: 'sources', label: 'Veri Kaynakları', desc: 'Excel dosyaları / dizinleri ve aralarındaki DÜŞEYARA, ETOPLA, EĞERSAY bağlantıları.', icon: <DatabaseOutlined /> },
    ],
  },
  {
    page: 'orders', title: 'Ön Montaj', icon: <BarChartOutlined />,
    items: [
      { key: 'orders.source', label: 'Kaynak ve Kolonlar', desc: 'Sipariş (iş emri) kaynağı ve TANIM / TBDK / PROJE / Miktar kolonlarının hangi kaynak kolonundan geleceği.', icon: <DatabaseOutlined /> },
      { key: 'orders.list', label: 'Seçilebilir Siparişler', desc: 'Kullanıcının listeden seçebileceği sipariş numaraları. Boşsa kaynaktaki tüm siparişler listelenir.', icon: <UnorderedListOutlined /> },
      { key: 'orders.lookup', label: 'Tablo Kolonları', desc: 'Mk. Sayı, Proje Sorumlu, Elek No, TDP Revizyonu, Özel İşlem kolonlarının hangi özel tablodan geleceği.', icon: <TableOutlined /> },
      { key: 'orders.sync', label: 'KITT Durum Eşleştirme', desc: 'KITT sayfasında bir durum seçilince Ön Montaj Durum kolonunun hangi değere döneceği.', icon: <SwapOutlined /> },
      { key: 'orders.virtual', label: 'Giriş Kolonları', desc: 'Durum seçenekleri ve KİT TARİHİ gibi elle girilen kolonlar.', icon: <FormOutlined /> },
    ],
  },
  {
    page: 'kitt', title: 'KITT Hazırlama (Tablo)', icon: <CheckSquareOutlined />,
    items: [
      { key: 'kitt.source', label: 'Kaynak ve Satır Anahtarı', desc: 'Veri kaynağı, sipariş kolonu ve girilen değerlerin satırla eşleşmesini sağlayan anahtar kolonlar.', icon: <KeyOutlined /> },
      { key: 'kitt.columns', label: 'Tablo Kolonları', desc: 'KITT tablosunda görünecek kaynak kolonları.', icon: <TableOutlined /> },
      { key: 'kitt.virtual', label: 'Giriş Kolonları', desc: 'Kullanıcıların her satıra değer girdiği sanal kolonlar (seçim, tarih, açıklama, not...).', icon: <FormOutlined /> },
      { key: 'kitt.rules', label: 'Koşullu Biçimlendirme', desc: 'Değere göre hücre / satır renklendirme kuralları.', icon: <BgColorsOutlined /> },
    ],
  },
  {
    page: 'dekit', title: 'DEKIT', icon: <InboxOutlined />,
    items: [
      { key: 'dekit.format', label: 'İş Emri Formatı', desc: 'İş emrinden hangi kısmın silinerek depo adresinin elde edileceği ve adres eşleşme biçimi.', icon: <KeyOutlined /> },
      { key: 'dekit.stock', label: 'Stok ve KART Deposu', desc: 'LX02 kaynağı, adres / malzeme / miktar kolonları ve KART deposu şartı.', icon: <EnvironmentOutlined /> },
      { key: 'dekit.decision', label: 'Kalsın / Gitsin Kuralı', desc: '"DEKIT Geldi" durumundaki iş emirlerinde COOIS listesiyle karşılaştırma ayarları.', icon: <SwapOutlined /> },
      { key: 'dekit.columns', label: 'Liste Kolonları', desc: 'İş emrine tıklayınca açılan listede gösterilecek LX02 kolonları.', icon: <TableOutlined /> },
    ],
  },
  {
    page: 'kitt', title: 'KITT Toplama Penceresi', icon: <AppstoreOutlined />,
    items: [
      { key: 'pick.general', label: 'Açılış ve Bileşenler', desc: 'Pencerenin açılması ve bileşen listesinin (COOIS) hangi kolonlarla gösterileceği.', icon: <ApartmentOutlined /> },
      { key: 'pick.stock', label: 'Depo Adresleri', desc: 'Her malzeme için stok kaynağından (LX02) gösterilecek adresler.', icon: <EnvironmentOutlined /> },
      { key: 'pick.scan', label: 'Barkod / Karekod', desc: 'Okutulan kodun hangi kolonla eşleşeceği.', icon: <ScanOutlined /> },
      { key: 'pick.process', label: 'İşlem Tipi', desc: 'Delik içi / özel işlem gibi seçenekler, bağlı özel tablolar ve ilerleme sayımı.', icon: <SwapOutlined /> },
      { key: 'pick.kanban', label: 'Kanban', desc: 'Kanban malzemelerinin gösterimi ve kanban depo yeri miktarı.', icon: <ThunderboltOutlined /> },
      { key: 'pick.markers', label: 'Etiket Kolonları', desc: 'Malzeme bir özel tabloda kayıtlıysa etiket gösteren ek kolonlar.', icon: <TagsOutlined /> },
      { key: 'pick.virtual', label: 'Giriş Kolonları', desc: 'Toplama tablosuna eklenen, kullanıcının değer girdiği sanal kolonlar.', icon: <EditOutlined /> },
    ],
  },
]

export const ALL_SECTIONS: (SectionMeta & { page: NavGroup['page']; group: string })[] =
  NAV.flatMap((g) => g.items.map((i) => ({ ...i, page: g.page, group: g.title })))

export const metaOf = (key: string) => ALL_SECTIONS.find((s) => s.key === key) ?? ALL_SECTIONS[0]

/** Eski adreslerdeki ?tab= değerlerini yeni bölüm anahtarlarına çevirir. */
export const LEGACY_TABS: Record<string, string> = { sources: 'sources', orders: 'orders.source', kitt: 'kitt.source', general: 'general' }

export const ProfileIcon = ProfileOutlined

export interface GeneralSettings {
  companyName: string
  departmentName: string
  appTitle: string
  refreshSeconds: number
}

export interface KeyPair {
  localColumn: string
  targetColumn: string
}

export interface FilterCondition {
  column: string
  operator: string
  value?: string | null
  value2?: string | null
}

export type ComputedType =
  | 'lookup' | 'lookupLast' | 'join' | 'sumif' | 'countif' | 'avgif' | 'minif' | 'maxif' | 'formula'

export interface ComputedColumnDef {
  id: string
  name: string
  type: ComputedType
  targetSourceId?: string | null
  keys: KeyPair[]
  targetValueColumn?: string | null
  targetFilters: FilterCondition[]
  formula?: string | null
  defaultValue?: string | null
}

export interface DataSourceDef {
  id: string
  name: string
  description?: string | null
  path: string
  filePattern: string
  mode: 'latest' | 'merge'
  includeSubfolders: boolean
  sheetName?: string | null
  headerRow: number
  addFileNameColumn: boolean
  computedColumns: ComputedColumnDef[]
}

export type ColumnFormat = 'auto' | 'text' | 'number' | 'integer' | 'date' | 'datetime' | 'percent'
export type AggregateType = 'none' | 'sum' | 'avg' | 'count' | 'min' | 'max'

export interface ColumnView {
  field: string
  label?: string | null
  width?: number | null
  format: ColumnFormat
  decimals?: number | null
  aggregate: AggregateType
  fixed: boolean
}

export interface FormatRule {
  id: string
  name: string
  enabled: boolean
  column: string
  operator: string
  value?: string | null
  value2?: string | null
  compareColumn?: string | null
  target: 'cell' | 'row' | 'column'
  applyColumn?: string | null
  backColor?: string | null
  foreColor?: string | null
  bold: boolean
  stopIfTrue: boolean
}

export interface OrderPageConfig {
  title: string
  sourceId?: string | null
  orderColumn?: string | null
  orders: string[]
  orderDescriptionColumn?: string | null
  keyColumns: string[]
  titleColumn?: string | null
  tbdkColumn?: string | null
  projectColumn?: string | null
  qtyColumn?: string | null
  virtualColumns: VirtualColumnDef[]
  lookupColumns: OrderLookupColumn[]
  kitSync: { kitColumnId?: string | null; map: { kit: string; onMontaj: string }[] }
  pageSize: number
}

export interface OrderLookupColumn {
  id: string
  name: string
  tableId?: string | null
  matchColumnId?: string | null
  valueColumnId?: string | null
  width?: number | null
}

export type VirtualType =
  | 'text' | 'textarea' | 'number' | 'date' | 'select' | 'multiselect' | 'checkbox' | 'notes'

export interface VirtualColumnDef {
  id: string
  name: string
  type: VirtualType
  options: string[]
  optionsSourceId?: string | null
  optionsColumn?: string | null
  optionColors: Record<string, string>
  width?: number | null
}

export interface KittPageConfig {
  title: string
  sourceId?: string | null
  orderColumn?: string | null
  keyColumns: string[]
  columns: ColumnView[]
  virtualColumns: VirtualColumnDef[]
  formatRules: FormatRule[]
  pageSize: number
  detail: KittDetailConfig
  autoDates: { statusColumnId: string; statusValue: string; dateColumnId: string }[]
}


export interface AppConfig {
  revision: number
  dekit: DekitConfig
  general: GeneralSettings
  dataSources: DataSourceDef[]
  orderPage: OrderPageConfig
  kittPage: KittPageConfig
  customTables: CustomTableDef[]
}

export type Row = Record<string, any>

export interface SourceFileInfo {
  path: string
  name: string
  lastWriteTime: string
  size: number
}

export interface TableResponse {
  columns: string[]
  computedColumns: string[]
  rows: Row[]
  warnings: string[]
  loadedAt: string
  totalRows: number
}

export interface PreviewResponse extends TableResponse {
  files: SourceFileInfo[]
}

export interface SourceTestResult {
  ok: boolean
  error?: string
  files: SourceFileInfo[]
  sheets: string[]
  columns: string[]
  sampleRows: Row[]
  rowCount: number
}

export interface KittCell {
  value: any
  by?: string | null
  at: string
}

export interface KittNote {
  id: string
  text: string
  by?: string | null
  at: string
}

export interface KittDataResponse extends TableResponse {
  values: Record<string, Record<string, KittCell>>
}

export interface OrderOption {
  value: string
  rowCount: number
  description?: string | null
}

export interface DashboardSource {
  id: string
  name: string
  description?: string
  ok: boolean
  error?: string
  rowCount: number
  columnCount: number
  computedCount: number
  fileCount: number
  lastWrite?: string
  warnings: string[]
}

export interface DashboardResponse {
  general: GeneralSettings
  sources: DashboardSource[]
  orderCount: number
  orderSummary: { order: string; rowCount: number }[]
  kittRowCount: number
  virtualColumnCount: number
  serverTime: string
}

export interface BrowseResponse {
  path: string
  parent?: string | null
  dirs: string[]
  files: string[]
}

// ---------------------------------------------------------------- KITT toplama penceresi
export interface FieldMap {
  tableColumnId: string
  source: string
}

export interface ProcessOption {
  label: string
  /** Doluysa (veya tanımsızsa) bu işlem tipindeki malzemeler ilerleme sayımına dahil edilmez */
  excludeFromCount?: boolean
  color?: string | null
  tableId?: string | null
  /** Tabloda malzeme numarasının yazılacağı kolon (boşsa anahtar kolon) */
  matchColumnId?: string | null
  map: FieldMap[]
}

export interface KittDetailConfig {
  enabled: boolean
  title: string
  triggerColumn?: string | null
  bomSourceId?: string | null
  bomMatchColumn?: string | null
  bomMaterialColumn?: string | null
  bomColumns: ColumnView[]
  stockSourceId?: string | null
  stockMaterialColumn?: string | null
  stockAddressColumn?: string | null
  stockQtyColumn?: string | null
  stockInfoColumns: string[]
  maxAddresses: number
  stockFilters: FilterCondition[]
  scanEnabled: boolean
  scanMatchColumn?: string | null
  processTitle: string
  processOptions: ProcessOption[]
  markerColumns: MarkerColumn[]
  kanban: KanbanConfig
  virtualColumns: VirtualColumnDef[]
}

/** Malzeme bir özel tabloda kayıtlıysa etiket gösteren kolon (ör. Kanban). */
export interface MarkerColumn {
  title: string
  tableId?: string | null
  /** Malzeme numarasının aranacağı tablo kolonu (boşsa anahtar kolon) */
  matchColumnId?: string | null
  label: string
  color?: string | null
  /** Doluysa malzeme tabloda YOKSA bu yazı gösterilir (ör. PAP Kontrol: Var / Yok) */
  absentLabel?: string | null
  absentColor?: string | null
}

export interface StockAddress {
  address: string
  qty: number
  rows: number
  info: Record<string, string>
}

export interface PickInfo {
  at: string
  by?: string | null
  method: 'scan' | 'manual'
}

export interface PickDetailResponse {
  orders: string[]
  columns: string[]
  rows: Row[]
  addresses: Record<string, StockAddress[]>
  picks: Record<string, PickInfo>
  process: Record<string, string>
  /** Etiket kolonu sırası → malzeme → kayıt bilgileri */
  markers: Record<string, Record<string, string>>[]
  warnings: string[]
  loadedAt: string
  /** Kanban malzemeleri → kanban deposundaki miktar (kaynak yoksa null) */
  kanban: Record<string, number | null>
  /** Sanal kolon değerleri: satır anahtarı → kolon → değer */
  values: Record<string, Record<string, KittCell>>
}

// ---------------------------------------------------------------- Özel tablolar
export type CustomColumnType = 'text' | 'textarea' | 'number' | 'date' | 'select' | 'checkbox'

export interface CustomColumnDef {
  id: string
  name: string
  type: CustomColumnType
  options: string[]
  required: boolean
  width?: number | null
}

export interface CustomTableDef {
  id: string
  name: string
  description?: string | null
  keyColumnId?: string | null
  columns: CustomColumnDef[]
}

export interface CustomRow {
  id: string
  values: Record<string, any>
  createdBy?: string | null
  createdAt: string
  updatedBy?: string | null
  updatedAt?: string | null
}

export interface KanbanConfig {
  enabled: boolean
  excludeFromCount?: boolean
  label: string
  color?: string | null
  tableId?: string | null
  matchColumnId?: string | null
  stockSourceId?: string | null
  stockMaterialColumn?: string | null
  stockDepotColumn?: string | null
  stockDepotValue?: string | null
  stockQtyColumn?: string | null
}

export interface ImportResult {
  added: number
  updated: number
  skipped: number
  errors: string[]
  totalRows: number
  ignoredColumns: string[]
}

export interface ImportPreviewColumn {
  letter: string
  header: string | null
  samples: string[]
}

export interface ImportPreview {
  rowCount: number
  headerRow: number
  columns: ImportPreviewColumn[]
}

// ---------------------------------------------------------------- DEKIT
export interface DekitConfig {
  title: string
  stripLeft: number
  stripRight: number
  addressMatch: 'eq' | 'startsWith' | 'contains'
  stockSourceId?: string | null
  materialColumn?: string | null
  addressColumn?: string | null
  qtyColumn?: string | null
  depotColumn?: string | null
  kartDepotValue: string
  maxKartAddresses: number
  stockFilters: FilterCondition[]
  columns: ColumnView[]
  bomSourceId?: string | null
  bomMatchColumn?: string | null
  bomMaterialColumn?: string | null
  statusColumnId?: string | null
  statusValue: string
  keepLabel: string
  goLabel: string
  externalTableId?: string | null
  externalMatchColumnId?: string | null
  externalLabel: string
  externalScope: 'outside' | 'all'
  compareScope: 'kitt' | 'all'
}

export interface DekitCompare {
  count: number
  orders: string[]
  note: string | null
}

export interface DekitSummaryRow {
  order: string
  address: string | null
  found: boolean
  materialCount: number
  rowCount: number
  total: number
  status: string | null
  arrived: boolean
  keep: number
  go: number
  external: number
  decided: boolean
  note: string | null
}

export interface DekitDetail {
  order: string
  address: string
  columns: string[]
  rows: Row[]
  total: number
  materialCount: number
  rowCount: number
  status: string | null
  arrived: boolean
  decided: boolean
  compare: DekitCompare
  keep: number
  go: number
  external: number
  warnings: string[]
  loadedAt: string
}

export interface DekitLookup {
  code: string
  known: boolean
  material: string
  mk: string | null
  description: string | null
  inList: boolean
  qtyAtAddress: number
  kart: string[]
  decision: 'keep' | 'go' | 'external' | null
  label: string
  needs: string[]
  address: string | null
  note: string | null
}

// ---------------------------------------------------------------- Ana Sayfa özeti
export interface OverviewKittRow {
  order: string
  status: string | null
  arrived: boolean
  total: number
  picked: number
  excluded: number
  lastPick: string | null
}

export interface OverviewDekitRow {
  order: string
  address: string | null
  found: boolean
  materialCount: number
  rowCount: number
  total: number
  status: string | null
  arrived: boolean
  keep: number
  go: number
  external: number
  decided: boolean
  note: string | null
}

export interface OverviewResponse {
  user: string | null
  statusName: string
  statusOptions: string[]
  statusColors: Record<string, string>
  dekitStatusValue: string
  keepLabel: string
  goLabel: string
  externalLabel: string
  kitt: { orders: OverviewKittRow[] }
  dekit: { rows: OverviewDekitRow[]; compare: { count: number; note: string | null } } | null
  arrivedNotListed: string[]
  pickTotal: number
  daily: { date: string; scan: number; manual: number }[]
  recent: { order: string; material: string; at: string; by: string | null; method: string }[]
  customTables: { id: string; name: string; count: number }[]
  warnings: string[]
  serverTime: string
}

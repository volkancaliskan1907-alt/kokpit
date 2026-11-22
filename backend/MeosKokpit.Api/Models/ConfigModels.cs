namespace MeosKokpit.Api.Models;

/// <summary>Uygulamanın tüm ayarları (App_Data/config.json içinde saklanır).</summary>
public class AppConfig
{
    /// <summary>Her kayıtta artar; eski bir sayfadan yapılan kaydın yeni ayarların üzerine yazmasını engeller.</summary>
    public long Revision { get; set; }
    public GeneralSettings General { get; set; } = new();
    public List<DataSourceDef> DataSources { get; set; } = new();
    public OrderPageConfig OrderPage { get; set; } = new();
    public KittPageConfig KittPage { get; set; } = new();
    public DekitConfig Dekit { get; set; } = new();
    public List<CustomTableDef> CustomTables { get; set; } = new();
}

public class GeneralSettings
{
    public string CompanyName { get; set; } = "MEOS Elektronik";
    public string DepartmentName { get; set; } = "Üretim Müdürlüğü";
    public string AppTitle { get; set; } = "Üretim Kokpiti";
    /// <summary>Dosya değişikliği kontrolleri arasındaki minimum süre (saniye).</summary>
    public int RefreshSeconds { get; set; } = 5;
}

/// <summary>Excel/CSV dosyası veya dizininden oluşan veri kaynağı.</summary>
public class DataSourceDef
{
    public string Id { get; set; } = "";
    public string Name { get; set; } = "";
    public string? Description { get; set; }
    /// <summary>Dosya yolu veya dizin yolu (ağ yolu olabilir: \\sunucu\paylasim\...)</summary>
    public string Path { get; set; } = "";
    /// <summary>Dizin seçildiğinde dosya filtresi. Birden fazla desen noktalı virgülle ayrılır.</summary>
    public string FilePattern { get; set; } = "*.xlsx;*.xls;*.xlsm;*.csv";
    /// <summary>Dizin modunda: "latest" (en son değişen dosya) veya "merge" (tüm dosyaları alt alta birleştir).</summary>
    public string Mode { get; set; } = "latest";
    public bool IncludeSubfolders { get; set; }
    public string? SheetName { get; set; }
    public int HeaderRow { get; set; } = 1;
    /// <summary>Satırın geldiği dosya adını "Kaynak Dosya" kolonu olarak ekler.</summary>
    public bool AddFileNameColumn { get; set; }
    public List<ComputedColumnDef> ComputedColumns { get; set; } = new();
}

/// <summary>Kaynağa eklenen hesaplanmış kolon (DÜŞEYARA, ETOPLA, EĞERSAY, formül...)</summary>
public class ComputedColumnDef
{
    public string Id { get; set; } = "";
    public string Name { get; set; } = "";
    /// <summary>lookup | lookupLast | join | sumif | countif | avgif | minif | maxif | formula</summary>
    public string Type { get; set; } = "lookup";
    public string? TargetSourceId { get; set; }
    /// <summary>Eşleşme kriterleri (birden fazla ise ÇOKETOPLA gibi hepsi sağlanmalı).</summary>
    public List<KeyPair> Keys { get; set; } = new();
    public string? TargetValueColumn { get; set; }
    /// <summary>Hedef kaynakta yalnızca bu koşulları sağlayan satırlar dikkate alınır.</summary>
    public List<FilterCondition> TargetFilters { get; set; } = new();
    public string? Formula { get; set; }
    /// <summary>Eşleşme bulunamazsa yazılacak değer.</summary>
    public string? DefaultValue { get; set; }
}

public class KeyPair
{
    public string LocalColumn { get; set; } = "";
    public string TargetColumn { get; set; } = "";
}

public class FilterCondition
{
    public string Column { get; set; } = "";
    public string Operator { get; set; } = "eq";
    public string? Value { get; set; }
    public string? Value2 { get; set; }
}

/// <summary>Tabloda gösterilecek kolon ayarı.</summary>
public class ColumnView
{
    public string Field { get; set; } = "";
    public string? Label { get; set; }
    public int? Width { get; set; }
    /// <summary>auto | text | number | integer | date | datetime | percent</summary>
    public string Format { get; set; } = "auto";
    public int? Decimals { get; set; }
    /// <summary>none | sum | avg | count | min | max</summary>
    public string Aggregate { get; set; } = "none";
    public bool Fixed { get; set; }
}

/// <summary>Koşullu biçimlendirme kuralı.</summary>
public class FormatRule
{
    public string Id { get; set; } = "";
    public string Name { get; set; } = "";
    public bool Enabled { get; set; } = true;
    public string Column { get; set; } = "";
    public string Operator { get; set; } = "eq";
    public string? Value { get; set; }
    public string? Value2 { get; set; }
    /// <summary>Doluysa sabit değer yerine bu kolonun değeriyle karşılaştırılır.</summary>
    public string? CompareColumn { get; set; }
    /// <summary>cell | row | column</summary>
    public string Target { get; set; } = "cell";
    /// <summary>Target = column ise biçimin uygulanacağı kolon.</summary>
    public string? ApplyColumn { get; set; }
    public string? BackColor { get; set; }
    public string? ForeColor { get; set; }
    public bool Bold { get; set; }
    public bool StopIfTrue { get; set; }
}

public class OrderPageConfig
{
    public string Title { get; set; } = "Ön Montaj";
    public string? SourceId { get; set; }
    public string? OrderColumn { get; set; }
    /// <summary>Kullanıcının seçebileceği sipariş numaraları. Boşsa kaynaktaki tüm siparişler listelenir.</summary>
    public List<string> Orders { get; set; } = new();
    /// <summary>Sipariş seçim listesinde numaranın yanında gösterilecek açıklama kolonu (ör. Tanım).</summary>
    public string? OrderDescriptionColumn { get; set; }
    /// <summary>Satırı benzersiz tanımlayan kolonlar (sipariş no ile birlikte). Girilen değerler bu anahtarla saklanır.</summary>
    public List<string> KeyColumns { get; set; } = new() { "Malzeme" };
    public string? TitleColumn { get; set; } = "Tanım";
    public string? TbdkColumn { get; set; } = "Malzeme";
    public string? ProjectColumn { get; set; } = "PROJE";
    public string? QtyColumn { get; set; } = "Hedeflenen Miktar";
    /// <summary>Kullanıcının satır bazında seçim / tarih girdiği kolonlar (seçenekleri ayarlardan belirlenir).</summary>
    public List<VirtualColumnDef> VirtualColumns { get; set; } = new();
    /// <summary>Değeri özel tablodan (TBDK / Malzeme eşleşmesiyle) gelen kolonlar.</summary>
    public List<OrderLookupColumn> LookupColumns { get; set; } = new();
    /// <summary>KITT sayfasındaki bir seçim kolonunun değeri değişince Ön Montaj Durum değerini günceller.</summary>
    public KitStatusSync KitSync { get; set; } = new();
    public int PageSize { get; set; } = 50;
}

public class KitStatusSync
{
    /// <summary>KITT sayfasındaki izlenen sanal kolon (ör. v_durum).</summary>
    public string? KitColumnId { get; set; }
    public List<KitStatusMap> Map { get; set; } = new();
}

public class KitStatusMap
{
    /// <summary>KITT'te seçilen değer.</summary>
    public string Kit { get; set; } = "";
    /// <summary>Ön Montaj Durum kolonuna yazılacak değer.</summary>
    public string OnMontaj { get; set; } = "";
}

/// <summary>Ön Montaj tablosunda, özel tablodan Malzeme eşleşmesiyle değer getiren kolon.</summary>
public class OrderLookupColumn
{
    public string Id { get; set; } = "";
    public string Name { get; set; } = "";
    public string? TableId { get; set; }
    /// <summary>Özel tabloda sipariş satırının TBDK (Malzeme) değeriyle eşleşecek kolon.</summary>
    public string? MatchColumnId { get; set; }
    /// <summary>Özel tablodan getirilecek kolon.</summary>
    public string? ValueColumnId { get; set; }
    public int? Width { get; set; }
}

public class KittPageConfig
{
    public string Title { get; set; } = "KITT Hazırlama";
    public string? SourceId { get; set; }
    public string? OrderColumn { get; set; }
    /// <summary>Satırı benzersiz tanımlayan kolonlar (sipariş no ile birlikte). Sanal kolon değerleri bu anahtarla saklanır.</summary>
    public List<string> KeyColumns { get; set; } = new();
    public List<ColumnView> Columns { get; set; } = new();
    public List<VirtualColumnDef> VirtualColumns { get; set; } = new();
    public List<FormatRule> FormatRules { get; set; } = new();
    public int PageSize { get; set; } = 50;
    /// <summary>Tabloda bir hücreye tıklanınca açılan ürün ağacı (BOM) + stok detay penceresi.</summary>
    public KittDetailConfig Detail { get; set; } = new();
    /// <summary>Bir seçim kolonu belirli değere gelince bir tarih kolonunu bugünün tarihiyle doldurur.</summary>
    public List<KittAutoDate> AutoDates { get; set; } = new();
}

public class KittAutoDate
{
    public string StatusColumnId { get; set; } = "";
    public string StatusValue { get; set; } = "";
    public string DateColumnId { get; set; } = "";
}


/// <summary>Kullanıcının satır bazında değer girdiği sanal kolon.</summary>
public class VirtualColumnDef
{
    public string Id { get; set; } = "";
    public string Name { get; set; } = "";
    /// <summary>text | textarea | number | date | select | multiselect | checkbox | notes</summary>
    public string Type { get; set; } = "text";
    public List<string> Options { get; set; } = new();
    /// <summary>Seçenekler bir veri kaynağı kolonundan gelecekse.</summary>
    public string? OptionsSourceId { get; set; }
    public string? OptionsColumn { get; set; }
    /// <summary>Seçenek renkleri (seçenek -> renk).</summary>
    public Dictionary<string, string> OptionColors { get; set; } = new();
    public int? Width { get; set; }
}

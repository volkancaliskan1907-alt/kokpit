namespace MeosKokpit.Api.Models;

public class DekitConfig
{
    public string Title { get; set; } = "DEKIT";
    public int StripLeft { get; set; }
    public int StripRight { get; set; }
    /// <summary>eq | startsWith | contains</summary>
    public string AddressMatch { get; set; } = "eq";
    public string? StockSourceId { get; set; }
    public string? MaterialColumn { get; set; }
    public string? AddressColumn { get; set; }
    public string? QtyColumn { get; set; }
    public string? DepotColumn { get; set; }
    public string KartDepotValue { get; set; } = "KART";
    public int MaxKartAddresses { get; set; } = 3;
    public List<FilterCondition> StockFilters { get; set; } = new();
    public List<ColumnView> Columns { get; set; } = new();
    public string? BomSourceId { get; set; }
    public string? BomMatchColumn { get; set; }
    public string? BomMaterialColumn { get; set; }
    public string? StatusColumnId { get; set; }
    public string StatusValue { get; set; } = "DEKIT Geldi";
    public string KeepLabel { get; set; } = "Kalsın";
    public string GoLabel { get; set; } = "Gitsin";
    public string? ExternalTableId { get; set; }
    public string? ExternalMatchColumnId { get; set; }
    public string ExternalLabel { get; set; } = "Harici stoklarda geçiyor";
    /// <summary>outside | all</summary>
    public string ExternalScope { get; set; } = "outside";
    /// <summary>kitt | all</summary>
    public string CompareScope { get; set; } = "kitt";
}

public class FieldMap
{
    public string TableColumnId { get; set; } = "";
    public string Source { get; set; } = "";
}

public class ProcessOption
{
    public string Label { get; set; } = "";
    public bool ExcludeFromCount { get; set; }
    public string? Color { get; set; }
    public string? TableId { get; set; }
    public string? MatchColumnId { get; set; }
    public List<FieldMap> Map { get; set; } = new();
}

public class MarkerColumn
{
    public string Title { get; set; } = "";
    public string? TableId { get; set; }
    public string? MatchColumnId { get; set; }
    public string Label { get; set; } = "";
    public string? Color { get; set; }
    public string? AbsentLabel { get; set; }
    public string? AbsentColor { get; set; }
}

public class KanbanConfig
{
    public bool Enabled { get; set; }
    public bool ExcludeFromCount { get; set; }
    public string Label { get; set; } = "Kanban";
    public string? Color { get; set; }
    public string? TableId { get; set; }
    public string? MatchColumnId { get; set; }
    public string? StockSourceId { get; set; }
    public string? StockMaterialColumn { get; set; }
    public string? StockDepotColumn { get; set; }
    public string? StockDepotValue { get; set; }
    public string? StockQtyColumn { get; set; }
}

public class KittDetailConfig
{
    public bool Enabled { get; set; }
    public string Title { get; set; } = "KITT Toplama";
    public string? TriggerColumn { get; set; }
    public string? BomSourceId { get; set; }
    public string? BomMatchColumn { get; set; }
    public string? BomMaterialColumn { get; set; }
    public List<ColumnView> BomColumns { get; set; } = new();
    public string? StockSourceId { get; set; }
    public string? StockMaterialColumn { get; set; }
    public string? StockAddressColumn { get; set; }
    public string? StockQtyColumn { get; set; }
    public List<string> StockInfoColumns { get; set; } = new();
    public int MaxAddresses { get; set; } = 3;
    public List<FilterCondition> StockFilters { get; set; } = new();
    public bool ScanEnabled { get; set; }
    public string? ScanMatchColumn { get; set; }
    public string ProcessTitle { get; set; } = "İşlem Tipi";
    public List<ProcessOption> ProcessOptions { get; set; } = new();
    public List<MarkerColumn> MarkerColumns { get; set; } = new();
    public KanbanConfig Kanban { get; set; } = new();
    public List<VirtualColumnDef> VirtualColumns { get; set; } = new();
}

public class CustomColumnDef
{
    public string Id { get; set; } = "";
    public string Name { get; set; } = "";
    /// <summary>text | textarea | number | date | select | checkbox</summary>
    public string Type { get; set; } = "text";
    public List<string> Options { get; set; } = new();
    public bool Required { get; set; }
    public int? Width { get; set; }
}

public class CustomTableDef
{
    public string Id { get; set; } = "";
    public string Name { get; set; } = "";
    public string? Description { get; set; }
    public string? KeyColumnId { get; set; }
    public List<CustomColumnDef> Columns { get; set; } = new();
}

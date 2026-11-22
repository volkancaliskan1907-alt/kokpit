using System.Text.Json;
using MeosKokpit.Api.Models;
using MeosKokpit.Api.Services;

namespace MeosKokpit.Api.Endpoints;

public class OrdersRequest { public List<string> Orders { get; set; } = new(); }
public class KittValueUpdate
{
    public List<string> RowKeys { get; set; } = new();
    public string ColumnId { get; set; } = "";
    public JsonElement? Value { get; set; }
}
public class KittNoteRequest { public string RowKey { get; set; } = ""; public string ColumnId { get; set; } = ""; public string Text { get; set; } = ""; }
public class KittNoteDeleteRequest { public string RowKey { get; set; } = ""; public string ColumnId { get; set; } = ""; public string NoteId { get; set; } = ""; }
public class ExportColumn { public string Field { get; set; } = ""; public string Label { get; set; } = ""; public string Format { get; set; } = "auto"; }
public class ExportRequest
{
    public string FileName { get; set; } = "Veri";
    public string? SheetName { get; set; }
    public List<ExportColumn> Columns { get; set; } = new();
    public List<Dictionary<string, JsonElement>> Rows { get; set; } = new();
}
public class PickDetailRequest { public List<string> Values { get; set; } = new(); }
public class PickSetRequest { public List<string> Keys { get; set; } = new(); public bool Picked { get; set; } public string Method { get; set; } = "manual"; }
public class ProcessRequest { public string Order { get; set; } = ""; public string RowKey { get; set; } = ""; public string? Option { get; set; } }
public class PrefsPut { }

/// <summary>KITT toplama penceresi: ürün ağacı (BOM) + stok adresleri, alındı işaretleri, işlem tipi.</summary>
public static class PickEndpoints
{
    /// <summary>KittStore içinde malzeme → işlem tipi değerlerinin tutulduğu özel satır anahtarı.</summary>
    public const string ProcessStoreKey = "__PROCESS__";
    public const string PickValuePrefix = "__PICKVAL__|";

    public static HashSet<string> KanbanMaterials(AppConfig cfg, CustomTableStore tables)
    {
        var k = cfg.KittPage.Detail.Kanban;
        if (!k.Enabled || string.IsNullOrEmpty(k.TableId)) return new();
        var def = cfg.CustomTables.FirstOrDefault(t => t.Id == k.TableId);
        return def == null ? new() : tables.Keys(def, k.MatchColumnId);
    }

    /// <summary>Bir iş emrinin BOM satırları; her satıra __key (sipariş|malzeme|sıra), __mk ve __order eklenir.</summary>
    public static List<Dictionary<string, object?>> BomRowsFor(KittDetailConfig d, SourceResult bom, string order)
    {
        var ok = ValueUtil.KeyOf(order);
        var used = new Dictionary<string, int>();
        var list = new List<Dictionary<string, object?>>();
        foreach (var r in bom.Rows)
        {
            if (ValueUtil.KeyOf(r.GetValueOrDefault(d.BomMatchColumn ?? "")) != ok) continue;
            var mk = DekitEndpoints.MatKey(r.GetValueOrDefault(d.BomMaterialColumn ?? ""));
            var baseKey = ok + "|" + mk;
            var n = used.GetValueOrDefault(baseKey) + 1;
            used[baseKey] = n;
            list.Add(new Dictionary<string, object?>(r) { ["__key"] = $"{baseKey}|{n}", ["__mk"] = mk, ["__order"] = order });
        }
        return list;
    }

    public static void MapPickApi(this WebApplication app)
    {
        var api = app.MapGroup("/api");

        api.MapPost("/kitt/detail", (PickDetailRequest req, ConfigStore store, DataEngine engine, KittStore kitt, KittPickStore picks, CustomTableStore tables) =>
        {
            var cfg = store.Current;
            var d = cfg.KittPage.Detail;
            try
            {
                if (string.IsNullOrEmpty(d.BomSourceId) || string.IsNullOrEmpty(d.BomMatchColumn) || string.IsNullOrEmpty(d.BomMaterialColumn))
                    throw new InvalidOperationException("KITT toplama için bileşen kaynağı ayarlanmamış (Ayarlar > KITT > Toplama).");
                var warnings = new List<string>();
                var bom = engine.Get(d.BomSourceId);
                warnings.AddRange(bom.Warnings);
                var orders = req.Values.Select(o => o.Trim()).Where(o => o.Length > 0).Distinct(StringComparer.OrdinalIgnoreCase).ToList();
                var rows = orders.SelectMany(o => BomRowsFor(d, bom, o)).ToList();
                var mats = rows.Select(r => (string)r["__mk"]!).Where(m => m.Length > 0).ToHashSet();

                // Stok adresleri
                var addresses = new Dictionary<string, List<object>>();
                var kanbanQty = new Dictionary<string, double?>();
                var kanbanSet = KanbanMaterials(cfg, tables);
                if (!string.IsNullOrEmpty(d.StockSourceId) && !string.IsNullOrEmpty(d.StockMaterialColumn))
                {
                    try
                    {
                        var stock = engine.Get(d.StockSourceId);
                        warnings.AddRange(stock.Warnings);
                        var filters = d.StockFilters.Where(f => !string.IsNullOrWhiteSpace(f.Column)).ToList();
                        var byMat = new Dictionary<string, Dictionary<string, (double qty, int rows, Dictionary<string, string> info)>>();
                        foreach (var sr in stock.Rows)
                        {
                            var mk = DekitEndpoints.MatKey(sr.GetValueOrDefault(d.StockMaterialColumn));
                            if (!mats.Contains(mk)) continue;
                            if (filters.Count > 0 && !filters.All(f => ValueUtil.Evaluate(sr.GetValueOrDefault(f.Column), f.Operator, f.Value, f.Value2))) continue;
                            var addr = string.IsNullOrEmpty(d.StockAddressColumn) ? "" : ValueUtil.ToText(sr.GetValueOrDefault(d.StockAddressColumn));
                            var qty = string.IsNullOrEmpty(d.StockQtyColumn) ? 0 : ValueUtil.ToNumber(sr.GetValueOrDefault(d.StockQtyColumn)) ?? 0;
                            if (!byMat.TryGetValue(mk, out var m)) byMat[mk] = m = new();
                            m.TryGetValue(addr, out var cur);
                            cur.info ??= d.StockInfoColumns.ToDictionary(c => c, c => ValueUtil.ToText(sr.GetValueOrDefault(c)));
                            m[addr] = (cur.qty + qty, cur.rows + 1, cur.info);
                        }
                        foreach (var (mk, m) in byMat)
                            addresses[mk] = m.Where(a => a.Key.Length > 0).OrderByDescending(a => a.Value.qty).Take(Math.Max(1, d.MaxAddresses))
                                .Select(a => (object)new { address = a.Key, qty = a.Value.qty, rows = a.Value.rows, info = a.Value.info }).ToList();

                        var kb = d.Kanban;
                        if (kb.Enabled && !string.IsNullOrEmpty(kb.StockSourceId))
                        {
                            var ks = kb.StockSourceId == d.StockSourceId ? stock : engine.Get(kb.StockSourceId);
                            foreach (var mk in kanbanSet.Where(mats.Contains)) kanbanQty[mk] = 0;
                            foreach (var sr in ks.Rows)
                            {
                                var mk = DekitEndpoints.MatKey(sr.GetValueOrDefault(kb.StockMaterialColumn ?? ""));
                                if (!kanbanQty.ContainsKey(mk)) continue;
                                if (!string.IsNullOrEmpty(kb.StockDepotColumn) && ValueUtil.KeyOf(sr.GetValueOrDefault(kb.StockDepotColumn)) != ValueUtil.KeyOf(kb.StockDepotValue)) continue;
                                kanbanQty[mk] = (kanbanQty[mk] ?? 0) + (ValueUtil.ToNumber(sr.GetValueOrDefault(kb.StockQtyColumn ?? "")) ?? 0);
                            }
                        }
                        else foreach (var mk in kanbanSet.Where(mats.Contains)) kanbanQty[mk] = null;
                    }
                    catch (Exception ex) { warnings.Add($"Stok kaynağı okunamadı: {ex.Message}"); }
                }
                else foreach (var mk in kanbanSet.Where(mats.Contains)) kanbanQty[mk] = null;

                // Etiket kolonları
                var markers = d.MarkerColumns.Select(m =>
                {
                    var def = cfg.CustomTables.FirstOrDefault(t => t.Id == m.TableId);
                    var keys = def == null ? new HashSet<string>() : tables.Keys(def, m.MatchColumnId);
                    return mats.Where(keys.Contains).ToDictionary(mk => mk, mk => m.Label);
                }).ToList();

                // İşlem tipi
                var process = new Dictionary<string, string>();
                var snap = kitt.Snapshot();
                snap.TryGetValue(ProcessStoreKey, out var stored);
                foreach (var mk in mats)
                {
                    foreach (var o in d.ProcessOptions.Where(o => !string.IsNullOrEmpty(o.TableId)))
                    {
                        var def = cfg.CustomTables.FirstOrDefault(t => t.Id == o.TableId);
                        if (def != null && tables.Keys(def, o.MatchColumnId).Contains(mk)) { process[mk] = o.Label; break; }
                    }
                    if (!process.ContainsKey(mk) && stored != null && stored.TryGetValue(mk, out var cell) && cell.Value is { ValueKind: JsonValueKind.String } v)
                        process[mk] = v.GetString()!;
                }

                var keysAll = rows.Select(r => (string)r["__key"]!).ToList();
                return Results.Ok(new
                {
                    orders,
                    columns = bom.Columns,
                    rows,
                    addresses,
                    picks = picks.Get(keysAll),
                    process,
                    markers,
                    warnings = warnings.Distinct().ToList(),
                    loadedAt = bom.LoadedAt,
                    kanban = kanbanQty,
                    values = kitt.GetMany(keysAll),
                });
            }
            catch (Exception ex) { return ApiEndpoints.Problem(ex); }
        });

        api.MapPut("/kitt/picks", (PickSetRequest req, HttpContext ctx, KittPickStore picks) =>
            Results.Ok(picks.Set(req.Keys, req.Picked, req.Method == "scan" ? "scan" : "manual", ApiEndpoints.UserOf(ctx))));

        api.MapPut("/kitt/process", (ProcessRequest req, HttpContext ctx, ConfigStore store, DataEngine engine, KittStore kitt, CustomTableStore tables) =>
        {
            var cfg = store.Current;
            var d = cfg.KittPage.Detail;
            try
            {
                var user = ApiEndpoints.UserOf(ctx);
                var mk = req.RowKey.Split('|').ElementAtOrDefault(1) ?? "";
                if (mk.Length == 0) throw new InvalidOperationException("Geçersiz satır anahtarı.");

                // Önceki tablo kayıtlarını temizle (seçenek değişiyorsa)
                foreach (var o in d.ProcessOptions.Where(o => !string.IsNullOrEmpty(o.TableId) && o.Label != req.Option))
                {
                    var def = cfg.CustomTables.FirstOrDefault(t => t.Id == o.TableId);
                    var col = def == null ? null : CustomTableStore.MatchColumn(def, o.MatchColumnId);
                    if (def == null || col == null) continue;
                    var ids = tables.Rows(def.Id).Where(r => r.Values.TryGetValue(col, out var v) && DekitEndpoints.MatKey(v) == mk).Select(r => r.Id).ToList();
                    if (ids.Count > 0) tables.Delete(def.Id, ids);
                }

                if (string.IsNullOrEmpty(req.Option))
                {
                    kitt.SetValues(new[] { ProcessStoreKey }, mk, null, user);
                    return Results.Ok(new { added = false });
                }

                var opt = d.ProcessOptions.FirstOrDefault(o => o.Label == req.Option) ?? throw new InvalidOperationException("İşlem tipi bulunamadı.");
                var added = false; string? tableName = null;
                if (!string.IsNullOrEmpty(opt.TableId))
                {
                    var def = cfg.CustomTables.FirstOrDefault(t => t.Id == opt.TableId) ?? throw new InvalidOperationException("Hedef özel tablo bulunamadı.");
                    var col = CustomTableStore.MatchColumn(def, opt.MatchColumnId) ?? throw new InvalidOperationException("Tabloda anahtar kolon yok.");
                    tableName = def.Name;
                    if (!tables.Keys(def, opt.MatchColumnId).Contains(mk))
                    {
                        var vals = new Dictionary<string, JsonElement> { [col] = JsonSerializer.SerializeToElement(mk) };
                        // BOM satırından alan eşleşmeleri
                        var bomRow = d.BomSourceId == null ? null : BomRowsFor(d, engine.Get(d.BomSourceId), req.Order).FirstOrDefault(r => (string)r["__key"]! == req.RowKey);
                        if (bomRow != null)
                            foreach (var m in opt.Map)
                                if (bomRow.TryGetValue(m.Source, out var sv) && !ValueUtil.IsEmpty(sv))
                                    vals[m.TableColumnId] = JsonSerializer.SerializeToElement(sv is DateTime dt ? dt.ToString("yyyy-MM-dd") : sv is double n ? n : (object?)ValueUtil.ToText(sv));
                        tables.Add(def, vals, user);
                        added = true;
                    }
                }
                else kitt.SetValues(new[] { ProcessStoreKey }, mk, JsonSerializer.SerializeToElement(opt.Label), user);
                return Results.Ok(new { option = opt.Label, added, table = tableName });
            }
            catch (Exception ex) { return ApiEndpoints.Problem(ex); }
        });

        // ---------------------------------------------------------------- Kullanıcı tercihleri
        api.MapGet("/prefs", (HttpContext ctx, UserPrefsStore prefs) =>
            Results.Json(prefs.Get(ApiEndpoints.UserOf(ctx) is { Length: > 0 } u ? u.Trim() : "_genel")));

        api.MapPut("/prefs/{key}", (string key, JsonElement body, HttpContext ctx, UserPrefsStore prefs) =>
        {
            prefs.Set(ApiEndpoints.UserOf(ctx) is { Length: > 0 } u ? u.Trim() : "_genel", key, body);
            return Results.Ok();
        });
    }
}

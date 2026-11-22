using System.Text.Json;
using MeosKokpit.Api.Models;
using MeosKokpit.Api.Services;

namespace MeosKokpit.Api.Endpoints;

public record DekitSummaryRequest(List<string>? Orders, List<string>? Others);
public record DekitDetailRequest(string? Order, List<string>? Orders, List<string>? Others);
public record DekitLookupRequest(string? Order, string? Code, List<string>? Orders, List<string>? Others);

/// <summary>DEKIT sayfası: iş emrinden adres türetme, LX02'deki malzemeler, KART adresleri ve Kalsın / Gitsin kararı.</summary>
public static class DekitEndpoints
{
    /// <summary>Malzeme eşleştirme anahtarı: baştaki sıfırlar atılır (000000001234 ≡ 1234).</summary>
    internal static string MatKey(object? v)
    {
        var s = ValueUtil.KeyOf(v);
        if (s.Length > 0 && s.All(char.IsDigit)) { var t = s.TrimStart('0'); return t.Length == 0 ? "0" : t; }
        return s;
    }

    /// <summary>İş emri formatı: soldan / sağdan belirtilen sayıda karakter silinerek adres elde edilir.</summary>
    private static string? AddressOf(string order, DekitConfig c)
    {
        var s = (order ?? "").Trim();
        s = s[Math.Clamp(c.StripLeft, 0, s.Length)..];
        s = s[..(s.Length - Math.Clamp(c.StripRight, 0, s.Length))];
        return s.Length == 0 ? null : s;
    }

    private static bool AddrMatch(string rowKey, string wantKey, string mode) => mode switch
    {
        "startsWith" => rowKey.StartsWith(wantKey, StringComparison.Ordinal),
        "contains" => rowKey.Contains(wantKey, StringComparison.Ordinal),
        _ => rowKey == wantKey
    };

    internal static string? StatusColumnOf(AppConfig cfg) =>
        !string.IsNullOrEmpty(cfg.Dekit.StatusColumnId) ? cfg.Dekit.StatusColumnId
        : cfg.KittPage.VirtualColumns.FirstOrDefault(v => v.Type == "select")?.Id;

    /// <summary>KITT Hazırlama'da bu iş emrinin kayıtlı hazırlık durumu (ve eşleşme).</summary>
    internal static (bool arrived, string? text) KittStatus(AppConfig cfg, IReadOnlyDictionary<string, Dictionary<string, KittCell>> snap, string order)
    {
        var col = StatusColumnOf(cfg);
        if (col == null) return (false, null);
        var prefix = ValueUtil.KeyOf(order) + "|";
        string? first = null;
        foreach (var (key, cells) in snap)
        {
            if (!key.StartsWith(prefix, StringComparison.Ordinal)) continue;
            if (!cells.TryGetValue(col, out var cell) || cell.Value is not { ValueKind: JsonValueKind.String } je) continue;
            var text = je.GetString();
            if (ValueUtil.ValuesEqual(text, cfg.Dekit.StatusValue)) return (true, text);
            first ??= text;
        }
        return (false, first);
    }

    private sealed class Located
    {
        public string Order = "";
        public string? Address;
        public string AddrKey = "";
        public List<Dictionary<string, object?>> Rows = new();
        public bool Arrived;
        public string? Status;
    }

    /// <summary>LX02'yi tek geçişte tarar; her iş emri için türetilen adresteki satırları toplar.</summary>
    private static List<Located> Locate(AppConfig cfg, DataEngine engine, IReadOnlyDictionary<string, Dictionary<string, KittCell>> snap, IEnumerable<string> orders, List<string> warnings)
    {
        var d = cfg.Dekit;
        var list = orders.Select(o =>
        {
            var addr = AddressOf(o, d);
            var (arrived, status) = KittStatus(cfg, snap, o);
            return new Located { Order = o, Address = addr, AddrKey = addr == null ? "" : ValueUtil.KeyOf(addr), Arrived = arrived, Status = status };
        }).ToList();

        if (string.IsNullOrEmpty(d.StockSourceId) || string.IsNullOrEmpty(d.AddressColumn) || string.IsNullOrEmpty(d.MaterialColumn))
            throw new InvalidOperationException("DEKIT ayarlarında stok kaynağı, malzeme kolonu ve adres kolonu seçilmeli (Ayarlar > DEKIT).");

        var stock = engine.Get(d.StockSourceId);
        warnings.AddRange(stock.Warnings);
        foreach (var c in new[] { d.AddressColumn, d.MaterialColumn })
            if (!stock.Columns.Contains(c!)) throw new InvalidOperationException($"Stok kaynağında '{c}' kolonu yok.");

        var filters = d.StockFilters.Where(f => !string.IsNullOrWhiteSpace(f.Column)).ToList();
        var wanted = list.Where(l => l.AddrKey.Length > 0).GroupBy(l => l.AddrKey).ToDictionary(g => g.Key, g => g.ToList());
        var mode = d.AddressMatch;

        foreach (var row in stock.Rows)
        {
            var rk = ValueUtil.KeyOf(row.GetValueOrDefault(d.AddressColumn!));
            if (rk.Length == 0) continue;
            if (filters.Count > 0 && !filters.All(f => ValueUtil.Evaluate(row.GetValueOrDefault(f.Column), f.Operator, f.Value, f.Value2))) continue;
            if (mode == "eq")
            {
                if (wanted.TryGetValue(rk, out var hit)) foreach (var l in hit) l.Rows.Add(row);
            }
            else
            {
                foreach (var (ak, hit) in wanted) if (AddrMatch(rk, ak, mode)) foreach (var l in hit) l.Rows.Add(row);
            }
        }
        return list;
    }

    /// <summary>Karşılaştırma listesi: DEKIT dışındaki, durumu "DEKIT Geldi" olmayan iş emirlerinin COOIS malzemeleri.</summary>
    internal sealed class Reference
    {
        /// <summary>malzeme → onu bileşen listesinde bulunduran iş emirleri</summary>
        public Dictionary<string, List<string>> ByMaterial = new();
        public List<string> Orders = new();
        public List<string> MissingBom = new();
        public string? Note;
        public bool Usable => ByMaterial.Count > 0;
    }

    internal static Reference BuildReference(AppConfig cfg, DataEngine engine, IReadOnlyDictionary<string, Dictionary<string, KittCell>> snap,
        IEnumerable<string> excludeOrders, IEnumerable<string>? others, List<string> warnings)
    {
        var d = cfg.Dekit;
        var r = new Reference();
        if (string.IsNullOrEmpty(d.BomSourceId) || string.IsNullOrEmpty(d.BomMatchColumn) || string.IsNullOrEmpty(d.BomMaterialColumn))
        {
            r.Note = "COOIS bileşen kaynağı ayarlanmamış (Ayarlar > DEKIT > Kalsın / Gitsin Kuralı)";
            return r;
        }

        // Aday iş emirleri
        IEnumerable<string> cands;
        if (d.CompareScope == "all")
        {
            var kp = cfg.KittPage;
            cands = string.IsNullOrEmpty(kp.SourceId) || string.IsNullOrEmpty(kp.OrderColumn)
                ? Enumerable.Empty<string>()
                : engine.Get(kp.SourceId).Rows.Select(x => x.GetValueOrDefault(kp.OrderColumn)).Where(v => !ValueUtil.IsEmpty(v)).Select(ValueUtil.ToText);
        }
        else cands = others ?? Enumerable.Empty<string>();

        var exclude = excludeOrders.Select(ValueUtil.KeyOf).ToHashSet();
        var seen = new HashSet<string>();
        foreach (var c in cands)
        {
            var k = ValueUtil.KeyOf(c);
            if (k.Length == 0 || exclude.Contains(k) || !seen.Add(k)) continue;
            if (KittStatus(cfg, snap, c).arrived) continue; // durumu "DEKIT Geldi" olanlar karşılaştırmaya katılmaz
            r.Orders.Add(c);
        }
        if (r.Orders.Count == 0)
        {
            r.Note = d.CompareScope == "all"
                ? $"Karşılaştırılacak iş emri yok: KITT kaynağında DEKIT dışında, durumu \"{d.StatusValue}\" olmayan iş emri bulunamadı"
                : $"Karşılaştırılacak iş emri yok: KITT Hazırlama'da eklenmiş, DEKIT'te olmayan ve durumu \"{d.StatusValue}\" olmayan iş emri bulunamadı";
            return r;
        }

        // COOIS: iş emri → malzemeler (tek geçiş)
        var bom = engine.Get(d.BomSourceId);
        warnings.AddRange(bom.Warnings);
        var want = r.Orders.ToDictionary(ValueUtil.KeyOf, o => o);
        var found = new HashSet<string>();
        foreach (var row in bom.Rows)
        {
            var ok = ValueUtil.KeyOf(row.GetValueOrDefault(d.BomMatchColumn));
            if (!want.TryGetValue(ok, out var order)) continue;
            var mk = MatKey(row.GetValueOrDefault(d.BomMaterialColumn));
            if (mk.Length == 0) continue;
            found.Add(ok);
            if (!r.ByMaterial.TryGetValue(mk, out var list)) r.ByMaterial[mk] = list = new();
            if (!list.Contains(order)) list.Add(order);
        }
        r.MissingBom = r.Orders.Where(o => !found.Contains(ValueUtil.KeyOf(o))).ToList();
        if (!r.Usable) r.Note = "Karşılaştırılan iş emirleri için COOIS bileşen listesi bulunamadı";
        else if (r.MissingBom.Count > 0) warnings.Add($"{r.MissingBom.Count} iş emri için COOIS bileşen listesi bulunamadı: {string.Join(", ", r.MissingBom.Take(8))}{(r.MissingBom.Count > 8 ? "…" : "")}");
        return r;
    }

    /// <summary>Harici stoklar özel tablosundaki malzemeler (sıfırsız anahtar).</summary>
    /// <summary>KITT'te hazırlık durumu "DEKIT Geldi" olan iş emirleri (DEKIT sayfasının listesi).</summary>
    internal static List<string> ArrivedOrders(AppConfig cfg, DataEngine engine, KittStore kitt)
    {
        var col = StatusColumnOf(cfg);
        if (col == null) throw new InvalidOperationException("KITT sayfasında hazırlık durumu (seçim tipli) kolonu bulunamadı.");
        var keys = kitt.Snapshot()
            .Where(kv => kv.Value.TryGetValue(col, out var c) && c.Value is { ValueKind: JsonValueKind.String } je && ValueUtil.ValuesEqual(je.GetString(), cfg.Dekit.StatusValue))
            .Select(kv => kv.Key.Split('|')[0]).Distinct().ToList();
        // Görünen yazım için KITT kaynağındaki sipariş numaralarını kullan
        var display = new Dictionary<string, string>();
        var kp = cfg.KittPage;
        if (!string.IsNullOrEmpty(kp.SourceId) && !string.IsNullOrEmpty(kp.OrderColumn))
            foreach (var r in engine.Get(kp.SourceId).Rows)
            {
                var v = r.GetValueOrDefault(kp.OrderColumn);
                if (!ValueUtil.IsEmpty(v)) display.TryAdd(ValueUtil.KeyOf(v), ValueUtil.ToText(v));
            }
        return keys.Where(display.ContainsKey).Select(k => display[k]).OrderBy(x => x).ToList();
    }

    internal static HashSet<string> ExternalMaterials(AppConfig cfg, CustomTableStore tables)
    {
        var d = cfg.Dekit;
        var set = new HashSet<string>();
        var def = cfg.CustomTables.FirstOrDefault(t => t.Id == d.ExternalTableId);
        if (def == null) return set;
        var col = CustomTableStore.MatchColumn(def, d.ExternalMatchColumnId) ?? def.Columns.FirstOrDefault()?.Id;
        if (col == null) return set;
        foreach (var r in tables.Rows(def.Id))
            if (r.Values.TryGetValue(col, out var v)) { var mk = MatKey(v); if (mk.Length > 0) set.Add(mk); }
        return set;
    }

    /// <summary>keep | go | external. Harici stok eşleşmesi Kalsın / Gitsin yerine geçer (kapsam ayara bağlı).</summary>
    private static string Decide(DekitConfig d, Reference r, HashSet<string> ext, string mk)
    {
        var needed = r.ByMaterial.ContainsKey(mk); // başka (DEKIT olmayan) iş emirlerinde geçiyor mu?
        if (ext.Contains(mk) && (d.ExternalScope == "all" || !needed)) return "external";
        return needed ? "keep" : "go";
    }

    private sealed class LookupInfo
    {
        public bool Any;
        public string? Text, Desc;
        public double QtyAt;
        public int RowsAt;
        public List<string> Kart = new();
    }

    private static IEnumerable<string> DefaultColumns(DekitConfig d) =>
        new[] { d.MaterialColumn, d.AddressColumn, d.DepotColumn, d.QtyColumn }.Where(c => !string.IsNullOrEmpty(c)).Select(c => c!).Distinct();

    /// <summary>Aynı malzemenin adresteki satırlarını tek satırda toplar (miktar toplanır, diğer değerler birleştirilir).</summary>
    private static List<Dictionary<string, object?>> Group(DekitConfig d, SourceResult stock, List<Dictionary<string, object?>> rows, out List<string> fields)
    {
        var cols = (d.Columns.Count > 0 ? d.Columns.Select(c => c.Field) : DefaultColumns(d))
            .Concat(new[] { d.MaterialColumn!, d.QtyColumn ?? "" })
            .Where(c => !string.IsNullOrEmpty(c) && stock.Columns.Contains(c)).Distinct().ToList();
        fields = cols;

        return rows.GroupBy(r => MatKey(r.GetValueOrDefault(d.MaterialColumn!))).Where(g => g.Key.Length > 0).Select(g =>
        {
            var o = new Dictionary<string, object?> { ["__mk"] = g.Key, ["__n"] = g.Count() };
            foreach (var f in cols)
            {
                if (f == d.QtyColumn) { o[f] = g.Sum(r => ValueUtil.ToNumber(r.GetValueOrDefault(f)) ?? 0); continue; }
                var vals = g.Select(r => r.GetValueOrDefault(f)).Where(v => !ValueUtil.IsEmpty(v)).ToList();
                var distinct = vals.GroupBy(ValueUtil.ToText).Select(x => x.First()).ToList();
                o[f] = distinct.Count switch
                {
                    0 => null,
                    1 => distinct[0],
                    _ => string.Join(", ", distinct.Take(4).Select(ValueUtil.ToText)) + (distinct.Count > 4 ? ", …" : "")
                };
            }
            return o;
        }).OrderBy(o => ValueUtil.ToText(o.GetValueOrDefault(d.MaterialColumn!)), StringComparer.Create(ValueUtil.Tr, true)).ToList();
    }

    public record DekitRow(string order, string? address, bool found, int materialCount, int rowCount, double total, string? status, bool arrived, int keep, int go, int external, bool decided, string? note);

    /// <summary>Eklenen iş emirlerinin özeti (DEKIT sayfası ve Ana Sayfa ortak kullanır).</summary>
    internal static (List<DekitRow> rows, Reference reference) Summarize(AppConfig cfg, DataEngine engine, KittStore kitt, CustomTableStore tables,
        List<string> orders, IEnumerable<string>? others, List<string> warnings)
    {
        var snap = kitt.Snapshot();
        var located = Locate(cfg, engine, snap, orders, warnings);
        var d = cfg.Dekit;
        var stock = engine.Get(d.StockSourceId!);
        var ext = ExternalMaterials(cfg, tables);
        var reference = BuildReference(cfg, engine, snap, orders, others, warnings);

        var rows = located.Select(l =>
        {
            if (l.Address == null)
                return new DekitRow(l.Order, null, false, 0, 0, 0, l.Status, l.Arrived, 0, 0, 0, false, "İş emri formatı geçersiz");
            var groups = Group(d, stock, l.Rows, out _);
            var total = string.IsNullOrEmpty(d.QtyColumn) ? 0 : l.Rows.Sum(r => ValueUtil.ToNumber(r.GetValueOrDefault(d.QtyColumn)) ?? 0);
            int keep = 0, go = 0, external = 0; var decided = false; string? note = null;
            if (groups.Count > 0)
            {
                if (!reference.Usable) note = reference.Note;
                else
                {
                    decided = true;
                    foreach (var g in groups)
                        switch (Decide(d, reference, ext, (string)g["__mk"]!)) { case "keep": keep++; break; case "external": external++; break; default: go++; break; }
                }
            }
            return new DekitRow(l.Order, l.Address, groups.Count > 0, groups.Count, l.Rows.Count, total, l.Status, l.Arrived, keep, go, external, decided, note);
        }).ToList();
        return (rows, reference);
    }

    public static void MapDekitApi(this WebApplication app)
    {
        var api = app.MapGroup("/api");

        api.MapPut("/config/dekit", (DekitConfig body, HttpContext ctx, ConfigStore store, DataEngine engine) =>
        {
            var stale = ApiEndpoints.StaleCheck(ctx, store);
            if (stale != null) return stale;
            body.StripLeft = Math.Clamp(body.StripLeft, 0, 50);
            body.StripRight = Math.Clamp(body.StripRight, 0, 50);
            if (body.AddressMatch is not ("eq" or "startsWith" or "contains")) body.AddressMatch = "eq";
            if (body.CompareScope is not ("kitt" or "all")) body.CompareScope = "kitt";
            store.Update(c => c.Dekit = body);
            return Results.Ok(store.Current);
        });

        // ---------------------------------------------------------------- Eklenen iş emirlerinin özeti
        api.MapPost("/dekit/summary", (DekitSummaryRequest req, ConfigStore store, DataEngine engine, KittStore kitt, CustomTableStore tables) =>
        {
            var cfg = store.Current;
            try
            {
                var orders = (req.Orders ?? new()).Select(o => o.Trim()).Where(o => o.Length > 0).Distinct(StringComparer.OrdinalIgnoreCase).ToList();
                var warnings = new List<string>();
                var (rows, reference) = Summarize(cfg, engine, kitt, tables, orders, req.Others, warnings);

                return Results.Ok(new { rows, warnings = warnings.Distinct().ToList(), compare = new { count = reference.Orders.Count, orders = reference.Orders.Take(30).ToList(), note = reference.Note } });
            }
            catch (Exception ex) { return ApiEndpoints.Problem(ex); }
        });

        // ---------------------------------------------------------------- Bir iş emrinin ayrıntısı (modal)
        api.MapPost("/dekit/detail", (DekitDetailRequest req, ConfigStore store, DataEngine engine, KittStore kitt, CustomTableStore tables) =>
        {
            var cfg = store.Current;
            var d = cfg.Dekit;
            try
            {
                var order = (req.Order ?? "").Trim();
                if (order.Length == 0) throw new InvalidOperationException("İş emri boş.");
                var warnings = new List<string>();
                var l = Locate(cfg, engine, kitt.Snapshot(), new[] { order }, warnings)[0];
                if (l.Address == null) throw new InvalidOperationException("İş emri formatı geçersiz (adres elde edilemedi).");
                var stock = engine.Get(d.StockSourceId!);
                var rows = Group(d, stock, l.Rows, out var fields);

                // KART deposundaki adresler (yalnızca adres)
                var kart = new Dictionary<string, List<string>>();
                if (!string.IsNullOrEmpty(d.DepotColumn) && stock.Columns.Contains(d.DepotColumn) && rows.Count > 0)
                {
                    var mats = rows.Select(r => (string)r["__mk"]!).ToHashSet();
                    var kartKey = ValueUtil.KeyOf(d.KartDepotValue);
                    var filters = d.StockFilters.Where(f => !string.IsNullOrWhiteSpace(f.Column)).ToList();
                    foreach (var r in stock.Rows)
                    {
                        if (ValueUtil.KeyOf(r.GetValueOrDefault(d.DepotColumn)) != kartKey) continue;
                        var mk = MatKey(r.GetValueOrDefault(d.MaterialColumn!));
                        if (!mats.Contains(mk)) continue;
                        if (!string.IsNullOrEmpty(d.QtyColumn) && (ValueUtil.ToNumber(r.GetValueOrDefault(d.QtyColumn)) ?? 1) <= 0) continue;
                        if (filters.Count > 0 && !filters.All(f => ValueUtil.Evaluate(r.GetValueOrDefault(f.Column), f.Operator, f.Value, f.Value2))) continue;
                        var a = ValueUtil.ToText(r.GetValueOrDefault(d.AddressColumn!));
                        if (a.Length == 0) continue;
                        if (!kart.TryGetValue(mk, out var la)) kart[mk] = la = new();
                        if (!la.Contains(a)) la.Add(a);
                    }
                }

                // Kalsın / Gitsin: malzeme, DEKIT dışındaki (durumu "DEKIT Geldi" olmayan) iş emirlerinin COOIS listesinde geçiyorsa Kalsın, geçmiyorsa Gitsin
                var reference = BuildReference(cfg, engine, kitt.Snapshot(), (req.Orders ?? new()).Append(order), req.Others, warnings);
                if (!reference.Usable && rows.Count > 0) warnings.Add($"Kalsın / Gitsin kararı verilemedi: {reference.Note}.");

                int keep = 0, go = 0, external = 0;
                var ext = ExternalMaterials(cfg, tables);
                var outRows = rows.Select(r =>
                {
                    var mk = (string)r["__mk"]!;
                    string? decision = !reference.Usable ? null : Decide(d, reference, ext, mk);
                    r["__needs"] = reference.ByMaterial.TryGetValue(mk, out var needs) ? needs.Take(8).ToList() : new List<string>();
                    if (decision == "keep") keep++; else if (decision == "go") go++; else if (decision == "external") external++;
                    r["__kart"] = kart.GetValueOrDefault(mk) ?? new List<string>();
                    r["__karar"] = decision switch { null => "", "keep" => d.KeepLabel, "external" => d.ExternalLabel, _ => d.GoLabel };
                    r["__decision"] = decision;
                    r["__id"] = mk;
                    return r;
                }).ToList();

                var total = string.IsNullOrEmpty(d.QtyColumn) ? 0 : l.Rows.Sum(r => ValueUtil.ToNumber(r.GetValueOrDefault(d.QtyColumn)) ?? 0);
                return Results.Ok(new
                {
                    order,
                    address = l.Address,
                    columns = fields,
                    rows = outRows,
                    total,
                    materialCount = outRows.Count,
                    rowCount = l.Rows.Count,
                    status = l.Status,
                    arrived = l.Arrived,
                    decided = reference.Usable,
                    compare = new { count = reference.Orders.Count, orders = reference.Orders.Take(30).ToList(), note = reference.Note },
                    keep,
                    go,
                    external,
                    warnings = warnings.Distinct().ToList(),
                    loadedAt = stock.LoadedAt
                });
            }
            catch (Exception ex) { return ApiEndpoints.Problem(ex); }
        });

        // ---------------------------------------------------------------- Okutulan barkod: malzeme için Kalsın / Gitsin kararı
        // Malzeme adres listesinde olmasa bile (fiziksel olarak gelmiş olabilir) sistemde tanınıyorsa karar verilir.
        api.MapPost("/dekit/lookup", (DekitLookupRequest req, ConfigStore store, DataEngine engine, KittStore kitt, CustomTableStore tables) =>
        {
            var cfg = store.Current;
            var d = cfg.Dekit;
            try
            {
                var order = (req.Order ?? "").Trim();
                var code = (req.Code ?? "").Trim();
                if (order.Length == 0 || code.Length == 0) throw new InvalidOperationException("İş emri veya kod boş.");
                if (string.IsNullOrEmpty(d.StockSourceId) || string.IsNullOrEmpty(d.MaterialColumn) || string.IsNullOrEmpty(d.AddressColumn))
                    throw new InvalidOperationException("DEKIT ayarlarında stok kaynağı, malzeme ve adres kolonu seçilmeli.");

                var warnings = new List<string>();
                var addr = AddressOf(order, d);
                var addrKey = addr == null ? "" : ValueUtil.KeyOf(addr);
                // Karekod birden fazla alan içerebilir: tamamını ve parçalarını dene
                var cands = new[] { code }.Concat(System.Text.RegularExpressions.Regex.Split(code, @"[\s;,|\t]+"))
                    .Select(MatKey).Where(x => x.Length > 0).Distinct().ToList();

                var reference = BuildReference(cfg, engine, kitt.Snapshot(), (req.Orders ?? new()).Append(order), req.Others, warnings);
                var ext = ExternalMaterials(cfg, tables);
                var stock = engine.Get(d.StockSourceId);
                var descCol = stock.Columns.FirstOrDefault(c => c != d.MaterialColumn && System.Text.RegularExpressions.Regex.IsMatch(c, "kısa metni|tanım|açıklama", System.Text.RegularExpressions.RegexOptions.IgnoreCase));
                var kartKey = ValueUtil.KeyOf(d.KartDepotValue);
                var filters = d.StockFilters.Where(f => !string.IsNullOrWhiteSpace(f.Column)).ToList();

                var info = cands.ToDictionary(c => c, _ => new LookupInfo());
                foreach (var row in stock.Rows)
                {
                    var mk = MatKey(row.GetValueOrDefault(d.MaterialColumn!));
                    if (!info.TryGetValue(mk, out var rec)) continue;
                    if (filters.Count > 0 && !filters.All(f => ValueUtil.Evaluate(row.GetValueOrDefault(f.Column), f.Operator, f.Value, f.Value2))) continue;
                    rec.Any = true;
                    rec.Text ??= ValueUtil.ToText(row.GetValueOrDefault(d.MaterialColumn!));
                    if (descCol != null && rec.Desc == null) { var t = ValueUtil.ToText(row.GetValueOrDefault(descCol)); if (t.Length > 0) rec.Desc = t; }
                    var qty = string.IsNullOrEmpty(d.QtyColumn) ? 0 : ValueUtil.ToNumber(row.GetValueOrDefault(d.QtyColumn)) ?? 0;
                    var rk = ValueUtil.KeyOf(row.GetValueOrDefault(d.AddressColumn!));
                    if (addrKey.Length > 0 && rk.Length > 0 && AddrMatch(rk, addrKey, d.AddressMatch)) { rec.QtyAt += qty; rec.RowsAt++; }
                    if (!string.IsNullOrEmpty(d.DepotColumn) && ValueUtil.KeyOf(row.GetValueOrDefault(d.DepotColumn)) == kartKey && qty > 0)
                    {
                        var a = ValueUtil.ToText(row.GetValueOrDefault(d.AddressColumn!));
                        if (a.Length > 0 && !rec.Kart.Contains(a)) rec.Kart.Add(a);
                    }
                }

                // Sistemde tanınan ilk aday: LX02'de, diğer iş emirlerinin listesinde veya harici stokta geçen
                var mkSel = cands.FirstOrDefault(c => info[c].Any || reference.ByMaterial.ContainsKey(c) || ext.Contains(c));
                if (mkSel == null)
                    return Results.Ok(new { code, known = false, material = code, mk = (string?)null, description = (string?)null, inList = false, qtyAtAddress = 0d, kart = new List<string>(), decision = (string?)null, label = "", needs = new List<string>(), address = addr, note = (string?)"Kod LX02, diğer iş emirlerinin COOIS listeleri veya harici stok listesinde bulunamadı" });

                var r = info[mkSel];
                string? decision = reference.Usable ? Decide(d, reference, ext, mkSel) : null;
                var label = decision switch { null => "", "keep" => d.KeepLabel, "external" => d.ExternalLabel, _ => d.GoLabel };
                return Results.Ok(new
                {
                    code,
                    known = true,
                    material = r.Text ?? code,
                    mk = mkSel,
                    description = r.Desc,
                    inList = r.RowsAt > 0,
                    qtyAtAddress = r.QtyAt,
                    kart = r.Kart,
                    decision,
                    label,
                    needs = reference.ByMaterial.TryGetValue(mkSel, out var ns) ? ns.Take(8).ToList() : new List<string>(),
                    address = addr,
                    note = reference.Usable ? null : reference.Note
                });
            }
            catch (Exception ex) { return ApiEndpoints.Problem(ex); }
        });

        // ---------------------------------------------------------------- KITT'te hazırlık durumu "DEKIT Geldi" olan iş emirleri
        api.MapGet("/dekit/arrived", (ConfigStore store, DataEngine engine, KittStore kitt) =>
        {
            try { return Results.Ok(new { orders = ArrivedOrders(store.Current, engine, kitt), status = store.Current.Dekit.StatusValue }); }
            catch (Exception ex) { return ApiEndpoints.Problem(ex); }
        });
    }
}

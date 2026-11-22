using System.Text.Json;
using MeosKokpit.Api.Models;
using MeosKokpit.Api.Services;

namespace MeosKokpit.Api.Endpoints;

/// <summary>Ana Sayfa özeti: KITT Hazırlama ve DEKIT verilerinin tek yerde toplanmış hali (yalnızca okur).</summary>
public static class OverviewEndpoints
{
    private static List<string> PrefList(UserPrefsStore prefs, string user, string key)
    {
        if (!prefs.Get(user).TryGetValue(key, out var el) || el.ValueKind != JsonValueKind.Array) return new();
        return el.EnumerateArray().Where(x => x.ValueKind == JsonValueKind.String).Select(x => x.GetString()!.Trim()).Where(x => x.Length > 0)
            .Distinct(StringComparer.OrdinalIgnoreCase).ToList();
    }

    public static void MapOverviewApi(this WebApplication app)
    {
        app.MapGet("/api/overview", (HttpContext ctx, ConfigStore store, DataEngine engine, KittStore kitt, KittPickStore picks, CustomTableStore tables, UserPrefsStore prefs, OnMontajStore om) =>
        {
            var cfg = store.Current;
            var user = ApiEndpoints.UserOf(ctx) is { Length: > 0 } u ? u.Trim() : "_genel";
            var warnings = new List<string>();
            try
            {
                om.KitOrdersSeeded(() => prefs.AllLists("kokpit.kitt.selected"));
                var kittOrders = om.KitOrdersWithQueued(kitt.KeysWithValue("OM|", "om_durum", "Sıraya Alındı"));
                var dekitOrders = DekitEndpoints.ArrivedOrders(cfg, engine, kitt);
                var snap = kitt.Snapshot();
                var statusCol = DekitEndpoints.StatusColumnOf(cfg);
                var statusDef = cfg.KittPage.VirtualColumns.FirstOrDefault(v => v.Id == statusCol);
                var d = cfg.KittPage.Detail;

                // ---------------- KITT: iş emri başına durum + toplama ilerlemesi
                var pickSnap = picks.Snapshot();
                var kanbanMats = PickEndpoints.KanbanMaterials(cfg, tables);
                var processKeys = d.ProcessOptions.Where(o => !string.IsNullOrEmpty(o.TableId)).Select(o =>
                {
                    var def = cfg.CustomTables.FirstOrDefault(t => t.Id == o.TableId);
                    return (opt: o, keys: def == null ? new HashSet<string>() : tables.Keys(def, o.MatchColumnId));
                }).ToList();
                snap.TryGetValue(PickEndpoints.ProcessStoreKey, out var storedProcess);

                var bomOk = !string.IsNullOrEmpty(d.BomSourceId) && !string.IsNullOrEmpty(d.BomMatchColumn);
                SourceResult? bom = null;
                if (bomOk) { try { bom = engine.Get(d.BomSourceId!); } catch (Exception ex) { warnings.Add($"Bileşen kaynağı okunamadı: {ex.Message}"); } }

                var kittRows = new List<object>();
                foreach (var order in kittOrders)
                {
                    var (arrived, status) = DekitEndpoints.KittStatus(cfg, snap, order);
                    int total = 0, picked = 0, excluded = 0;
                    DateTime? lastPick = null;
                    if (bom != null)
                    {
                        foreach (var r in PickEndpoints.BomRowsFor(d, bom, order))
                        {
                            var mk = (string)r["__mk"]!;
                            var key = (string)r["__key"]!;
                            var isExcluded = false;
                            if (mk.Length > 0)
                            {
                                if (kanbanMats.Contains(mk)) isExcluded = d.Kanban.ExcludeFromCount;
                                else
                                {
                                    ProcessOption? opt = processKeys.FirstOrDefault(p => p.keys.Contains(mk)).opt;
                                    if (opt == null && storedProcess != null && storedProcess.TryGetValue(mk, out var cell) && cell.Value is { ValueKind: JsonValueKind.String } v)
                                        opt = d.ProcessOptions.FirstOrDefault(o => o.Label == v.GetString() && string.IsNullOrEmpty(o.TableId));
                                    if (opt != null) isExcluded = opt.ExcludeFromCount;
                                }
                            }
                            if (isExcluded) { excluded++; continue; }
                            total++;
                            if (pickSnap.TryGetValue(key, out var pi)) { picked++; if (lastPick == null || pi.At > lastPick) lastPick = pi.At; }
                        }
                    }
                    kittRows.Add(new { order, status, arrived, total, picked, excluded, lastPick });
                }

                // ---------------- DEKIT
                object? dekit = null;
                if (dekitOrders.Count > 0)
                {
                    try
                    {
                        var (rows, reference) = DekitEndpoints.Summarize(cfg, engine, kitt, tables, dekitOrders, kittOrders, warnings);
                        dekit = new { rows, compare = new { count = reference.Orders.Count, note = reference.Note } };
                    }
                    catch (Exception ex) { warnings.Add($"DEKIT özeti alınamadı: {ex.Message}"); }
                }

                // ---------------- "DEKIT Geldi" olduğu halde DEKIT listesinde olmayan iş emirleri
                var arrivedNotListed = new List<string>();
                if (statusCol != null)
                {
                    var listed = dekitOrders.Select(ValueUtil.KeyOf).ToHashSet();
                    arrivedNotListed = snap.Where(kv => kv.Key != PickEndpoints.ProcessStoreKey && !kv.Key.StartsWith(PickEndpoints.PickValuePrefix, StringComparison.Ordinal)
                            && kv.Value.TryGetValue(statusCol, out var c) && c.Value is { ValueKind: JsonValueKind.String } je && ValueUtil.ValuesEqual(je.GetString(), cfg.Dekit.StatusValue))
                        .Select(kv => kv.Key.Split('|')[0]).Distinct().Where(k => !listed.Contains(k)).OrderBy(k => k).ToList();
                }

                // ---------------- Son 14 gün toplama + son hareketler (tüm kullanıcılar)
                var today = DateTime.Today;
                var daily = Enumerable.Range(0, 14).Select(i => today.AddDays(i - 13))
                    .Select(day => new { date = day, scan = pickSnap.Values.Count(p => p.At.Date == day && p.Method == "scan"), manual = pickSnap.Values.Count(p => p.At.Date == day && p.Method != "scan") }).ToList();
                var recent = pickSnap.OrderByDescending(p => p.Value.At).Take(8).Select(p =>
                {
                    var parts = p.Key.Split('|');
                    return new { order = parts[0], material = parts.Length > 1 ? parts[1] : "", at = p.Value.At, by = p.Value.By, method = p.Value.Method };
                }).ToList();

                var customTables = cfg.CustomTables.Select(t => new { id = t.Id, name = t.Name, count = tables.Rows(t.Id).Count }).ToList();

                return Results.Ok(new
                {
                    user = user == "_genel" ? null : user,
                    statusName = statusDef?.Name ?? "Hazırlık Durumu",
                    statusOptions = statusDef?.Options ?? new List<string>(),
                    statusColors = statusDef?.OptionColors ?? new Dictionary<string, string>(),
                    dekitStatusValue = cfg.Dekit.StatusValue,
                    keepLabel = cfg.Dekit.KeepLabel,
                    goLabel = cfg.Dekit.GoLabel,
                    externalLabel = cfg.Dekit.ExternalLabel,
                    kitt = new { orders = kittRows },
                    dekit,
                    arrivedNotListed,
                    pickTotal = pickSnap.Count,
                    daily,
                    recent,
                    customTables,
                    warnings = warnings.Distinct().ToList(),
                    serverTime = DateTime.Now
                });
            }
            catch (Exception ex) { return ApiEndpoints.Problem(ex); }
        });
    }
}

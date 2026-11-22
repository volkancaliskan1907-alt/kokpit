using System.Text.Json;
using ClosedXML.Excel;
using MeosKokpit.Api.Models;
using MeosKokpit.Api.Services;

namespace MeosKokpit.Api.Endpoints;

public static class ApiEndpoints
{
    internal static string? UserOf(HttpContext ctx)
    {
        var u = ctx.Request.Headers["X-User"].FirstOrDefault();
        if (!string.IsNullOrWhiteSpace(u)) return Uri.UnescapeDataString(u);
        return ctx.User?.Identity?.Name;
    }

    internal static IResult Problem(Exception ex) =>
        Results.Json(new { error = ex.Message }, statusCode: ex is KeyNotFoundException ? 404 : 400);

    /// <summary>İstek ?rev= ile geldiyse ve ayarlar o sürümden sonra değiştiyse kaydı reddet (409).</summary>
    internal static IResult? StaleCheck(HttpContext ctx, ConfigStore store)
    {
        if (long.TryParse(ctx.Request.Query["rev"], out var rev) && rev != store.Current.Revision)
            return Results.Json(new
            {
                error = "Ayarlar siz bu sayfayı açtıktan sonra başka bir yerden değiştirildi. " +
                        "Diğer değişikliklerin üzerine yazılmaması için sayfayı yenileyin (F5) ve değişikliğinizi tekrar yapın.",
                conflict = true
            }, statusCode: 409);
        return null;
    }

    public static void MapKokpitApi(this WebApplication app)
    {
        var api = app.MapGroup("/api");
        api.AddEndpointFilter(async (ictx, next) =>
        {
            var http = ictx.HttpContext;
            if (HttpMethods.IsPut(http.Request.Method) && http.Request.Path.StartsWithSegments("/api/config"))
            {
                var stale = StaleCheck(http, http.RequestServices.GetRequiredService<ConfigStore>());
                if (stale != null) return stale;
            }
            return await next(ictx);
        });

        // ------------------------------------------------------------ Ayarlar
        api.MapGet("/config", (ConfigStore store) => Results.Json(store.Current, JsonDefaults.File));

        api.MapPut("/config/general", (GeneralSettings body, ConfigStore store) =>
        {
            store.Update(c => c.General = body);
            return Results.Ok(store.Current);
        });

        api.MapPut("/config/datasources", (List<DataSourceDef> body, ConfigStore store, DataEngine engine) =>
        {
            var dupe = body.GroupBy(d => d.Id).FirstOrDefault(g => g.Count() > 1);
            if (dupe != null) return Results.BadRequest(new { error = $"Aynı kimliğe sahip birden fazla kaynak var: {dupe.Key}" });
            if (body.Any(d => string.IsNullOrWhiteSpace(d.Name))) return Results.BadRequest(new { error = "Tüm veri kaynaklarının adı olmalı." });
            store.Update(c => c.DataSources = body);
            engine.InvalidateAll();
            return Results.Ok(store.Current);
        });

        api.MapPut("/config/orderpage", (OrderPageConfig body, ConfigStore store) =>
        {
            body.Orders = body.Orders.Where(o => !string.IsNullOrWhiteSpace(o)).Select(o => o.Trim()).Distinct().ToList();
            store.Update(c => c.OrderPage = body);
            return Results.Ok(store.Current);
        });

        api.MapPut("/config/kittpage", (JsonElement raw, ConfigStore store) =>
        {
            var body = raw.Deserialize<KittPageConfig>(JsonDefaults.File)!;
            // Eski sürüm bir sayfa "detail" alanını göndermezse mevcut detay ayarını koru
            if (!raw.TryGetProperty("detail", out _)) body.Detail = store.Current.KittPage.Detail;
            var dupe = body.VirtualColumns.GroupBy(v => v.Id).FirstOrDefault(g => g.Count() > 1);
            if (dupe != null) return Results.BadRequest(new { error = "Sanal kolon kimlikleri benzersiz olmalı." });
            store.Update(c => c.KittPage = body);
            return Results.Ok(store.Current);
        });

        // ------------------------------------------------------------ Veri kaynakları
        api.MapPost("/sources/test", (DataSourceDef def, ExcelReaderService reader) =>
        {
            var res = new SourceTestResult();
            try
            {
                res.Files = reader.ResolveFiles(def);
                if (res.Files.Count == 0) throw new InvalidOperationException("Desene uygun dosya bulunamadı.");
                var first = res.Files[0].Path;
                res.Sheets = reader.GetSheetNames(first);
                var data = reader.Read(first, def.SheetName, def.HeaderRow);
                res.Columns = data.Columns;
                res.RowCount = data.Rows.Count;
                res.SampleRows = data.Rows.Take(20).ToList();
                res.Ok = true;
            }
            catch (Exception ex) { res.Ok = false; res.Error = ex.Message; }
            return Results.Ok(res);
        });

        api.MapGet("/sources/{id}/preview", (string id, int? limit, DataEngine engine) =>
        {
            try
            {
                var r = engine.Get(id);
                return Results.Ok(new
                {
                    columns = r.Columns,
                    computedColumns = r.ComputedColumns,
                    rows = r.Rows.Take(Math.Clamp(limit ?? 500, 1, 20000)),
                    totalRows = r.Rows.Count,
                    files = r.Files,
                    warnings = r.Warnings,
                    loadedAt = r.LoadedAt
                });
            }
            catch (Exception ex) { return Problem(ex); }
        });

        api.MapGet("/sources/{id}/columns", (string id, DataEngine engine) =>
        {
            try
            {
                var r = engine.Get(id);
                return Results.Ok(new { columns = r.Columns, computedColumns = r.ComputedColumns, warnings = r.Warnings });
            }
            catch (Exception ex) { return Problem(ex); }
        });

        api.MapGet("/sources/{id}/distinct", (string id, string column, DataEngine engine) =>
        {
            try
            {
                var r = engine.Get(id);
                return Results.Ok(Distinct(r.Rows, column));
            }
            catch (Exception ex) { return Problem(ex); }
        });

        api.MapPost("/sources/reload", (DataEngine engine) => { engine.InvalidateAll(); return Results.Ok(); });

        api.MapGet("/fs/browse", (string? path) =>
        {
            try
            {
                if (string.IsNullOrWhiteSpace(path))
                {
                    var drives = DriveInfo.GetDrives().Where(d => d.IsReady).Select(d => d.RootDirectory.FullName).ToList();
                    return Results.Ok(new { path = "", parent = (string?)null, dirs = drives, files = new List<string>() });
                }
                var di = new DirectoryInfo(path);
                if (!di.Exists) return Results.BadRequest(new { error = "Dizin bulunamadı." });
                var exts = new[] { ".xlsx", ".xls", ".xlsm", ".xlsb", ".csv" };
                return Results.Ok(new
                {
                    path = di.FullName,
                    parent = di.Parent?.FullName,
                    dirs = di.EnumerateDirectories().Where(d => (d.Attributes & FileAttributes.Hidden) == 0).Select(d => d.Name).OrderBy(n => n).Take(500).ToList(),
                    files = di.EnumerateFiles().Where(f => exts.Contains(f.Extension.ToLowerInvariant()) && !f.Name.StartsWith("~$")).Select(f => f.Name).OrderBy(n => n).Take(500).ToList()
                });
            }
            catch (Exception ex) { return Problem(ex); }
        });

        // ------------------------------------------------------------ Sipariş sayfası
        api.MapGet("/orders/options", (ConfigStore store, DataEngine engine) =>
        {
            var cfg = store.Current.OrderPage;
            try
            {
                var counts = new Dictionary<string, int>();
                var display = new Dictionary<string, string>();
                var desc = new Dictionary<string, string>();
                if (!string.IsNullOrEmpty(cfg.SourceId) && !string.IsNullOrEmpty(cfg.OrderColumn))
                {
                    foreach (var row in engine.Get(cfg.SourceId).Rows)
                    {
                        var v = row.GetValueOrDefault(cfg.OrderColumn);
                        if (ValueUtil.IsEmpty(v)) continue;
                        var k = ValueUtil.KeyOf(v);
                        counts[k] = counts.GetValueOrDefault(k) + 1;
                        display.TryAdd(k, ValueUtil.ToText(v));
                        if (!string.IsNullOrEmpty(cfg.OrderDescriptionColumn) && !desc.ContainsKey(k)) { var dv = ValueUtil.ToText(row.GetValueOrDefault(cfg.OrderDescriptionColumn)); if (dv.Length > 0) desc[k] = dv; }
                    }
                }
                var list = cfg.Orders.Count > 0
                    ? cfg.Orders.Select(o => new { value = o, rowCount = counts.GetValueOrDefault(ValueUtil.KeyOf(o)), description = desc.GetValueOrDefault(ValueUtil.KeyOf(o)) })
                    : display.OrderBy(x => x.Value).Select(x => new { value = x.Value, rowCount = counts[x.Key], description = desc.GetValueOrDefault(x.Key) });
                return Results.Ok(list.ToList());
            }
            catch (Exception ex) { return Problem(ex); }
        });

        api.MapPost("/orders/data", (ConfigStore store, DataEngine engine, KittStore kitt, CustomTableStore tables, OnMontajStore om) =>
        {
            var cfg = store.Current.OrderPage;
            try
            {
                if (string.IsNullOrEmpty(cfg.SourceId) || string.IsNullOrEmpty(cfg.OrderColumn))
                    throw new InvalidOperationException("Ön Montaj sayfası için veri kaynağı ve sipariş kolonu ayarlardan seçilmeli.");
                var src = engine.Get(cfg.SourceId);
                var state = om.Snapshot();
                var filtered = FilterByOrders(src.Rows, cfg.OrderColumn, state.Orders);
                var rows = new List<Dictionary<string, object?>>(filtered.Count);
                var used = new Dictionary<string, int>();
                foreach (var r in filtered)
                {
                    var key = "OM|" + ValueUtil.KeyOf(r.GetValueOrDefault(cfg.OrderColumn)) + "|" +
                              string.Join("|", cfg.KeyColumns.Select(k => ValueUtil.KeyOf(r.GetValueOrDefault(k))));
                    var n = used.GetValueOrDefault(key);
                    used[key] = n + 1;
                    if (n > 0) key = $"{key}#{n + 1}";
                    rows.Add(new Dictionary<string, object?>(r) { ["__key"] = key });
                }
                var deleted = state.Deleted.ToHashSet();
                var pos = new Dictionary<string, int>();
                for (var i = 0; i < state.Order.Count; i++) pos.TryAdd(state.Order[i], i);
                rows = rows.Where(r => !deleted.Contains((string)r["__key"]!))
                           .OrderBy(r => pos.TryGetValue((string)r["__key"]!, out var i) ? i : int.MaxValue).ToList();
                // Özel tablolardan gelen kolonlar (TBDK / Malzeme eşleşmesiyle)
                foreach (var lc in cfg.LookupColumns)
                {
                    var def = store.Current.CustomTables.FirstOrDefault(t => t.Id == lc.TableId);
                    if (def == null || string.IsNullOrEmpty(lc.ValueColumnId)) continue;
                    var byKey = tables.ByKey(def, lc.MatchColumnId);
                    foreach (var r in rows)
                    {
                        var k = ValueUtil.KeyOf(r.GetValueOrDefault(cfg.TbdkColumn ?? ""));
                        r["lk:" + lc.Id] = k.Length > 0 && byKey.TryGetValue(k, out var cr) && cr.Values.TryGetValue(lc.ValueColumnId, out var v)
                            ? ValueUtil.FromJson(v) : null;
                    }
                }
                var values = kitt.GetMany(rows.Select(r => (string)r["__key"]!));
                return Results.Ok(new
                {
                    columns = src.Columns, computedColumns = src.ComputedColumns, rows, values,
                    warnings = src.Warnings, loadedAt = src.LoadedAt, totalRows = rows.Count
                });
            }
            catch (Exception ex) { return Problem(ex); }
        });

        api.MapPost("/orders/add", (OrdersRequest req, OnMontajStore om) => Results.Ok(new { added = om.AddOrders(req.Orders) }));
        api.MapPost("/orders/rows/delete", (OnMontajKeysRequest req, OnMontajStore om) => { om.DeleteRows(req.Keys); return Results.Ok(); });
        api.MapPut("/orders/rows/order", (OnMontajKeysRequest req, OnMontajStore om) => { om.SetOrder(req.Keys); return Results.Ok(); });

        api.MapGet("/orders/vcoptions", (ConfigStore store, DataEngine engine) =>
        {
            var result = new Dictionary<string, List<string>>();
            foreach (var vc in store.Current.OrderPage.VirtualColumns)
            {
                var opts = new List<string>(vc.Options);
                if (!string.IsNullOrEmpty(vc.OptionsSourceId) && !string.IsNullOrEmpty(vc.OptionsColumn))
                {
                    try { opts.AddRange(Distinct(engine.Get(vc.OptionsSourceId).Rows, vc.OptionsColumn)); }
                    catch { /* kaynak okunamazsa sabit seçenekler kullanılır */ }
                }
                result[vc.Id] = opts.Distinct().ToList();
            }
            return Results.Ok(result);
        });

        api.MapPut("/orders/values", (KittValueUpdate req, HttpContext ctx, ConfigStore store, KittStore kitt, OnMontajStore om) =>
        {
            if (req.RowKeys.Count == 0) return Results.BadRequest(new { error = "Satır seçilmedi." });
            if (store.Current.OrderPage.VirtualColumns.All(v => v.Id != req.ColumnId))
                return Results.BadRequest(new { error = "Kolon bulunamadı." });
            var user = UserOf(ctx);
            kitt.SetValues(req.RowKeys, req.ColumnId, req.Value, user);
            // Durum "Sıraya Alındı" olduğu anda sipariş KITT hazırlama listesine aktarılır
            if (req.ColumnId == "om_durum" && req.Value is { ValueKind: JsonValueKind.String } v
                && string.Equals(v.GetString()?.Trim(), "Sıraya Alındı", StringComparison.CurrentCultureIgnoreCase))
                foreach (var k in req.RowKeys) om.AddKitOrderByRowKey(k);
            return Results.Ok(new { by = user, at = DateTime.Now });
        });

        api.MapGet("/kitt/orders", (OnMontajStore om, UserPrefsStore prefs, KittStore kitt) =>
        {
            om.KitOrdersSeeded(() => prefs.AllLists("kokpit.kitt.selected"));
            return Results.Ok(om.KitOrdersWithQueued(kitt.KeysWithValue("OM|", "om_durum", "Sıraya Alındı")));
        });

        // Siparişi KITT hazırlama ve DEKIT listesinden tamamen kaldırır (girilen KITT değerleri ve toplama işaretleri silinir)
        api.MapPost("/kitt/orders/remove", (OrdersRequest req, OnMontajStore om, KittStore kitt, KittPickStore picks) =>
        {
            foreach (var o in req.Orders.Select(x => x.Trim()).Where(x => x.Length > 0))
            {
                var k = ValueUtil.KeyOf(o);
                kitt.RemoveOrder(k);
                picks.RemoveByPrefix(k + "|");
                om.RemoveKitOrder(o);
            }
            return Results.Ok();
        });

        // ------------------------------------------------------------ KITT sayfası
        api.MapPost("/kitt/data", (OrdersRequest req, ConfigStore store, DataEngine engine, KittStore kitt) =>
        {
            var cfg = store.Current.KittPage;
            try
            {
                if (string.IsNullOrEmpty(cfg.SourceId) || string.IsNullOrEmpty(cfg.OrderColumn))
                    throw new InvalidOperationException("KITT sayfası için veri kaynağı ve sipariş kolonu ayarlardan seçilmeli.");
                var src = engine.Get(cfg.SourceId);
                var filtered = FilterByOrders(src.Rows, cfg.OrderColumn, req.Orders);
                var warnings = new List<string>(src.Warnings);
                if (cfg.KeyColumns.Count == 0)
                    warnings.Add("KITT için satır anahtar kolonları tanımlanmamış; girilen değerler satır sırasına göre saklanır. Ayarlardan anahtar kolon seçmeniz önerilir.");

                var rows = new List<Dictionary<string, object?>>(filtered.Count);
                var used = new Dictionary<string, int>();
                var dupCount = 0;
                foreach (var r in filtered)
                {
                    var order = ValueUtil.KeyOf(r.GetValueOrDefault(cfg.OrderColumn));
                    string key;
                    if (cfg.KeyColumns.Count > 0)
                        key = order + "|" + string.Join("|", cfg.KeyColumns.Select(k => ValueUtil.KeyOf(r.GetValueOrDefault(k))));
                    else
                        key = order + "|#";
                    var n = used.GetValueOrDefault(key);
                    used[key] = n + 1;
                    if (n > 0 || cfg.KeyColumns.Count == 0)
                    {
                        if (cfg.KeyColumns.Count > 0) dupCount++;
                        key = $"{key}#{n + 1}";
                    }
                    var copy = new Dictionary<string, object?>(r) { ["__key"] = key };
                    rows.Add(copy);
                }
                if (dupCount > 0)
                    warnings.Add($"{dupCount} satırın anahtarı tekrar ediyor; bu satırlar sıra numarasıyla ayrıştırıldı. Anahtar kolonlarını kontrol edin.");

                var values = kitt.GetMany(rows.Select(r => (string)r["__key"]!));
                return Results.Ok(new
                {
                    columns = src.Columns,
                    computedColumns = src.ComputedColumns,
                    rows,
                    values,
                    warnings,
                    loadedAt = src.LoadedAt,
                    totalRows = rows.Count
                });
            }
            catch (Exception ex) { return Problem(ex); }
        });

        api.MapGet("/kitt/options", (ConfigStore store, DataEngine engine) =>
        {
            var result = new Dictionary<string, List<string>>();
            foreach (var vc in store.Current.KittPage.VirtualColumns.Concat(store.Current.KittPage.Detail.VirtualColumns))
            {
                var opts = new List<string>(vc.Options);
                if (!string.IsNullOrEmpty(vc.OptionsSourceId) && !string.IsNullOrEmpty(vc.OptionsColumn))
                {
                    try { opts.AddRange(Distinct(engine.Get(vc.OptionsSourceId).Rows, vc.OptionsColumn)); }
                    catch { /* kaynak okunamazsa sabit seçenekler kullanılır */ }
                }
                result[vc.Id] = opts.Distinct().ToList();
            }
            return Results.Ok(result);
        });

        api.MapPut("/kitt/values", (KittValueUpdate req, HttpContext ctx, ConfigStore store, KittStore kitt, DataEngine engine) =>
        {
            if (req.RowKeys.Count == 0) return Results.BadRequest(new { error = "Satır seçilmedi." });
            if (store.Current.KittPage.VirtualColumns.Concat(store.Current.KittPage.Detail.VirtualColumns).All(v => v.Id != req.ColumnId))
                return Results.BadRequest(new { error = "Sanal kolon bulunamadı." });
            var user = UserOf(ctx);
            kitt.SetValues(req.RowKeys, req.ColumnId, req.Value, user);
            SyncKitStatusToOnMontaj(store.Current, engine, kitt, req, user);
            // Durum belirli değere gelince tarih kolonunu bugünle doldur
            var extra = new List<object>();
            if (req.Value is { ValueKind: JsonValueKind.String } sv)
                foreach (var ad in store.Current.KittPage.AutoDates.Where(a => a.StatusColumnId == req.ColumnId && a.DateColumnId.Length > 0
                             && string.Equals(a.StatusValue.Trim(), sv.GetString()?.Trim(), StringComparison.CurrentCultureIgnoreCase)))
                {
                    var today = DateTime.Now.ToString("yyyy-MM-dd");
                    kitt.SetValues(req.RowKeys, ad.DateColumnId, JsonSerializer.SerializeToElement(today), user);
                    extra.Add(new { columnId = ad.DateColumnId, value = today });
                }
            return Results.Ok(new { by = user, at = DateTime.Now, extra });
        });

        api.MapPost("/kitt/notes", (KittNoteRequest req, HttpContext ctx, KittStore kitt) =>
        {
            if (string.IsNullOrWhiteSpace(req.Text)) return Results.BadRequest(new { error = "Not boş olamaz." });
            return Results.Ok(kitt.AddNote(req.RowKey, req.ColumnId, req.Text, UserOf(ctx)));
        });

        api.MapPost("/kitt/notes/delete", (KittNoteDeleteRequest req, HttpContext ctx, KittStore kitt) =>
            Results.Ok(kitt.DeleteNote(req.RowKey, req.ColumnId, req.NoteId, UserOf(ctx))));

        // ------------------------------------------------------------ Ana sayfa
        api.MapGet("/dashboard", (ConfigStore store, DataEngine engine, KittStore kitt) =>
        {
            var cfg = store.Current;
            var sources = cfg.DataSources.Select(d =>
            {
                try
                {
                    var r = engine.Get(d.Id);
                    return new
                    {
                        id = d.Id, name = d.Name, description = d.Description, ok = true, error = (string?)null,
                        rowCount = r.Rows.Count, columnCount = r.Columns.Count, computedCount = r.ComputedColumns.Count,
                        fileCount = r.Files.Count,
                        lastWrite = r.Files.Count > 0 ? r.Files.Max(f => f.LastWriteTime) : (DateTime?)null,
                        warnings = r.Warnings
                    };
                }
                catch (Exception ex)
                {
                    return new
                    {
                        id = d.Id, name = d.Name, description = d.Description, ok = false, error = (string?)ex.Message,
                        rowCount = 0, columnCount = 0, computedCount = 0, fileCount = 0, lastWrite = (DateTime?)null,
                        warnings = new List<string>()
                    };
                }
            }).ToList();

            // Sipariş bazında özet
            var orderSummary = new List<object>();
            var op = cfg.OrderPage;
            if (!string.IsNullOrEmpty(op.SourceId) && !string.IsNullOrEmpty(op.OrderColumn))
            {
                try
                {
                    var src = engine.Get(op.SourceId);
                    var groups = src.Rows.GroupBy(r => ValueUtil.KeyOf(r.GetValueOrDefault(op.OrderColumn))).ToDictionary(g => g.Key, g => g.Count());
                    var list = op.Orders.Count > 0 ? op.Orders : groups.Keys.Where(k => k.Length > 0).Take(50).ToList();
                    foreach (var o in list)
                        orderSummary.Add(new { order = o, rowCount = groups.GetValueOrDefault(ValueUtil.KeyOf(o)) });
                }
                catch { /* kaynak hatası kaynak kartında gösterilir */ }
            }

            return Results.Ok(new
            {
                general = cfg.General,
                sources,
                orderCount = op.Orders.Count,
                orderSummary,
                kittRowCount = kitt.RowCount,
                virtualColumnCount = cfg.KittPage.VirtualColumns.Count,
                serverTime = DateTime.Now
            });
        });

        // ------------------------------------------------------------ Excel'e aktar
        api.MapPost("/export", (ExportRequest req) =>
        {
            using var wb = new XLWorkbook();
            var sheetName = string.IsNullOrWhiteSpace(req.SheetName) ? "Veri" : new string(req.SheetName.Where(ch => !"[]*?/\\:".Contains(ch)).Take(31).ToArray());
            var ws = wb.AddWorksheet(sheetName);
            for (var c = 0; c < req.Columns.Count; c++)
            {
                var cell = ws.Cell(1, c + 1);
                cell.Value = req.Columns[c].Label;
                cell.Style.Font.Bold = true;
                cell.Style.Font.FontColor = XLColor.White;
                cell.Style.Fill.BackgroundColor = XLColor.FromHtml("#0B2E59");
            }
            for (var r = 0; r < req.Rows.Count; r++)
            {
                var row = req.Rows[r];
                for (var c = 0; c < req.Columns.Count; c++)
                {
                    var col = req.Columns[c];
                    if (!row.TryGetValue(col.Field, out var je)) continue;
                    var cell = ws.Cell(r + 2, c + 1);
                    switch (je.ValueKind)
                    {
                        case JsonValueKind.Number: cell.Value = je.GetDouble(); break;
                        case JsonValueKind.True: cell.Value = "Evet"; break;
                        case JsonValueKind.False: cell.Value = "Hayır"; break;
                        case JsonValueKind.String:
                            var s = je.GetString() ?? "";
                            if ((col.Format is "date" or "datetime" or "auto") && s.Length >= 10 && s[4] == '-' && s[7] == '-' && DateTime.TryParse(s, out var dt))
                            {
                                cell.Value = dt;
                                cell.Style.DateFormat.Format = col.Format == "datetime" || dt.TimeOfDay != TimeSpan.Zero ? "dd.mm.yyyy hh:mm" : "dd.mm.yyyy";
                            }
                            else cell.Value = s;
                            break;
                        case JsonValueKind.Array: cell.Value = ValueUtil.ToText(je); break;
                    }
                }
            }
            var used = ws.RangeUsed();
            if (used != null)
            {
                used.SetAutoFilter();
                ws.SheetView.FreezeRows(1);
                ws.Columns().AdjustToContents(1, Math.Min(req.Rows.Count + 1, 500));
                foreach (var col in ws.ColumnsUsed()) if (col.Width > 60) col.Width = 60;
            }
            using var ms = new MemoryStream();
            wb.SaveAs(ms);
            var name = $"{req.FileName}_{DateTime.Now:yyyyMMdd_HHmm}.xlsx";
            return Results.File(ms.ToArray(), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", name);
        });
    }

    /// <summary>KITT'te izlenen kolon değişince, aynı siparişin Ön Montaj satırlarında Durum değerini eşleştirmeye göre günceller.</summary>
    private static void SyncKitStatusToOnMontaj(AppConfig cfg, DataEngine engine, KittStore kitt, KittValueUpdate req, string? user)
    {
        var sync = cfg.OrderPage.KitSync;
        if (string.IsNullOrEmpty(sync.KitColumnId) || sync.KitColumnId != req.ColumnId || req.Value is not { ValueKind: JsonValueKind.String } v) return;
        var map = sync.Map.FirstOrDefault(m => string.Equals(m.Kit.Trim(), v.GetString()?.Trim(), StringComparison.CurrentCultureIgnoreCase));
        if (map == null || string.IsNullOrWhiteSpace(map.OnMontaj)) return;
        var op = cfg.OrderPage;
        if (string.IsNullOrEmpty(op.SourceId) || string.IsNullOrEmpty(op.OrderColumn)) return;
        var orderKeys = req.RowKeys.Select(k => k.Split('|')[0]).Distinct().ToHashSet();
        var used = new Dictionary<string, int>();
        var keys = new List<string>();
        foreach (var r in engine.Get(op.SourceId).Rows)
        {
            var ok = ValueUtil.KeyOf(r.GetValueOrDefault(op.OrderColumn));
            if (!orderKeys.Contains(ok)) continue;
            var key = "OM|" + ok + "|" + string.Join("|", op.KeyColumns.Select(c => ValueUtil.KeyOf(r.GetValueOrDefault(c))));
            var n = used.GetValueOrDefault(key);
            used[key] = n + 1;
            if (n > 0) key = $"{key}#{n + 1}";
            keys.Add(key);
        }
        if (keys.Count > 0)
            kitt.SetValues(keys, "om_durum", System.Text.Json.JsonSerializer.SerializeToElement(map.OnMontaj.Trim()), user);
    }

    private static List<Dictionary<string, object?>> FilterByOrders(List<Dictionary<string, object?>> rows, string orderColumn, List<string> orders)
    {
        if (orders.Count == 0) return new();
        var set = orders.Select(ValueUtil.KeyOf).ToHashSet();
        return rows.Where(r => set.Contains(ValueUtil.KeyOf(r.GetValueOrDefault(orderColumn)))).ToList();
    }

    private static List<string> Distinct(List<Dictionary<string, object?>> rows, string column) =>
        rows.Select(r => r.GetValueOrDefault(column))
            .Where(v => !ValueUtil.IsEmpty(v))
            .Select(ValueUtil.ToText)
            .Distinct(StringComparer.CurrentCultureIgnoreCase)
            .OrderBy(x => x, StringComparer.Create(ValueUtil.Tr, true))
            .Take(5000)
            .ToList();
}

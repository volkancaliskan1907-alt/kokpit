using System.Text.Json;
using ClosedXML.Excel;
using ExcelDataReader;
using MeosKokpit.Api.Models;
using MeosKokpit.Api.Services;

namespace MeosKokpit.Api.Endpoints;

public class TableRowRequest { public Dictionary<string, JsonElement> Values { get; set; } = new(); }
public class TableDeleteRequest { public List<string> Ids { get; set; } = new(); }

/// <summary>Özel tablolar: tanım kaydı, satır CRUD, Excel şablon / içe aktarma.</summary>
public static class TableEndpoints
{
    private static string ColLetter(int i) { var s = ""; for (i++; i > 0; i = (i - 1) / 26) s = (char)('A' + (i - 1) % 26) + s; return s; }

    private static List<object?[]> ReadGrid(IFormFile file)
    {
        System.Text.Encoding.RegisterProvider(System.Text.CodePagesEncodingProvider.Instance);
        using var ms = new MemoryStream();
        file.CopyTo(ms); ms.Position = 0;
        using var r = file.FileName.EndsWith(".csv", StringComparison.OrdinalIgnoreCase) ? ExcelReaderFactory.CreateCsvReader(ms) : ExcelReaderFactory.CreateReader(ms);
        var rows = new List<object?[]>();
        while (r.Read())
        {
            var a = new object?[r.FieldCount];
            for (var c = 0; c < a.Length; c++) a[c] = r.GetValue(c);
            rows.Add(a);
        }
        return rows;
    }

    private static CustomTableDef Def(ConfigStore store, string id) =>
        store.Current.CustomTables.FirstOrDefault(t => t.Id == id) ?? throw new KeyNotFoundException("Tablo bulunamadı.");

    private static JsonElement ToJson(object? v) => v switch
    {
        null => JsonSerializer.SerializeToElement((string?)null),
        DateTime dt => JsonSerializer.SerializeToElement(dt.ToString("yyyy-MM-dd")),
        double d => JsonSerializer.SerializeToElement(d),
        bool b => JsonSerializer.SerializeToElement(b),
        _ => JsonSerializer.SerializeToElement(ValueUtil.ToText(v))
    };

    public static void MapTableApi(this WebApplication app)
    {
        var api = app.MapGroup("/api");

        api.MapPut("/config/tables", (List<CustomTableDef> body, HttpContext ctx, ConfigStore store) =>
        {
            var stale = ApiEndpoints.StaleCheck(ctx, store);
            if (stale != null) return stale;
            if (body.GroupBy(t => t.Id).Any(g => g.Count() > 1)) return Results.BadRequest(new { error = "Tablo kimlikleri benzersiz olmalı." });
            store.Update(c => c.CustomTables = body);
            return Results.Ok(store.Current);
        });

        api.MapGet("/tables/summary", (CustomTableStore tables) => Results.Ok(tables.Summary()));

        api.MapGet("/tables/{id}/rows", (string id, ConfigStore store, CustomTableStore tables) =>
        {
            try { Def(store, id); return Results.Ok(tables.Rows(id)); } catch (Exception ex) { return ApiEndpoints.Problem(ex); }
        });

        api.MapPost("/tables/{id}/rows", (string id, TableRowRequest req, HttpContext ctx, ConfigStore store, CustomTableStore tables) =>
        {
            try { return Results.Ok(tables.Add(Def(store, id), req.Values, ApiEndpoints.UserOf(ctx))); } catch (Exception ex) { return ApiEndpoints.Problem(ex); }
        });

        api.MapPut("/tables/{id}/rows/{rowId}", (string id, string rowId, TableRowRequest req, HttpContext ctx, ConfigStore store, CustomTableStore tables) =>
        {
            try { return Results.Ok(tables.Update(Def(store, id), rowId, req.Values, ApiEndpoints.UserOf(ctx))); } catch (Exception ex) { return ApiEndpoints.Problem(ex); }
        });

        api.MapPost("/tables/{id}/rows/delete", (string id, TableDeleteRequest req, ConfigStore store, CustomTableStore tables) =>
        {
            try { Def(store, id); return Results.Ok(new { deleted = tables.Delete(id, req.Ids) }); } catch (Exception ex) { return ApiEndpoints.Problem(ex); }
        });

        api.MapGet("/tables/{id}/template", (string id, bool? withData, ConfigStore store, CustomTableStore tables) =>
        {
            try
            {
                var def = Def(store, id);
                using var wb = new XLWorkbook();
                var ws = wb.AddWorksheet("Veri");
                for (var c = 0; c < def.Columns.Count; c++)
                {
                    var cell = ws.Cell(1, c + 1);
                    cell.Value = def.Columns[c].Name;
                    cell.Style.Font.Bold = true; cell.Style.Font.FontColor = XLColor.White; cell.Style.Fill.BackgroundColor = XLColor.FromHtml("#0B2E59");
                }
                if (withData == true)
                {
                    var r = 2;
                    foreach (var row in tables.Rows(id))
                    {
                        for (var c = 0; c < def.Columns.Count; c++)
                            if (row.Values.TryGetValue(def.Columns[c].Id, out var v))
                            {
                                if (v.ValueKind == JsonValueKind.Number) ws.Cell(r, c + 1).Value = v.GetDouble();
                                else ws.Cell(r, c + 1).Value = ValueUtil.ToText(v);
                            }
                        r++;
                    }
                }
                ws.Columns().AdjustToContents();
                using var ms = new MemoryStream();
                wb.SaveAs(ms);
                return Results.File(ms.ToArray(), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", $"{def.Name}_sablon.xlsx");
            }
            catch (Exception ex) { return ApiEndpoints.Problem(ex); }
        });

        api.MapPost("/tables/{id}/import/preview", async (string id, HttpRequest req, ConfigStore store) =>
        {
            try
            {
                Def(store, id);
                var form = await req.ReadFormAsync();
                var file = form.Files["file"] ?? throw new InvalidOperationException("Dosya seçilmedi.");
                var hdr = int.TryParse(form["headerRow"], out var h) ? Math.Max(1, h) : 1;
                var grid = ReadGrid(file);
                var width = grid.Count == 0 ? 0 : grid.Max(r => r.Length);
                var cols = Enumerable.Range(0, width).Select(c => new
                {
                    letter = ColLetter(c),
                    header = hdr - 1 < grid.Count && c < grid[hdr - 1].Length && !ValueUtil.IsEmpty(grid[hdr - 1][c]) ? ValueUtil.ToText(grid[hdr - 1][c]).Trim() : null,
                    samples = grid.Skip(hdr).Take(3).Where(r => c < r.Length && !ValueUtil.IsEmpty(r[c])).Select(r => ValueUtil.ToText(r[c])).ToList()
                }).ToList();
                return Results.Ok(new { rowCount = Math.Max(0, grid.Count - hdr), headerRow = hdr, columns = cols });
            }
            catch (Exception ex) { return ApiEndpoints.Problem(ex); }
        });

        api.MapPost("/tables/{id}/import", async (string id, bool? update, HttpContext ctx, ConfigStore store, CustomTableStore tables) =>
        {
            try
            {
                var def = Def(store, id);
                var form = await ctx.Request.ReadFormAsync();
                var file = form.Files["file"] ?? throw new InvalidOperationException("Dosya seçilmedi.");
                var hdr = int.TryParse(form["headerRow"], out var h) ? Math.Max(1, h) : 1;
                var mapping = JsonSerializer.Deserialize<Dictionary<string, string>>(form["mapping"].ToString(), JsonDefaults.File) ?? new();
                var user = ApiEndpoints.UserOf(ctx);
                var grid = ReadGrid(file);
                var letters = Enumerable.Range(0, grid.Count == 0 ? 0 : grid.Max(r => r.Length)).ToDictionary(ColLetter, c => c);

                var rows = new List<Dictionary<string, JsonElement>>();
                foreach (var g in grid.Skip(hdr))
                {
                    var vals = new Dictionary<string, JsonElement>();
                    foreach (var (colId, src) in mapping)
                    {
                        if (src == "@tarih") vals[colId] = ToJson(DateTime.Today);
                        else if (src == "@kullanici") vals[colId] = ToJson(user ?? "");
                        else if (letters.TryGetValue(src, out var ci) && ci < g.Length && !ValueUtil.IsEmpty(g[ci])) vals[colId] = ToJson(g[ci]);
                    }
                    if (vals.Count > 0) rows.Add(vals);
                }
                var (added, updated, skipped, errors) = tables.Import(def, rows, update == true, user);
                var ignored = Enumerable.Range(0, letters.Count).Select(ColLetter).Where(l => !mapping.Values.Contains(l)).ToList();
                return Results.Ok(new { added, updated, skipped, errors, totalRows = rows.Count, ignoredColumns = ignored });
            }
            catch (Exception ex) { return ApiEndpoints.Problem(ex); }
        });
    }
}

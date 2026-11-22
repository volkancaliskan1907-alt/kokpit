using System.Text.Json;
using MeosKokpit.Api.Models;

namespace MeosKokpit.Api.Services;

public class KittCell
{
    public JsonElement? Value { get; set; }
    public string? By { get; set; }
    public DateTime At { get; set; }
}

public class KittNote
{
    public string Id { get; set; } = "";
    public string Text { get; set; } = "";
    public string? By { get; set; }
    public DateTime At { get; set; }
}

/// <summary>Kullanıcı tanımlı özel tabloların satırları (tablo id → satırlar).</summary>
public class CustomTableStore : JsonFileStore<Dictionary<string, List<CustomRow>>>
{
    private readonly ConfigStore _cfg;

    public CustomTableStore(StoragePaths p, ConfigStore cfg) : base(p.CustomTablesFile) { _cfg = cfg; }

    public static string? MatchColumn(CustomTableDef def, string? id) =>
        !string.IsNullOrEmpty(id) && def.Columns.Any(c => c.Id == id) ? id : def.KeyColumnId;

    public List<CustomRow> Rows(string tableId)
    {
        lock (Lock) return Data.TryGetValue(tableId, out var l) ? l.ToList() : new();
    }

    public Dictionary<string, int> Summary()
    {
        lock (Lock) return _cfg.Current.CustomTables.ToDictionary(t => t.Id, t => Data.TryGetValue(t.Id, out var l) ? l.Count : 0);
    }

    /// <summary>Eşleşme kolonundaki değerin (KeyOf) satırı.</summary>
    public Dictionary<string, CustomRow> ByKey(CustomTableDef def, string? matchColumnId)
    {
        var col = MatchColumn(def, matchColumnId) ?? def.Columns.FirstOrDefault()?.Id;
        var r = new Dictionary<string, CustomRow>();
        if (col == null) return r;
        foreach (var row in Rows(def.Id))
            if (row.Values.TryGetValue(col, out var v)) { var k = ValueUtil.KeyOf(v); if (k.Length > 0) r.TryAdd(k, row); }
        return r;
    }

    /// <summary>Eşleşme kolonundaki malzeme anahtarları (baştaki sıfırlar atılmış).</summary>
    public HashSet<string> Keys(CustomTableDef def, string? matchColumnId)
    {
        var col = MatchColumn(def, matchColumnId) ?? def.Columns.FirstOrDefault()?.Id;
        var set = new HashSet<string>();
        if (col == null) return set;
        foreach (var row in Rows(def.Id))
            if (row.Values.TryGetValue(col, out var v)) { var k = Endpoints.DekitEndpoints.MatKey(v); if (k.Length > 0) set.Add(k); }
        return set;
    }

    private static Dictionary<string, JsonElement> Clean(CustomTableDef def, Dictionary<string, JsonElement> values)
    {
        var ids = def.Columns.Select(c => c.Id).ToHashSet();
        return values.Where(kv => ids.Contains(kv.Key) && !ValueUtil.IsEmpty(kv.Value)).ToDictionary(kv => kv.Key, kv => kv.Value.Clone());
    }

    private void CheckRow(CustomTableDef def, Dictionary<string, JsonElement> values, string? exceptId)
    {
        foreach (var c in def.Columns.Where(c => c.Required))
            if (!values.TryGetValue(c.Id, out var v) || ValueUtil.IsEmpty(v)) throw new InvalidOperationException($"'{c.Name}' alanı zorunlu.");
        if (!string.IsNullOrEmpty(def.KeyColumnId) && values.TryGetValue(def.KeyColumnId, out var kv))
        {
            var k = ValueUtil.KeyOf(kv);
            if (Data.TryGetValue(def.Id, out var rows) && rows.Any(r => r.Id != exceptId && r.Values.TryGetValue(def.KeyColumnId, out var ov) && ValueUtil.KeyOf(ov) == k))
                throw new InvalidOperationException($"'{ValueUtil.ToText(kv)}' zaten kayıtlı.");
        }
    }

    public CustomRow Add(CustomTableDef def, Dictionary<string, JsonElement> values, string? user)
    {
        lock (Lock)
        {
            var clean = Clean(def, values);
            CheckRow(def, clean, null);
            var row = new CustomRow { Id = Guid.NewGuid().ToString("N")[..12], Values = clean, CreatedBy = user, CreatedAt = DateTime.Now };
            if (!Data.TryGetValue(def.Id, out var l)) Data[def.Id] = l = new();
            l.Add(row);
            Persist();
            return row;
        }
    }

    public CustomRow Update(CustomTableDef def, string rowId, Dictionary<string, JsonElement> values, string? user)
    {
        lock (Lock)
        {
            var row = Data.GetValueOrDefault(def.Id)?.FirstOrDefault(r => r.Id == rowId) ?? throw new KeyNotFoundException("Kayıt bulunamadı.");
            var clean = Clean(def, values);
            CheckRow(def, clean, rowId);
            row.Values = clean; row.UpdatedBy = user; row.UpdatedAt = DateTime.Now;
            Persist();
            return row;
        }
    }

    public int Delete(string tableId, IEnumerable<string> ids)
    {
        lock (Lock)
        {
            if (!Data.TryGetValue(tableId, out var l)) return 0;
            var set = ids.ToHashSet();
            var n = l.RemoveAll(r => set.Contains(r.Id));
            if (n > 0) Persist();
            return n;
        }
    }

    /// <summary>Toplu içe aktarma. Anahtar kolon varsa ve update=true ise mevcut kayıt güncellenir.</summary>
    public (int added, int updated, int skipped, List<string> errors) Import(CustomTableDef def, List<Dictionary<string, JsonElement>> rows, bool update, string? user)
    {
        lock (Lock)
        {
            int added = 0, updated = 0, skipped = 0; var errors = new List<string>();
            if (!Data.TryGetValue(def.Id, out var list)) Data[def.Id] = list = new();
            var key = def.KeyColumnId;
            var index = new Dictionary<string, CustomRow>();
            if (!string.IsNullOrEmpty(key))
                foreach (var r in list) if (r.Values.TryGetValue(key, out var v)) index.TryAdd(ValueUtil.KeyOf(v), r);
            var n = 0;
            foreach (var raw in rows)
            {
                n++;
                var vals = Clean(def, raw);
                var missing = def.Columns.FirstOrDefault(c => c.Required && !vals.ContainsKey(c.Id));
                if (missing != null) { skipped++; if (errors.Count < 20) errors.Add($"Satır {n}: '{missing.Name}' boş."); continue; }
                if (!string.IsNullOrEmpty(key))
                {
                    if (!vals.TryGetValue(key, out var kv)) { skipped++; continue; }
                    var k = ValueUtil.KeyOf(kv);
                    if (index.TryGetValue(k, out var ex))
                    {
                        if (!update) { skipped++; continue; }
                        ex.Values = vals; ex.UpdatedBy = user; ex.UpdatedAt = DateTime.Now; updated++;
                        continue;
                    }
                    var nr = new CustomRow { Id = Guid.NewGuid().ToString("N")[..12], Values = vals, CreatedBy = user, CreatedAt = DateTime.Now };
                    list.Add(nr); index[k] = nr; added++;
                }
                else
                {
                    list.Add(new CustomRow { Id = Guid.NewGuid().ToString("N")[..12], Values = vals, CreatedBy = user, CreatedAt = DateTime.Now });
                    added++;
                }
            }
            Persist();
            return (added, updated, skipped, errors);
        }
    }
}

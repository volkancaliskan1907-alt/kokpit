using System.Text.Json;
using MeosKokpit.Api.Models;

namespace MeosKokpit.Api.Services;

/// <summary>
/// KITT sayfasındaki sanal kolon değerlerini saklar.
/// Yapı: satırAnahtarı -> kolonId -> değer
/// </summary>
public class KittStore
{
    private readonly StoragePaths _paths;
    private readonly object _lock = new();
    private Dictionary<string, Dictionary<string, KittCell>> _data;

    public KittStore(StoragePaths paths)
    {
        _paths = paths;
        _data = File.Exists(paths.KittFile)
            ? JsonSerializer.Deserialize<Dictionary<string, Dictionary<string, KittCell>>>(File.ReadAllText(paths.KittFile), JsonDefaults.File) ?? new()
            : new();
    }

    public Dictionary<string, Dictionary<string, KittCell>> GetMany(IEnumerable<string> rowKeys)
    {
        lock (_lock)
        {
            var result = new Dictionary<string, Dictionary<string, KittCell>>();
            foreach (var k in rowKeys)
                if (_data.TryGetValue(k, out var cells)) result[k] = new Dictionary<string, KittCell>(cells);
            return result;
        }
    }

    /// <summary>Verilen sütunda verilen metin değerine sahip satır anahtarları (anahtar öneki ile).</summary>
    public List<string> KeysWithValue(string prefix, string columnId, string text)
    {
        lock (_lock)
            return _data.Where(x => x.Key.StartsWith(prefix) && x.Value.TryGetValue(columnId, out var c) && c.Value is { ValueKind: JsonValueKind.String } v
                && string.Equals(v.GetString()?.Trim(), text, StringComparison.CurrentCultureIgnoreCase)).Select(x => x.Key).ToList();
    }

    /// <summary>Bir siparişin (normalize anahtar) tüm KITT satır değerlerini siler.</summary>
    public int RemoveOrder(string orderKey)
    {
        lock (_lock)
        {
            var keys = _data.Keys.Where(k => k.StartsWith(orderKey + "|")).ToList();
            foreach (var k in keys) _data.Remove(k);
            if (keys.Count > 0) Persist();
            return keys.Count;
        }
    }

    public int RowCount { get { lock (_lock) return _data.Count; } }

    public IReadOnlyDictionary<string, Dictionary<string, KittCell>> Snapshot()
    {
        lock (_lock) return _data.ToDictionary(x => x.Key, x => new Dictionary<string, KittCell>(x.Value));
    }

    public void SetValues(IEnumerable<string> rowKeys, string columnId, JsonElement? value, string? user)
    {
        lock (_lock)
        {
            var now = DateTime.Now;
            var empty = value == null || ValueUtil.IsEmpty(value.Value);
            foreach (var key in rowKeys)
            {
                if (empty)
                {
                    if (_data.TryGetValue(key, out var c)) { c.Remove(columnId); if (c.Count == 0) _data.Remove(key); }
                    continue;
                }
                if (!_data.TryGetValue(key, out var cells)) _data[key] = cells = new();
                cells[columnId] = new KittCell { Value = value!.Value.Clone(), By = user, At = now };
            }
            Persist();
        }
    }

    public List<KittNote> AddNote(string rowKey, string columnId, string text, string? user)
    {
        lock (_lock)
        {
            var notes = ReadNotes(rowKey, columnId);
            notes.Add(new KittNote { Id = Guid.NewGuid().ToString("N")[..10], Text = text.Trim(), By = user, At = DateTime.Now });
            WriteNotes(rowKey, columnId, notes, user);
            return notes;
        }
    }

    public List<KittNote> DeleteNote(string rowKey, string columnId, string noteId, string? user)
    {
        lock (_lock)
        {
            var notes = ReadNotes(rowKey, columnId);
            notes.RemoveAll(n => n.Id == noteId);
            WriteNotes(rowKey, columnId, notes, user);
            return notes;
        }
    }

    private List<KittNote> ReadNotes(string rowKey, string columnId)
    {
        if (_data.TryGetValue(rowKey, out var cells) && cells.TryGetValue(columnId, out var cell)
            && cell.Value is { ValueKind: JsonValueKind.Array } arr)
            return arr.Deserialize<List<KittNote>>(JsonDefaults.File) ?? new();
        return new();
    }

    private void WriteNotes(string rowKey, string columnId, List<KittNote> notes, string? user)
    {
        if (notes.Count == 0)
        {
            if (_data.TryGetValue(rowKey, out var c)) { c.Remove(columnId); if (c.Count == 0) _data.Remove(rowKey); }
        }
        else
        {
            if (!_data.TryGetValue(rowKey, out var cells)) _data[rowKey] = cells = new();
            cells[columnId] = new KittCell { Value = JsonSerializer.SerializeToElement(notes, JsonDefaults.File), By = user, At = DateTime.Now };
        }
        Persist();
    }

    private void Persist() =>
        JsonDefaults.WriteAtomic(_paths.KittFile, JsonSerializer.Serialize(_data, JsonDefaults.File));
}

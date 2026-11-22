using System.Text.Json;
using MeosKokpit.Api.Models;

namespace MeosKokpit.Api.Services;

/// <summary>Tek bir JSON dosyasında tutulan, kilitli ve atomik kaydedilen basit depo.</summary>
public class JsonFileStore<T> where T : class, new()
{
    private readonly string _file;
    protected readonly object Lock = new();
    protected T Data;

    public JsonFileStore(string file)
    {
        _file = file;
        Data = File.Exists(file) ? JsonSerializer.Deserialize<T>(File.ReadAllText(file), JsonDefaults.File) ?? new() : new();
    }

    protected void Persist() => JsonDefaults.WriteAtomic(_file, JsonSerializer.Serialize(Data, JsonDefaults.File));
}

public class PickInfo
{
    public DateTime At { get; set; }
    public string? By { get; set; }
    /// <summary>scan | manual</summary>
    public string Method { get; set; } = "manual";
}

/// <summary>KITT toplama penceresindeki "alındı" işaretleri (anahtar: sipariş|malzeme|sıra).</summary>
public class KittPickStore : JsonFileStore<Dictionary<string, PickInfo>>
{
    public KittPickStore(StoragePaths p) : base(Path.Combine(p.DataDirectory, "kitt-picks.json")) { }

    public Dictionary<string, PickInfo> Get(IEnumerable<string> keys)
    {
        lock (Lock)
        {
            var r = new Dictionary<string, PickInfo>();
            foreach (var k in keys) if (Data.TryGetValue(k, out var v)) r[k] = v;
            return r;
        }
    }

    /// <summary>Anahtarı verilen önekle başlayan işaretleri siler.</summary>
    public int RemoveByPrefix(string prefix)
    {
        lock (Lock)
        {
            var keys = Data.Keys.Where(k => k.StartsWith(prefix, StringComparison.OrdinalIgnoreCase)).ToList();
            foreach (var k in keys) Data.Remove(k);
            if (keys.Count > 0) Persist();
            return keys.Count;
        }
    }

    public Dictionary<string, PickInfo> Snapshot()
    {
        lock (Lock) return new Dictionary<string, PickInfo>(Data);
    }

    public Dictionary<string, PickInfo> Set(IEnumerable<string> keys, bool picked, string method, string? user)
    {
        lock (Lock)
        {
            var now = DateTime.Now;
            var list = keys.ToList();
            foreach (var k in list)
            {
                if (!picked) Data.Remove(k);
                else Data[k] = new PickInfo { At = now, By = user, Method = method };
            }
            Persist();
            return Get(list);
        }
    }
}

public class CustomRow
{
    public string Id { get; set; } = "";
    public Dictionary<string, JsonElement> Values { get; set; } = new();
    public string? CreatedBy { get; set; }
    public DateTime CreatedAt { get; set; }
    public string? UpdatedBy { get; set; }
    public DateTime? UpdatedAt { get; set; }
}


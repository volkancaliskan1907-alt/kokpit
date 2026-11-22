using System.Text.Json;

namespace MeosKokpit.Api.Services;

/// <summary>
/// Kullanıcı bazlı arayüz tercihleri (seçili siparişler, kolon sırası/genişliği, filtre görünürlüğü...).
/// Tarayıcıya değil sunucuya kaydedilir; farklı tarayıcı / adres / bilgisayarda aynı kullanıcı aynı düzeni görür.
/// </summary>
public class UserPrefsStore : JsonFileStore<Dictionary<string, Dictionary<string, JsonElement>>>
{
    public UserPrefsStore(StoragePaths p) : base(Path.Combine(p.DataDirectory, "user-prefs.json")) { }

    public Dictionary<string, JsonElement> Get(string user)
    {
        lock (Lock) return Data.TryGetValue(user, out var d) ? new(d) : new();
    }

    /// <summary>Tüm kullanıcıların aynı anahtardaki metin listelerinin birleşimi.</summary>
    public List<string> AllLists(string key)
    {
        lock (Lock)
            return Data.Values.Where(d => d.TryGetValue(key, out var el) && el.ValueKind == JsonValueKind.Array)
                .SelectMany(d => d[key].EnumerateArray()).Where(x => x.ValueKind == JsonValueKind.String)
                .Select(x => x.GetString()!.Trim()).Where(x => x.Length > 0).Distinct(StringComparer.OrdinalIgnoreCase).ToList();
    }

    public void Set(string user, string key, JsonElement value)
    {
        lock (Lock)
        {
            if (!Data.TryGetValue(user, out var d)) Data[user] = d = new();
            if (value.ValueKind is JsonValueKind.Null or JsonValueKind.Undefined) d.Remove(key);
            else d[key] = value.Clone();
            Persist();
        }
    }
}

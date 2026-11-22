using System.Globalization;
using System.Text.Encodings.Web;
using System.Text.Json;
using System.Text.Json.Serialization;
using System.Text.Unicode;
using MeosKokpit.Api.Models;

namespace MeosKokpit.Api.Services;

public static class JsonDefaults
{
    public static readonly JsonSerializerOptions File = new(JsonSerializerDefaults.Web)
    {
        WriteIndented = true,
        Encoder = JavaScriptEncoder.Create(UnicodeRanges.All),
        DefaultIgnoreCondition = JsonIgnoreCondition.Never,
        PropertyNameCaseInsensitive = true,
    };

    public static void WriteAtomic(string path, string content)
    {
        var dir = Path.GetDirectoryName(path);
        if (!string.IsNullOrEmpty(dir)) Directory.CreateDirectory(dir);
        var tmp = path + ".tmp";
        System.IO.File.WriteAllText(tmp, content, new System.Text.UTF8Encoding(false));
        System.IO.File.Move(tmp, path, true);
    }
}

/// <summary>Uygulama klasörleri (App_Data, örnek veriler).</summary>
public class StoragePaths
{
    public string DataDirectory { get; }
    public string SampleDirectory { get; }
    public string ConfigFile => Path.Combine(DataDirectory, "config.json");
    public string KittFile => Path.Combine(DataDirectory, "kitt-values.json");
    public string CustomTablesFile => Path.Combine(DataDirectory, "custom-tables.json");

    public StoragePaths(IHostEnvironment env)
    {
        DataDirectory = Path.Combine(env.ContentRootPath, "App_Data");
        SampleDirectory = Path.Combine(DataDirectory, "SampleData");
        Directory.CreateDirectory(DataDirectory);
    }
}

public static class ValueUtil
{
    public static readonly CultureInfo Tr = new("tr-TR");

    public static bool IsEmpty(object? v) => v switch
    {
        null => true,
        string s => s.Trim().Length == 0,
        JsonElement je => je.ValueKind switch
        {
            JsonValueKind.Null or JsonValueKind.Undefined => true,
            JsonValueKind.String => je.GetString()?.Trim().Length == 0,
            JsonValueKind.Array => je.GetArrayLength() == 0,
            _ => false
        },
        System.Collections.ICollection c => c.Count == 0,
        _ => false
    };

    public static object? FromJson(JsonElement e) => e.ValueKind switch
    {
        JsonValueKind.Null or JsonValueKind.Undefined => null,
        JsonValueKind.String => e.GetString(),
        JsonValueKind.Number => e.GetDouble(),
        JsonValueKind.True => true,
        JsonValueKind.False => false,
        _ => e.Clone()
    };

    public static string ToText(object? v)
    {
        switch (v)
        {
            case null: return "";
            case string s: return s;
            case double d: return NumText(d);
            case float f: return NumText(f);
            case decimal m: return NumText((double)m);
            case DateTime dt: return dt.TimeOfDay == TimeSpan.Zero ? dt.ToString("yyyy-MM-dd") : dt.ToString("yyyy-MM-dd HH:mm:ss");
            case bool b: return b ? "Evet" : "Hayır";
            case JsonElement je:
                return je.ValueKind switch
                {
                    JsonValueKind.Null or JsonValueKind.Undefined => "",
                    JsonValueKind.String => je.GetString() ?? "",
                    JsonValueKind.Number => NumText(je.GetDouble()),
                    JsonValueKind.True => "Evet",
                    JsonValueKind.False => "Hayır",
                    JsonValueKind.Array => string.Join(", ", je.EnumerateArray().Select(x => ToText(x))),
                    _ => je.GetRawText()
                };
            case System.Collections.IEnumerable en:
                return string.Join(", ", en.Cast<object?>().Select(ToText));
            default: return Convert.ToString(v, CultureInfo.InvariantCulture) ?? "";
        }
    }

    private static string NumText(double d) =>
        Math.Abs(d - Math.Round(d)) < 1e-9 && Math.Abs(d) < 1e15 ? Math.Round(d).ToString("0", CultureInfo.InvariantCulture)
                                                                    : d.ToString("0.##########", CultureInfo.InvariantCulture);

    /// <summary>Eşleştirme anahtarı: kırpılmış, büyük harfli metin.</summary>
    public static string KeyOf(object? v) => ToText(v).Trim().ToUpperInvariant();

    public static bool ValuesEqual(string? a, string? b) =>
        string.Equals(a?.Trim(), b?.Trim(), StringComparison.CurrentCultureIgnoreCase);

    public static double? ToNumber(object? v)
    {
        switch (v)
        {
            case null: return null;
            case double d: return d;
            case int i: return i;
            case long l: return l;
            case decimal m: return (double)m;
            case float f: return f;
            case bool: return null;
            case JsonElement je when je.ValueKind == JsonValueKind.Number: return je.GetDouble();
        }
        var s = ToText(v).Trim();
        if (s.Length == 0) return null;
        if (double.TryParse(s, NumberStyles.Float, CultureInfo.InvariantCulture, out var r)) return r;
        if (double.TryParse(s, NumberStyles.Float, Tr, out r)) return r;
        return null;
    }

    public static DateTime? ToDate(object? v)
    {
        if (v is DateTime d) return d;
        var s = ToText(v).Trim();
        if (s.Length == 0) return null;
        if (DateTime.TryParse(s, CultureInfo.InvariantCulture, DateTimeStyles.None, out var r)) return r;
        if (DateTime.TryParse(s, Tr, DateTimeStyles.None, out r)) return r;
        return null;
    }

    public static int Compare(object? a, object? b)
    {
        if (IsEmpty(a) && IsEmpty(b)) return 0;
        if (IsEmpty(a)) return -1;
        if (IsEmpty(b)) return 1;
        if (a is DateTime da && b is DateTime db) return da.CompareTo(db);
        var na = ToNumber(a); var nb = ToNumber(b);
        if (na != null && nb != null && a is not string && b is not string) return na.Value.CompareTo(nb.Value);
        if (na != null && nb != null) return na.Value.CompareTo(nb.Value);
        var dta = ToDate(a); var dtb = ToDate(b);
        if (dta != null && dtb != null && a is DateTime or DateTime) return dta.Value.CompareTo(dtb.Value);
        return string.Compare(ToText(a), ToText(b), Tr, CompareOptions.IgnoreCase);
    }

    /// <summary>Filtre / biçim kuralı değerlendirmesi.</summary>
    public static bool Evaluate(object? v, string op, string? a, string? b = null)
    {
        var text = ToText(v);
        switch (op)
        {
            case "empty": return IsEmpty(v);
            case "notEmpty": return !IsEmpty(v);
            case "contains": return text.Contains(a ?? "", StringComparison.CurrentCultureIgnoreCase);
            case "notContains": return !text.Contains(a ?? "", StringComparison.CurrentCultureIgnoreCase);
            case "startsWith": return text.StartsWith(a ?? "", StringComparison.CurrentCultureIgnoreCase);
            case "endsWith": return text.EndsWith(a ?? "", StringComparison.CurrentCultureIgnoreCase);
            case "in": return (a ?? "").Split(';', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries).Any(x => KeyOf(x) == KeyOf(v));
            case "between": return Compare(v, a) >= 0 && Compare(v, b) <= 0;
            case "eq":
            {
                var n1 = ToNumber(v); var n2 = ToNumber(a);
                if (n1 != null && n2 != null) return Math.Abs(n1.Value - n2.Value) < 1e-9;
                return KeyOf(v) == KeyOf(a);
            }
            case "neq": return !Evaluate(v, "eq", a, b);
            case "gt": return Compare(v, a) > 0;
            case "gte": return Compare(v, a) >= 0;
            case "lt": return Compare(v, a) < 0;
            case "lte": return Compare(v, a) <= 0;
            default: return false;
        }
    }
}

/// <summary>ayarlar (config.json) deposu. Her kayıtta sürüm artar.</summary>
public class ConfigStore
{
    private readonly StoragePaths _paths;
    private readonly object _lock = new();
    private AppConfig _cfg;

    public ConfigStore(StoragePaths paths)
    {
        _paths = paths;
        _cfg = File.Exists(paths.ConfigFile)
            ? JsonSerializer.Deserialize<AppConfig>(File.ReadAllText(paths.ConfigFile), JsonDefaults.File) ?? new()
            : new();
    }

    public bool Exists => File.Exists(_paths.ConfigFile);
    public AppConfig Current { get { lock (_lock) return _cfg; } }

    public void Save(AppConfig cfg)
    {
        lock (_lock)
        {
            cfg.Revision = Math.Max(cfg.Revision, _cfg.Revision) + 1;
            _cfg = cfg;
            JsonDefaults.WriteAtomic(_paths.ConfigFile, JsonSerializer.Serialize(cfg, JsonDefaults.File));
        }
    }

    public void Update(Action<AppConfig> change)
    {
        lock (_lock)
        {
            var copy = JsonSerializer.Deserialize<AppConfig>(JsonSerializer.Serialize(_cfg, JsonDefaults.File), JsonDefaults.File)!;
            change(copy);
            Save(copy);
        }
    }
}

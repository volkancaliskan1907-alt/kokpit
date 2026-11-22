using System.Globalization;
using System.Text;
using ExcelDataReader;
using MeosKokpit.Api.Models;

namespace MeosKokpit.Api.Services;

public class SourceFileInfo
{
    public string Path { get; set; } = "";
    public string Name { get; set; } = "";
    public DateTime LastWriteTime { get; set; }
    public long Size { get; set; }
}

public class SheetData
{
    public List<string> Columns { get; set; } = new();
    public List<Dictionary<string, object?>> Rows { get; set; } = new();
}

public class SourceResult
{
    public List<string> Columns { get; set; } = new();
    public List<string> ComputedColumns { get; set; } = new();
    public List<Dictionary<string, object?>> Rows { get; set; } = new();
    public List<SourceFileInfo> Files { get; set; } = new();
    public List<string> Warnings { get; set; } = new();
    public DateTime LoadedAt { get; set; } = DateTime.Now;
}

public class SourceTestResult
{
    public bool Ok { get; set; }
    public string? Error { get; set; }
    public List<SourceFileInfo> Files { get; set; } = new();
    public List<string> Sheets { get; set; } = new();
    public List<string> Columns { get; set; } = new();
    public List<Dictionary<string, object?>> SampleRows { get; set; } = new();
    public int RowCount { get; set; }
}

/// <summary>Excel (xlsx/xls/xlsm) ve CSV dosyalarını okur.</summary>
public class ExcelReaderService
{
    static ExcelReaderService() => Encoding.RegisterProvider(CodePagesEncodingProvider.Instance);

    public List<SourceFileInfo> ResolveFiles(DataSourceDef def)
    {
        var path = (def.Path ?? "").Trim().Trim('"');
        if (path.Length == 0) throw new InvalidOperationException("Dosya veya dizin yolu boş.");
        if (File.Exists(path)) return new() { Info(new FileInfo(path)) };
        if (!Directory.Exists(path)) throw new FileNotFoundException($"Yol bulunamadı: {path}");

        var patterns = (string.IsNullOrWhiteSpace(def.FilePattern) ? "*.xlsx;*.xls;*.xlsm;*.csv" : def.FilePattern)
            .Split(';', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
        var opt = def.IncludeSubfolders ? SearchOption.AllDirectories : SearchOption.TopDirectoryOnly;
        return patterns.SelectMany(p => new DirectoryInfo(path).EnumerateFiles(p, opt))
            .Where(f => !f.Name.StartsWith("~$"))
            .GroupBy(f => f.FullName, StringComparer.OrdinalIgnoreCase).Select(g => g.First())
            .OrderByDescending(f => f.LastWriteTime).Select(Info).ToList();
    }

    private static SourceFileInfo Info(FileInfo f) => new() { Path = f.FullName, Name = f.Name, LastWriteTime = f.LastWriteTime, Size = f.Length };

    private static IExcelDataReader Open(string path, out MemoryStream ms)
    {
        ms = new MemoryStream();
        using (var fs = new FileStream(path, FileMode.Open, FileAccess.Read, FileShare.ReadWrite | FileShare.Delete))
            fs.CopyTo(ms);
        ms.Position = 0;
        return path.EndsWith(".csv", StringComparison.OrdinalIgnoreCase)
            ? ExcelReaderFactory.CreateCsvReader(ms)
            : ExcelReaderFactory.CreateReader(ms);
    }

    public List<string> GetSheetNames(string path)
    {
        if (path.EndsWith(".csv", StringComparison.OrdinalIgnoreCase)) return new() { "CSV" };
        using var r = Open(path, out var ms);
        using (ms)
        {
            var names = new List<string>();
            do names.Add(r.Name); while (r.NextResult());
            return names;
        }
    }

    public SheetData Read(string path, string? sheet, int headerRow)
    {
        using var r = Open(path, out var ms);
        using (ms)
        {
            if (!string.IsNullOrWhiteSpace(sheet) && !path.EndsWith(".csv", StringComparison.OrdinalIgnoreCase))
            {
                while (!string.Equals(r.Name, sheet, StringComparison.CurrentCultureIgnoreCase))
                    if (!r.NextResult()) throw new InvalidOperationException($"'{sheet}' sayfası bulunamadı ({Path.GetFileName(path)}).");
            }

            var data = new SheetData();
            var hdr = Math.Max(1, headerRow);
            for (var i = 1; i < hdr; i++) if (!r.Read()) return data;
            if (!r.Read()) return data;

            var cols = new List<string>();
            var seen = new Dictionary<string, int>(StringComparer.CurrentCultureIgnoreCase);
            for (var c = 0; c < r.FieldCount; c++)
            {
                var name = ValueUtil.ToText(r.GetValue(c)).Trim();
                if (name.Length == 0) name = $"Kolon {c + 1}";
                if (seen.TryGetValue(name, out var n)) { seen[name] = n + 1; name = $"{name} ({n + 1})"; }
                else seen[name] = 1;
                cols.Add(name);
            }
            data.Columns = cols;

            while (r.Read())
            {
                var row = new Dictionary<string, object?>(cols.Count);
                var any = false;
                for (var c = 0; c < cols.Count && c < r.FieldCount; c++)
                {
                    var v = r.GetValue(c);
                    if (v is string s) { s = s.Trim(); v = s.Length == 0 ? null : s; }
                    if (v != null) any = true;
                    row[cols[c]] = v;
                }
                if (any) data.Rows.Add(row);
            }
            return data;
        }
    }
}

/// <summary>Veri kaynaklarını okur, birleştirir, hesaplanmış kolonları ekler ve önbelleğe alır.</summary>
public class DataEngine
{
    private readonly ConfigStore _store;
    private readonly ExcelReaderService _reader;
    private readonly object _lock = new();
    private readonly Dictionary<string, (string stamp, long rev, DateTime checkedAt, SourceResult res)> _cache = new();
    [ThreadStatic] private static HashSet<string>? _stack;

    public DataEngine(ConfigStore store, ExcelReaderService reader) { _store = store; _reader = reader; }

    public void InvalidateAll() { lock (_lock) _cache.Clear(); }

    public SourceResult Get(string id)
    {
        var cfg = _store.Current;
        var def = cfg.DataSources.FirstOrDefault(d => d.Id == id) ?? throw new KeyNotFoundException($"Veri kaynağı bulunamadı: {id}");
        var minGap = TimeSpan.FromSeconds(Math.Max(1, cfg.General.RefreshSeconds));

        lock (_lock)
        {
            if (_cache.TryGetValue(id, out var c) && c.rev == cfg.Revision && DateTime.Now - c.checkedAt < minGap) return c.res;
        }

        var files = _reader.ResolveFiles(def);
        if (files.Count == 0) throw new InvalidOperationException($"'{def.Name}' için dosya bulunamadı.");
        var used = def.Mode == "merge" ? files : files.Take(1).ToList();
        var stamp = string.Join("|", used.Select(f => $"{f.Path}:{f.LastWriteTime.Ticks}:{f.Size}"));

        lock (_lock)
        {
            if (_cache.TryGetValue(id, out var c) && c.rev == cfg.Revision && c.stamp == stamp)
            {
                _cache[id] = (c.stamp, c.rev, DateTime.Now, c.res);
                return c.res;
            }
        }

        _stack ??= new();
        if (!_stack.Add(id)) throw new InvalidOperationException($"'{def.Name}' kaynağında döngüsel hesaplanmış kolon başvurusu var.");
        try
        {
            var res = Build(def, used, files);
            lock (_lock) _cache[id] = (stamp, cfg.Revision, DateTime.Now, res);
            return res;
        }
        finally { _stack.Remove(id); }
    }

    private SourceResult Build(DataSourceDef def, List<SourceFileInfo> used, List<SourceFileInfo> all)
    {
        var res = new SourceResult { Files = used };
        var cols = new List<string>();
        foreach (var f in used)
        {
            SheetData sd;
            try { sd = _reader.Read(f.Path, def.SheetName, def.HeaderRow); }
            catch (Exception ex) { res.Warnings.Add($"{f.Name} okunamadı: {ex.Message}"); continue; }
            foreach (var c in sd.Columns) if (!cols.Contains(c)) cols.Add(c);
            foreach (var row in sd.Rows)
            {
                if (def.AddFileNameColumn) row["Kaynak Dosya"] = f.Name;
                res.Rows.Add(row);
            }
        }
        if (res.Rows.Count == 0 && used.Count > 0 && res.Warnings.Count == used.Count)
            throw new InvalidOperationException(res.Warnings[0]);
        if (def.AddFileNameColumn && !cols.Contains("Kaynak Dosya")) cols.Add("Kaynak Dosya");
        res.Columns = cols;

        foreach (var cc in def.ComputedColumns)
        {
            try { ApplyComputed(def, cc, res); }
            catch (Exception ex)
            {
                res.Warnings.Add($"'{cc.Name}' hesaplanamadı: {ex.Message}");
                foreach (var r in res.Rows) r[cc.Name] = null;
            }
            if (!res.Columns.Contains(cc.Name)) res.Columns.Add(cc.Name);
            res.ComputedColumns.Add(cc.Name);
        }
        res.LoadedAt = DateTime.Now;
        return res;
    }

    private void ApplyComputed(DataSourceDef def, ComputedColumnDef cc, SourceResult res)
    {
        if (cc.Type == "formula")
        {
            var expr = Formula.Parse(cc.Formula ?? "");
            foreach (var r in res.Rows)
            {
                try { r[cc.Name] = expr.Eval(col => r.GetValueOrDefault(col)); }
                catch { r[cc.Name] = null; }
            }
            return;
        }

        var targetId = string.IsNullOrEmpty(cc.TargetSourceId) ? def.Id : cc.TargetSourceId;
        List<Dictionary<string, object?>> trows;
        if (targetId == def.Id) trows = res.Rows.Select(r => new Dictionary<string, object?>(r)).ToList(); // kendi (hesaplanmadan önceki) verisi
        else trows = Get(targetId).Rows;

        var filters = cc.TargetFilters.Where(f => !string.IsNullOrWhiteSpace(f.Column)).ToList();
        string KeyT(Dictionary<string, object?> r) => string.Join("\u0001", cc.Keys.Select(k => ValueUtil.KeyOf(r.GetValueOrDefault(k.TargetColumn))));
        var index = new Dictionary<string, List<object?>>();
        var valueCol = cc.TargetValueColumn ?? "";
        foreach (var t in trows)
        {
            if (filters.Count > 0 && !filters.All(f => ValueUtil.Evaluate(t.GetValueOrDefault(f.Column), f.Operator, f.Value, f.Value2))) continue;
            var key = cc.Keys.Count == 0 ? "" : KeyT(t);
            if (!index.TryGetValue(key, out var list)) index[key] = list = new();
            list.Add(valueCol.Length > 0 ? t.GetValueOrDefault(valueCol) : null);
        }

        foreach (var r in res.Rows)
        {
            var key = cc.Keys.Count == 0 ? "" : string.Join("\u0001", cc.Keys.Select(k => ValueUtil.KeyOf(r.GetValueOrDefault(k.LocalColumn))));
            index.TryGetValue(key, out var vals);
            vals ??= new();
            object? v;
            switch (cc.Type)
            {
                case "lookup": v = vals.FirstOrDefault(x => !ValueUtil.IsEmpty(x)); break;
                case "lookupLast": v = vals.LastOrDefault(x => !ValueUtil.IsEmpty(x)); break;
                case "join": v = vals.Count == 0 ? null : string.Join(", ", vals.Where(x => !ValueUtil.IsEmpty(x)).Select(ValueUtil.ToText).Distinct()); break;
                case "countif": v = (double)vals.Count; break;
                case "sumif": v = vals.Sum(x => ValueUtil.ToNumber(x) ?? 0); break;
                case "avgif": { var n = vals.Select(ValueUtil.ToNumber).Where(x => x != null).Select(x => x!.Value).ToList(); v = n.Count == 0 ? null : n.Average(); break; }
                case "minif": v = vals.Where(x => !ValueUtil.IsEmpty(x)).OrderBy(x => x, Comparer<object?>.Create(ValueUtil.Compare)).FirstOrDefault(); break;
                case "maxif": v = vals.Where(x => !ValueUtil.IsEmpty(x)).OrderByDescending(x => x, Comparer<object?>.Create(ValueUtil.Compare)).FirstOrDefault(); break;
                default: throw new InvalidOperationException($"Bilinmeyen kolon tipi: {cc.Type}");
            }
            if (ValueUtil.IsEmpty(v) && !string.IsNullOrEmpty(cc.DefaultValue))
                v = ValueUtil.ToNumber(cc.DefaultValue) is { } dn ? dn : cc.DefaultValue;
            r[cc.Name] = v;
        }
    }
}

/// <summary>Excel benzeri (Türkçe/İngilizce fonksiyon adlı, ; ayraçlı) basit formül değerlendirici.</summary>
public static class Formula
{
    public interface INode { object? Eval(Func<string, object?> get); }

    private sealed class Lit(object? v) : INode { public object? Eval(Func<string, object?> g) => v; }
    private sealed class Ref(string c) : INode { public object? Eval(Func<string, object?> g) => g(c); }
    private sealed class Neg(INode a) : INode { public object? Eval(Func<string, object?> g) => -(ValueUtil.ToNumber(a.Eval(g)) ?? 0); }
    private sealed class Bin(string op, INode a, INode b) : INode
    {
        public object? Eval(Func<string, object?> g)
        {
            var x = a.Eval(g); var y = b.Eval(g);
            switch (op)
            {
                case "&": return ValueUtil.ToText(x) + ValueUtil.ToText(y);
                case "+": return (ValueUtil.ToNumber(x) ?? 0) + (ValueUtil.ToNumber(y) ?? 0);
                case "-": return (ValueUtil.ToNumber(x) ?? 0) - (ValueUtil.ToNumber(y) ?? 0);
                case "*": return (ValueUtil.ToNumber(x) ?? 0) * (ValueUtil.ToNumber(y) ?? 0);
                case "/": { var d = ValueUtil.ToNumber(y) ?? 0; return d == 0 ? null : (ValueUtil.ToNumber(x) ?? 0) / d; }
                case "^": return Math.Pow(ValueUtil.ToNumber(x) ?? 0, ValueUtil.ToNumber(y) ?? 0);
            }
            var nx = ValueUtil.ToNumber(x); var ny = ValueUtil.ToNumber(y);
            int cmp;
            if (nx != null && ny != null && x is not string) cmp = nx.Value.CompareTo(ny.Value);
            else if (x is null && y is not string && ny != null) cmp = 0.CompareTo(ny.Value);
            else if (y is null && nx != null && x is not string) cmp = nx.Value.CompareTo(0);
            else cmp = string.Compare(ValueUtil.ToText(x), ValueUtil.ToText(y), ValueUtil.Tr, CompareOptions.IgnoreCase);
            return op switch { "=" => cmp == 0, "<>" => cmp != 0, "<" => cmp < 0, ">" => cmp > 0, "<=" => cmp <= 0, ">=" => cmp >= 0, _ => null };
        }
    }
    private sealed class Call(string name, List<INode> args) : INode
    {
        private static bool Truth(object? v) => v switch { bool b => b, null => false, string s => s.Length > 0, _ => (ValueUtil.ToNumber(v) ?? 0) != 0 };
        private IEnumerable<object?> Flat(Func<string, object?> g) => args.Select(a => a.Eval(g));
        private IEnumerable<double> Nums(Func<string, object?> g) => Flat(g).Select(ValueUtil.ToNumber).Where(x => x != null).Select(x => x!.Value);

        public object? Eval(Func<string, object?> g)
        {
            switch (name)
            {
                case "EĞER": case "EGER": case "IF":
                    return Truth(args[0].Eval(g)) ? args[1].Eval(g) : args.Count > 2 ? args[2].Eval(g) : false;
                case "EĞERHATA": case "EGERHATA": case "IFERROR":
                    try { var v = args[0].Eval(g); return v ?? args[1].Eval(g); } catch { return args[1].Eval(g); }
                case "VE": case "AND": return args.All(a => Truth(a.Eval(g)));
                case "VEYA": case "YADA": case "OR": return args.Any(a => Truth(a.Eval(g)));
                case "DEĞİL": case "DEGIL": case "NOT": return !Truth(args[0].Eval(g));
                case "TOPLA": case "SUM": return Nums(g).Sum();
                case "MİN": case "MIN": { var n = Nums(g).ToList(); return n.Count == 0 ? 0 : n.Min(); }
                case "MAK": case "MAX": { var n = Nums(g).ToList(); return n.Count == 0 ? 0 : n.Max(); }
                case "ORTALAMA": case "AVERAGE": { var n = Nums(g).ToList(); return n.Count == 0 ? null : n.Average(); }
                case "YUVARLA": case "ROUND": return Math.Round(ValueUtil.ToNumber(args[0].Eval(g)) ?? 0, (int)(args.Count > 1 ? ValueUtil.ToNumber(args[1].Eval(g)) ?? 0 : 0), MidpointRounding.AwayFromZero);
                case "MUTLAK": case "ABS": return Math.Abs(ValueUtil.ToNumber(args[0].Eval(g)) ?? 0);
                case "TAMSAYI": case "INT": return Math.Floor(ValueUtil.ToNumber(args[0].Eval(g)) ?? 0);
                case "EBOŞSA": case "EBOSSA": case "BOSMU": case "ISBLANK": return ValueUtil.IsEmpty(args[0].Eval(g));
                case "UZUNLUK": case "LEN": return (double)ValueUtil.ToText(args[0].Eval(g)).Length;
                case "SOLDAN": case "LEFT": { var s = ValueUtil.ToText(args[0].Eval(g)); var n = (int)(args.Count > 1 ? ValueUtil.ToNumber(args[1].Eval(g)) ?? 1 : 1); return s[..Math.Clamp(n, 0, s.Length)]; }
                case "SAĞDAN": case "SAGDAN": case "RIGHT": { var s = ValueUtil.ToText(args[0].Eval(g)); var n = Math.Clamp((int)(args.Count > 1 ? ValueUtil.ToNumber(args[1].Eval(g)) ?? 1 : 1), 0, s.Length); return s[(s.Length - n)..]; }
                case "PARÇAAL": case "PARCAAL": case "MID": { var s = ValueUtil.ToText(args[0].Eval(g)); var st = Math.Clamp((int)(ValueUtil.ToNumber(args[1].Eval(g)) ?? 1) - 1, 0, s.Length); var n = Math.Clamp((int)(ValueUtil.ToNumber(args[2].Eval(g)) ?? 0), 0, s.Length - st); return s.Substring(st, n); }
                case "BİRLEŞTİR": case "BIRLESTIR": case "CONCAT": case "CONCATENATE": return string.Concat(Flat(g).Select(ValueUtil.ToText));
                case "KIRP": case "TRIM": return ValueUtil.ToText(args[0].Eval(g)).Trim();
                case "BÜYÜKHARF": case "BUYUKHARF": case "UPPER": return ValueUtil.ToText(args[0].Eval(g)).ToUpper(ValueUtil.Tr);
                case "KÜÇÜKHARF": case "KUCUKHARF": case "LOWER": return ValueUtil.ToText(args[0].Eval(g)).ToLower(ValueUtil.Tr);
                case "BUGÜN": case "BUGUN": case "TODAY": return DateTime.Today;
                case "SAYI": case "VALUE": return ValueUtil.ToNumber(args[0].Eval(g));
                case "METNE": case "TEXT": return ValueUtil.ToText(args[0].Eval(g));
                default: throw new InvalidOperationException($"Bilinmeyen fonksiyon: {name}");
            }
        }
    }

    private sealed class Parser
    {
        private readonly string _s; private int _i;
        public Parser(string s) { _s = s; }
        private void Ws() { while (_i < _s.Length && char.IsWhiteSpace(_s[_i])) _i++; }
        private bool Eat(string t) { Ws(); if (string.CompareOrdinal(_s, _i, t, 0, t.Length) == 0) { _i += t.Length; return true; } return false; }

        public INode ParseAll()
        {
            if (_s.TrimStart().StartsWith('=')) { Ws(); _i++; }
            var n = Cmp(); Ws();
            if (_i < _s.Length) throw new FormatException($"Formülde beklenmeyen karakter: '{_s[_i]}'");
            return n;
        }
        private INode Cmp()
        {
            var a = Concat();
            while (true)
            {
                string? op = null;
                foreach (var o in new[] { "<>", "<=", ">=", "=", "<", ">" }) if (Eat(o)) { op = o; break; }
                if (op == null) return a;
                a = new Bin(op, a, Concat());
            }
        }
        private INode Concat() { var a = Add(); while (Eat("&")) a = new Bin("&", a, Add()); return a; }
        private INode Add()
        {
            var a = Mul();
            while (true) { if (Eat("+")) a = new Bin("+", a, Mul()); else if (Eat("-")) a = new Bin("-", a, Mul()); else return a; }
        }
        private INode Mul()
        {
            var a = Pow();
            while (true) { if (Eat("*")) a = new Bin("*", a, Pow()); else if (Eat("/")) a = new Bin("/", a, Pow()); else return a; }
        }
        private INode Pow() { var a = Unary(); while (Eat("^")) a = new Bin("^", a, Unary()); return a; }
        private INode Unary() { if (Eat("-")) return new Neg(Unary()); if (Eat("+")) return Unary(); return Atom(); }
        private INode Atom()
        {
            Ws();
            if (_i >= _s.Length) throw new FormatException("Formül beklenmedik şekilde bitti.");
            var ch = _s[_i];
            if (ch == '(') { _i++; var n = Cmp(); if (!Eat(")")) throw new FormatException("')' eksik."); return n; }
            if (ch == '"')
            {
                _i++; var sb = new StringBuilder();
                while (_i < _s.Length) { if (_s[_i] == '"') { if (_i + 1 < _s.Length && _s[_i + 1] == '"') { sb.Append('"'); _i += 2; continue; } break; } sb.Append(_s[_i++]); }
                if (_i >= _s.Length) throw new FormatException("Metin kapatılmamış.");
                _i++; return new Lit(sb.ToString());
            }
            if (ch == '[')
            {
                var end = _s.IndexOf(']', _i);
                if (end < 0) throw new FormatException("']' eksik.");
                var name = _s[(_i + 1)..end]; _i = end + 1; return new Ref(name);
            }
            if (char.IsDigit(ch) || ch == '.')
            {
                var st = _i; while (_i < _s.Length && (char.IsDigit(_s[_i]) || _s[_i] == '.' || _s[_i] == ',')) _i++;
                return new Lit(double.Parse(_s[st.._i].Replace(',', '.'), CultureInfo.InvariantCulture));
            }
            if (char.IsLetter(ch) || ch == '_')
            {
                var st = _i; while (_i < _s.Length && (char.IsLetterOrDigit(_s[_i]) || _s[_i] == '_' || _s[_i] == '.')) _i++;
                var name = _s[st.._i].ToUpperInvariant().Replace('İ', 'I').Replace('Ğ', 'G').Replace('Ü', 'U').Replace('Ş', 'S').Replace('Ö', 'O').Replace('Ç', 'C');
                Ws();
                if (name == "DOGRU" || name == "TRUE") return new Lit(true);
                if (name == "YANLIS" || name == "FALSE") return new Lit(false);
                if (!Eat("(")) throw new FormatException($"'{name}' bir fonksiyon değil.");
                var args = new List<INode>();
                Ws();
                if (!Eat(")"))
                {
                    do { args.Add(Cmp()); } while (Eat(";") || Eat(","));
                    if (!Eat(")")) throw new FormatException("')' eksik.");
                }
                return new Call(name, args);
            }
            throw new FormatException($"Formülde beklenmeyen karakter: '{ch}'");
        }
    }

    public static INode Parse(string formula) => new Parser(formula).ParseAll();
}

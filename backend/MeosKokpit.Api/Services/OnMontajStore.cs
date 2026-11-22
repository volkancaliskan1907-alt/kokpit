namespace MeosKokpit.Api.Services;

public class OnMontajState
{
    /// <summary>Tabloya eklenmiş siparişler (iş emirleri), ekleme sırasıyla.</summary>
    public List<string> Orders { get; set; } = new();
    /// <summary>Kullanıcının tablodan sildiği satırların anahtarları.</summary>
    public List<string> Deleted { get; set; } = new();
    /// <summary>Kullanıcının sürükleyerek belirlediği satır sırası (satır anahtarları).</summary>
    public List<string> Order { get; set; } = new();
    /// <summary>KITT hazırlama sayfasındaki siparişler (Ön Montaj'ta durum "Sıraya Alındı" olunca eklenir).</summary>
    public List<string> KitOrders { get; set; } = new();
    public bool KitSeeded { get; set; }
    /// <summary>KITT / DEKIT'ten elle silinen siparişler (Ön Montaj durumundan otomatik geri eklenmez).</summary>
    public List<string> KitRemoved { get; set; } = new();
}

public class OnMontajKeysRequest { public List<string> Keys { get; set; } = new(); }

/// <summary>Ön Montaj tablosunun kalıcı listesi: eklenen siparişler, silinen satırlar ve manuel sıra.</summary>
public class OnMontajStore : JsonFileStore<OnMontajState>
{
    public OnMontajStore(StoragePaths p) : base(Path.Combine(p.DataDirectory, "onmontaj-list.json")) { }

    public OnMontajState Snapshot()
    {
        lock (Lock) return new OnMontajState { Orders = Data.Orders.ToList(), Deleted = Data.Deleted.ToList(), Order = Data.Order.ToList(), KitOrders = Data.KitOrders.ToList() };
    }

    public int AddOrders(IEnumerable<string> orders)
    {
        lock (Lock)
        {
            var have = Data.Orders.Select(ValueUtil.KeyOf).ToHashSet();
            var added = 0;
            foreach (var o in orders.Select(x => x.Trim()).Where(x => x.Length > 0))
            {
                var k = ValueUtil.KeyOf(o);
                // Yeniden eklenen siparişin daha önce silinmiş satırları geri gelir
                Data.Deleted.RemoveAll(d => d.StartsWith("OM|" + k + "|"));
                if (have.Add(k)) { Data.Orders.Add(o); added++; }
            }
            Persist();
            return added;
        }
    }

    /// <summary>İlk kullanımda, eskiden KITT sayfasında elle seçilmiş siparişleri listeye taşır.</summary>
    public List<string> KitOrdersSeeded(Func<List<string>> legacy)
    {
        lock (Lock)
        {
            if (!Data.KitSeeded)
            {
                foreach (var o in legacy()) if (!Data.KitOrders.Contains(o, StringComparer.OrdinalIgnoreCase)) Data.KitOrders.Add(o);
                Data.KitSeeded = true;
                Persist();
            }
            return Data.KitOrders.ToList();
        }
    }

    /// <summary>Satır anahtarından (OM|sipariş|...) siparişi bulup KITT listesine ekler.</summary>
    /// <summary>Durumu "Sıraya Alındı" olan satırların siparişleri listede yoksa ekler (daha önce yapılmış seçimleri de yakalar).</summary>
    public List<string> KitOrdersWithQueued(IEnumerable<string> queuedRowKeys)
    {
        foreach (var k in queuedRowKeys) AddKitOrderByRowKey(k, force: false);
        lock (Lock) return Data.KitOrders.ToList();
    }

    public bool AddKitOrderByRowKey(string rowKey, bool force = true)
    {
        lock (Lock)
        {
            var parts = rowKey.Split('|');
            if (parts.Length < 2) return false;
            var order = Data.Orders.FirstOrDefault(o => ValueUtil.KeyOf(o) == parts[1]) ?? parts[1];
            var removed = Data.KitRemoved.RemoveAll(x => ValueUtil.KeyOf(x) == parts[1]) > 0;
            if (!force && removed) { Data.KitRemoved.Add(order); return false; }
            if (Data.KitOrders.Contains(order, StringComparer.OrdinalIgnoreCase)) return false;
            Data.KitOrders.Add(order);
            Persist();
            return true;
        }
    }

    /// <summary>Siparişi KITT listesinden çıkarır ve otomatik geri eklenmesini engeller.</summary>
    public void RemoveKitOrder(string order)
    {
        lock (Lock)
        {
            var k = ValueUtil.KeyOf(order);
            Data.KitOrders.RemoveAll(o => ValueUtil.KeyOf(o) == k);
            if (!Data.KitRemoved.Any(o => ValueUtil.KeyOf(o) == k)) Data.KitRemoved.Add(order);
            Persist();
        }
    }

    public void DeleteRows(IEnumerable<string> keys)
    {
        lock (Lock)
        {
            foreach (var k in keys) if (!Data.Deleted.Contains(k)) Data.Deleted.Add(k);
            Persist();
        }
    }

    public void SetOrder(IEnumerable<string> keys)
    {
        lock (Lock) { Data.Order = keys.Distinct().ToList(); Persist(); }
    }
}

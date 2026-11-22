using ClosedXML.Excel;
using MeosKokpit.Api.Models;

namespace MeosKokpit.Api.Services;

/// <summary>İlk çalıştırmada örnek Excel dosyaları ve örnek ayarları oluşturur.</summary>
public static class SampleData
{
    public static void EnsureCreated(ConfigStore store, StoragePaths paths)
    {
        if (store.Exists) return;

        var dir = paths.SampleDirectory;
        var woDir = Path.Combine(dir, "IsEmirleri");
        var poDir = Path.Combine(dir, "Satinalma");
        Directory.CreateDirectory(woDir);
        Directory.CreateDirectory(poDir);

        var rnd = new Random(42);
        var materials = new (string stok, string ad, string birim)[]
        {
            ("100-0001", "SMD Direnç 10K 0603", "ADET"), ("100-0002", "SMD Direnç 4K7 0603", "ADET"),
            ("110-0010", "SMD Kondansatör 100nF 0402", "ADET"), ("110-0011", "Tantal Kondansatör 10uF", "ADET"),
            ("120-0100", "Mikrodenetleyici STM32F407", "ADET"), ("120-0101", "FPGA Artix-7 XC7A35T", "ADET"),
            ("130-0200", "DC/DC Dönüştürücü 28V-5V", "ADET"), ("140-0300", "MIL Konnektör D38999", "ADET"),
            ("150-0400", "PCB Ana Kart Rev.C", "ADET"), ("160-0500", "Kablo Demeti KD-12", "ADET"),
            ("170-0600", "Alüminyum Kasa AK-3", "ADET"), ("180-0700", "Termal Pad 1mm", "M2"),
            ("190-0800", "Lehim Pastası SAC305", "KG"), ("100-0003", "SMD Direnç 0R 0805", "ADET")
        };
        var orders = new[] { "SP-2026-1001", "SP-2026-1002", "SP-2026-1003", "SP-2026-1004", "SP-2026-1005" };
        var products = new[] { "Görev Bilgisayarı GB-200", "Güç Kaynağı GK-28", "Haberleşme Ünitesi HU-5", "Kontrol Paneli KP-3", "Sensör Arayüz Kartı SK-1" };

        // İş emirleri: iki dosya (birleştirme modunu göstermek için)
        for (var f = 0; f < 2; f++)
        {
            using var wb = new XLWorkbook();
            var ws = wb.AddWorksheet("IsEmirleri");
            var headers = new[] { "Sipariş No", "Ürün", "İş Emri No", "Stok No", "Malzeme", "İhtiyaç Miktarı", "Birim", "Termin Tarihi", "Hat" };
            for (var c = 0; c < headers.Length; c++) ws.Cell(1, c + 1).Value = headers[c];
            var r = 2;
            for (var o = f * 3; o < Math.Min(orders.Length, f * 3 + 3); o++)
            {
                var wo = $"IE-{26000 + o * 10}";
                var pick = materials.OrderBy(_ => rnd.Next()).Take(rnd.Next(7, 12)).ToList();
                foreach (var m in pick)
                {
                    ws.Cell(r, 1).Value = orders[o];
                    ws.Cell(r, 2).Value = products[o];
                    ws.Cell(r, 3).Value = wo;
                    ws.Cell(r, 4).Value = m.stok;
                    ws.Cell(r, 5).Value = m.ad;
                    ws.Cell(r, 6).Value = m.birim == "ADET" ? rnd.Next(1, 40) * 10 : Math.Round(rnd.NextDouble() * 5 + 0.5, 2);
                    ws.Cell(r, 7).Value = m.birim;
                    ws.Cell(r, 8).Value = DateTime.Today.AddDays(rnd.Next(5, 60));
                    ws.Cell(r, 9).Value = $"SMT-{rnd.Next(1, 4)}";
                    r++;
                }
            }
            ws.Columns().AdjustToContents();
            wb.SaveAs(Path.Combine(woDir, $"IsEmriListesi_{f + 1}.xlsx"));
        }

        // Depo stok listesi
        using (var wb = new XLWorkbook())
        {
            var ws = wb.AddWorksheet("Stok");
            var headers = new[] { "Malzeme No", "Malzeme Tanımı", "Depo", "Serbest Stok", "Rezerve" };
            for (var c = 0; c < headers.Length; c++) ws.Cell(1, c + 1).Value = headers[c];
            var r = 2;
            foreach (var m in materials)
            {
                foreach (var depo in new[] { "D100-Ana Depo", "D200-Üretim Ara Depo" })
                {
                    if (rnd.NextDouble() < 0.25) continue;
                    ws.Cell(r, 1).Value = m.stok;
                    ws.Cell(r, 2).Value = m.ad;
                    ws.Cell(r, 3).Value = depo;
                    ws.Cell(r, 4).Value = m.birim == "ADET" ? rnd.Next(0, 300) : Math.Round(rnd.NextDouble() * 6, 2);
                    ws.Cell(r, 5).Value = rnd.Next(0, 20);
                    r++;
                }
            }
            ws.Columns().AdjustToContents();
            wb.SaveAs(Path.Combine(dir, "DepoStok.xlsx"));
        }

        // Açık satınalma siparişleri
        using (var wb = new XLWorkbook())
        {
            var ws = wb.AddWorksheet("AcikSiparisler");
            var headers = new[] { "Satınalma No", "Malzeme No", "Tedarikçi", "Açık Miktar", "Teslim Tarihi", "Durum" };
            for (var c = 0; c < headers.Length; c++) ws.Cell(1, c + 1).Value = headers[c];
            var r = 2;
            var suppliers = new[] { "Arrow Elektronik", "Mouser", "Yerli Tedarikçi A.Ş.", "Digi-Key" };
            foreach (var m in materials.Where(_ => rnd.NextDouble() < 0.7))
            {
                for (var k = 0; k < rnd.Next(1, 3); k++)
                {
                    ws.Cell(r, 1).Value = $"SA-{45000 + r}";
                    ws.Cell(r, 2).Value = m.stok;
                    ws.Cell(r, 3).Value = suppliers[rnd.Next(suppliers.Length)];
                    ws.Cell(r, 4).Value = rnd.Next(1, 30) * 10;
                    ws.Cell(r, 5).Value = DateTime.Today.AddDays(rnd.Next(3, 45));
                    ws.Cell(r, 6).Value = rnd.NextDouble() < 0.8 ? "Açık" : "İptal";
                    r++;
                }
            }
            ws.Columns().AdjustToContents();
            wb.SaveAs(Path.Combine(poDir, "AcikSatinalma.xlsx"));
        }

        // Örnek ayarlar
        var cfg = new AppConfig();
        cfg.DataSources.Add(new DataSourceDef
        {
            Id = "stok", Name = "Depo Stok Listesi", Description = "Depo bazında serbest stok",
            Path = Path.Combine(dir, "DepoStok.xlsx"), Mode = "latest"
        });
        cfg.DataSources.Add(new DataSourceDef
        {
            Id = "satinalma", Name = "Açık Satınalma Siparişleri",
            Path = poDir, FilePattern = "*.xlsx", Mode = "latest"
        });
        cfg.DataSources.Add(new DataSourceDef
        {
            Id = "isemri", Name = "İş Emri Listesi", Description = "Dizindeki tüm iş emri dosyaları birleştirilir",
            Path = woDir, FilePattern = "*.xlsx;*.xls", Mode = "merge", AddFileNameColumn = true,
            ComputedColumns =
            {
                new ComputedColumnDef
                {
                    Id = "c1", Name = "Depo Stok", Type = "sumif", TargetSourceId = "stok",
                    Keys = { new KeyPair { LocalColumn = "Stok No", TargetColumn = "Malzeme No" } },
                    TargetValueColumn = "Serbest Stok"
                },
                new ComputedColumnDef
                {
                    Id = "c2", Name = "Açık Satınalma", Type = "sumif", TargetSourceId = "satinalma",
                    Keys = { new KeyPair { LocalColumn = "Stok No", TargetColumn = "Malzeme No" } },
                    TargetValueColumn = "Açık Miktar",
                    TargetFilters = { new FilterCondition { Column = "Durum", Operator = "eq", Value = "Açık" } }
                },
                new ComputedColumnDef
                {
                    Id = "c3", Name = "En Yakın Teslim", Type = "minif", TargetSourceId = "satinalma",
                    Keys = { new KeyPair { LocalColumn = "Stok No", TargetColumn = "Malzeme No" } },
                    TargetValueColumn = "Teslim Tarihi",
                    TargetFilters = { new FilterCondition { Column = "Durum", Operator = "eq", Value = "Açık" } }
                },
                new ComputedColumnDef
                {
                    Id = "c4", Name = "Toplam İhtiyaç (Tüm Siparişler)", Type = "sumif", TargetSourceId = "isemri",
                    Keys = { new KeyPair { LocalColumn = "Stok No", TargetColumn = "Stok No" } },
                    TargetValueColumn = "İhtiyaç Miktarı"
                },
                new ComputedColumnDef
                {
                    Id = "c5", Name = "Eksik Miktar", Type = "formula",
                    Formula = "EĞER([İhtiyaç Miktarı] > [Depo Stok]; [İhtiyaç Miktarı] - [Depo Stok]; 0)"
                },
                new ComputedColumnDef
                {
                    Id = "c6", Name = "Durum", Type = "formula",
                    Formula = "EĞER([Eksik Miktar] = 0; \"KARŞILANIYOR\"; EĞER([Depo Stok] + [Açık Satınalma] >= [İhtiyaç Miktarı]; \"SATINALMA BEKLENİYOR\"; \"EKSİK\"))"
                }
            }
        });

        cfg.OrderPage = new OrderPageConfig
        {
            SourceId = "isemri",
            OrderColumn = "Sipariş No",
            Orders = orders.ToList(),
            KeyColumns = new() { "İş Emri No" }
        };

        cfg.KittPage = new KittPageConfig
        {
            SourceId = "isemri",
            OrderColumn = "Sipariş No",
            KeyColumns = new() { "İş Emri No", "Stok No" },
            Columns =
            {
                new ColumnView { Field = "Sipariş No", Width = 130, Fixed = true },
                new ColumnView { Field = "İş Emri No", Width = 110 },
                new ColumnView { Field = "Stok No", Width = 110, Fixed = true },
                new ColumnView { Field = "Malzeme", Width = 220 },
                new ColumnView { Field = "İhtiyaç Miktarı", Format = "number", Decimals = 2, Width = 110 },
                new ColumnView { Field = "Depo Stok", Format = "number", Decimals = 2, Width = 100 },
                new ColumnView { Field = "Durum", Width = 170 }
            },
            VirtualColumns =
            {
                new VirtualColumnDef
                {
                    Id = "v_durum", Name = "Hazırlık Durumu", Type = "select", Width = 160,
                    Options = { "Beklemede", "Hazırlanıyor", "Hazırlandı", "Eksik", "Teslim Edildi" },
                    OptionColors = new() { ["Beklemede"] = "default", ["Hazırlanıyor"] = "processing", ["Hazırlandı"] = "success", ["Eksik"] = "error", ["Teslim Edildi"] = "purple" }
                },
                new VirtualColumnDef { Id = "v_miktar", Name = "Hazırlanan Miktar", Type = "number", Width = 120 },
                new VirtualColumnDef { Id = "v_depo", Name = "Alınacak Depo", Type = "select", Width = 180, OptionsSourceId = "stok", OptionsColumn = "Depo" },
                new VirtualColumnDef { Id = "v_tarih", Name = "Hazırlık Tarihi", Type = "date", Width = 140 },
                new VirtualColumnDef { Id = "v_etiket", Name = "Etiketler", Type = "multiselect", Width = 200, Options = { "Acil", "Muadil Kullanıldı", "Kalite Onayı Bekliyor", "Kısmi Teslim" } },
                new VirtualColumnDef { Id = "v_kontrol", Name = "Kontrol", Type = "checkbox", Width = 80 },
                new VirtualColumnDef { Id = "v_aciklama", Name = "Açıklama", Type = "textarea", Width = 220 },
                new VirtualColumnDef { Id = "v_notlar", Name = "Notlar", Type = "notes", Width = 110 }
            },
            FormatRules =
            {
                new FormatRule { Id = "k1", Name = "Hazırlandı", Column = "vc:v_durum", Operator = "eq", Value = "Hazırlandı", Target = "row", BackColor = "#f0f9eb" },
                new FormatRule { Id = "k2", Name = "Eksik", Column = "vc:v_durum", Operator = "eq", Value = "Eksik", Target = "row", BackColor = "#fdecea" },
                new FormatRule { Id = "k3", Name = "Miktar uyuşmazlığı", Column = "vc:v_miktar", Operator = "lt", CompareColumn = "İhtiyaç Miktarı", Target = "cell", BackColor = "#fff1b8", Bold = true }
            }
        };

        store.Save(cfg);
    }
}

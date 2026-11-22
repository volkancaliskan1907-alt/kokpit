using System.Text.Encodings.Web;
using System.Text.Unicode;
using MeosKokpit.Api.Endpoints;
using MeosKokpit.Api.Services;

// Yayınlanmış pakette (exe yanında wwwroot varsa) uygulama klasörü esas alınır; böylece kısayol, Görev Zamanlayıcı veya
// servis gibi farklı "başlangıç klasörü"nden çalıştırılsa da ayarlar (App_Data) ve arayüz doğru yerde aranır.
var published = Directory.Exists(Path.Combine(AppContext.BaseDirectory, "wwwroot"));
var builder = WebApplication.CreateBuilder(new WebApplicationOptions
{
    Args = args,
    ContentRootPath = published ? AppContext.BaseDirectory : null,
});

// Windows servisi olarak da çalıştırılabilir (sc create ... ile); konsolda normal çalışır.
builder.Host.UseWindowsService();

builder.Services.ConfigureHttpJsonOptions(o =>
{
    o.SerializerOptions.Encoder = JavaScriptEncoder.Create(UnicodeRanges.All);
});

builder.Services.AddSingleton<StoragePaths>();
builder.Services.AddSingleton<ConfigStore>();
builder.Services.AddSingleton<ExcelReaderService>();
builder.Services.AddSingleton<DataEngine>();
builder.Services.AddSingleton<KittStore>();
builder.Services.AddSingleton<KittPickStore>();
builder.Services.AddSingleton<CustomTableStore>();
builder.Services.AddSingleton<UserPrefsStore>();
builder.Services.AddSingleton<OnMontajStore>();

builder.Services.AddCors(o => o.AddDefaultPolicy(p => p
    .WithOrigins("http://localhost:5173")
    .AllowAnyHeader().AllowAnyMethod()));

var app = builder.Build();

// İlk çalıştırmada örnek veri ve ayarlar
if (app.Configuration.GetValue("Kokpit:SampleData", true))
    SampleData.EnsureCreated(app.Services.GetRequiredService<ConfigStore>(), app.Services.GetRequiredService<StoragePaths>());

app.UseCors();
app.UseDefaultFiles();
app.UseStaticFiles();

app.MapKokpitApi();
app.MapPickApi();
app.MapDekitApi();
app.MapOverviewApi();

// React (SPA) yönlendirmeleri
app.MapFallbackToFile("index.html");

try
{
    app.Run();
}
catch (IOException ex) when (ex.ToString().Contains("AddressInUse", StringComparison.OrdinalIgnoreCase))
{
    // Port başka bir program (çoğu zaman uygulamanın zaten çalışan bir kopyası) tarafından kullanılıyor
    var urls = builder.Configuration["Urls"] ?? "http://0.0.0.0:5080";
    Console.ForegroundColor = ConsoleColor.Yellow;
    Console.WriteLine();
    Console.WriteLine($"Uygulama başlatılamadı: {urls} adresi başka bir program tarafından kullanılıyor.");
    Console.WriteLine("Büyük olasılıkla MEOS Kokpit zaten çalışıyor; tarayıcıda şu adresi açmayı deneyin:  http://localhost:5080");
    Console.WriteLine();
    Console.WriteLine("Çözüm seçenekleri:");
    Console.WriteLine("  1) Çalışan diğer kopyayı kapatın (Görev Yöneticisi > MeosKokpit.Api), sonra tekrar başlatın.");
    Console.WriteLine("  2) Farklı bir portla başlatın:  MeosKokpit.Api.exe --urls http://0.0.0.0:5090");
    Console.WriteLine("     (kalıcı yapmak için appsettings.json içindeki \"Urls\" değerini değiştirin)");
    Console.WriteLine("  3) Portu kimin kullandığını görmek için:  netstat -ano | findstr :5080");
    Console.ResetColor();
    if (Environment.UserInteractive && !Console.IsInputRedirected)
    {
        Console.WriteLine();
        Console.Write("Kapatmak için bir tuşa basın...");
        Console.ReadKey(true);
    }
    Environment.Exit(1);
}

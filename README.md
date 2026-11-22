# MEOS Elektronik – Üretim Müdürlüğü Kokpiti

Excel dosyalarını (tek dosya veya dizin) veri kaynağı olarak okuyup sipariş analizi ve KITT hazırlığı yapan web uygulaması.

- **Backend:** ASP.NET Core (.NET 10), Minimal API. Excel okuma: ExcelDataReader (.xlsx/.xlsm/.xls/.xlsb/.csv). Excel'e aktarma: ClosedXML.
- **Frontend:** React 18, TypeScript, Vite, Ant Design 5 (Türkçe arayüz).
- **Depolama:** Veritabanı gerekmez. Ayarlar `App_Data/config.json`, KITT girişleri `App_Data/kitt-values.json` dosyalarında tutulur. Her kayıtta bir `.bak` yedeği oluşur.

## Çalıştırma

| Amaç | Komut |
|---|---|
| Uygulamayı aç | `baslat.bat` ile açılır: http://localhost:5080 |
| Geliştirme (anlık yenileme) | `gelistirme.bat` ile açılır: http://localhost:5173 |
| Sunucuya yayın | `yayinla.bat` çalıştırılır, oluşan `yayin\` klasörü sunucuya kopyalanır |

İlk açılışta `App_Data/OrnekVeri` altında örnek Excel dosyaları ve bunları kullanan örnek ayarlar oluşturulur. Kendi kaynaklarınızı ekledikten sonra örnek kaynakları silebilirsiniz.

Port `appsettings.json` içindeki `Urls` ile, veri klasörü `Kokpit:DataDirectory` ile değiştirilir.
Ağ paylaşımındaki (`\\sunucu\...`) dosyaları okuyabilmesi için uygulamayı çalıştıran hesabın o paylaşıma okuma yetkisi olmalıdır.

## Sunucuya (VDI) kurulum
1. Geliştirme bilgisayarında `yayinla.bat` çalıştırılır (Node.js ve .NET 10 SDK yalnızca burada gerekir). Çıkan `yayin` klasörü **.NET kurulumu gerektirmez** (self-contained, yaklaşık 120 MB).
2. `yayin` klasörü VDI'ya kopyalanır; `MeosKokpit.Api.exe` çalıştırılır; tarayıcıda `http://localhost:5080` açılır. Başka bilgisayarlardan erişim için `http://SUNUCU-ADI:5080` (gerekirse güvenlik duvarında 5080/TCP açılır).
3. **Ayarlar > Veri Kaynakları**'ndaki Excel yolları VDI'daki yollarla güncellenir. Paket temiz (boş) başlar; mevcut ayarları taşımak için geliştirme ortamındaki `App_Data\config.json` (ayarlar) ve istenirse `custom-tables.json`, `kitt-values.json`, `kitt-picks.json`, `user-prefs.json` (girilen veriler) VDI'daki `App_Data` klasörüne kopyalanır.
4. Çalışma verisi uygulama klasöründeki `App_Data` içindedir; kalıcı bir sürücüye almak için `appsettings.json` içindeki `Kokpit:DataDirectory` değiştirilir. Yedek = bu klasörün kopyası.
5. Sürekli çalışması için: Windows servisi (`sc create MeosKokpit binPath= "...\MeosKokpit.Api.exe" start= auto`) veya Görev Zamanlayıcı "oturum açıldığında". Ağ paylaşımındaki Excel'leri okuyacaksa uygulamanın çalıştığı hesabın o paylaşıma okuma yetkisi olmalıdır (servis varsayılan hesabı ağ paylaşımına erişemez; servisi bir kullanıcı hesabıyla çalıştırın).

## Özellikler

### Veri kaynakları (Ayarlar > Veri Kaynakları)
- Kaynak tek bir Excel dosyası veya bir dizin olabilir. Dizin seçildiğinde:
  - **En son değiştirilen dosya** kullanılabilir,
  - ya da **tüm dosyalar alt alta birleştirilebilir.** Bu durumda isteğe bağlı "Kaynak Dosya" kolonu eklenir.
- Okunacak sayfa (sheet), başlık satırı, dosya deseni ve alt dizinler ayarlanabilir.
- Bağlantı test edilebilir ve veri önizlenebilir.
- Dosya değiştiğinde otomatik olarak yeniden okunur. Açık (kilitli) Excel dosyaları da okunabilir.

### Hesaplanan kolonlar (kaynaklar arası bağlantı)
| Tip | Excel karşılığı |
|---|---|
| Değer getir (ilk / son eşleşen) | DÜŞEYARA |
| Eşleşenleri birleştir | METİNBİRLEŞTİR |
| Toplam / Adet / Ortalama / Min / Maks | ETOPLA, EĞERSAY, EĞERORTALAMA, ÇOKEĞERMİN, ÇOKEĞERMAK |
| Formül | `EĞER([İhtiyaç] > [Stok]; [İhtiyaç] - [Stok]; 0)` |

- Eşleşme kriterleri açılır listelerden seçilir. Birden fazla kriter eklenebilir (ÇOKETOPLA gibi çalışır).
- Hedef kaynakta ek filtre tanımlanabilir. Örneğin yalnızca `Durum = Açık` olan satırlar toplanabilir.
- Bir kaynak kendi üzerine de hesap yapabilir. Örneğin aynı stok numarasının tüm siparişlerdeki toplam ihtiyacı bulunabilir.
- Hesaplanan kolonlar sırayla işlenir; bir kolon kendinden önce hesaplananları kullanabilir. Döngüsel bağlantılar tespit edilir.

### Sipariş Analizi sayfası
- Kullanıcının seçebileceği siparişler ayarlarda tanımlanır. Liste boşsa kaynaktaki tüm siparişler listelenir.
- Kullanıcı bir veya birden fazla sipariş seçebilir.
- Gösterilecek kolonlar, sıraları, başlıkları, biçimleri, alt toplamları ve sabitlenecek kolonlar ayarlardan belirlenir.
- Tabloda Excel tarzı kolon filtreleri, sıralama, arama ve Excel'e aktarma bulunur.

### KITT Hazırlama sayfası
- Sipariş Analizi sayfasında tanımlı siparişlerden seçim yapılır.
- Sanal kolon tipleri:
  - Metin
  - Çok satırlı açıklama
  - Sayı
  - Tarih
  - Tekli seçim listesi
  - Çoklu seçim listesi
  - Onay kutusu
  - Not geçmişi: Bir satıra kullanıcı ve tarih damgalı birden fazla açıklama girilebilir.
- Seçim listelerinin seçenekleri sabit girilebilir veya bir veri kaynağı kolonundan alınabilir. Seçeneklere renk atanabilir.
- Girilen değerler **sipariş + anahtar kolonlar** (ör. İş Emri No + Stok No) ile saklanır. Excel dosyası yenilense veya satır sırası değişse de değerler doğru satırda kalır.
- Birden fazla satır seçilerek toplu değer atanabilir.
- İlerleme özeti gösterilir. Her girişte son güncelleyen kişi ve tarih kaydedilir.

### KITT Toplama penceresi
KITT tablosunda sipariş numarasına tıklanınca açılır. Ayarları **Ayarlar > KITT Hazırlama > 5. KITT Toplama Penceresi** bölümündedir.
- **Bileşenler:** COOIS bileşenleri, siparişle eşleşen satırlar ve ayarlarda seçilen kolonlarla listelenir.
- **Depo Adresleri:** LX02'den malzeme bazında adres, depo yeri ve miktar gösterilir. Hücrede en fazla 3 adres görünür, fazlası "+N devamını gör" ile açılır.
- **Barkod / karekod:** USB okuyucu klavye gibi çalışır; okutulan kod eşleşen satırları **Alındı** yapar ve satırı yeşile boyar. Tarih, saat ve okutan kişi kaydedilir.
  - Baştaki sıfırlar dikkate alınmaz.
  - Karekod içinde birden fazla alan varsa (ör. `LOT;MALZEME;MİKTAR`) içlerinden malzeme bulunur.
  - Eşleşme yoksa veya kalem zaten alınmışsa sesli ve renkli uyarı verilir.
- **Alındı tiki:** Okuyucu olmadan elle işaretleme yapılabilir.
- **İşlem Tipi:** Delik içi / Özel işlem seçilebilir. Seçilen malzeme bağlı özel tabloya **bir kez** yazılır; sonraki siparişlerde otomatik seçili gelir. Seçim kaldırılırsa onay sorulur ve malzeme tablodan çıkarılır.
- Kayıtlar `App_Data/kitt-picks.json` dosyasında tutulur.

### Özel Tablolar (sol menü)
Kanban Stok Listesi, Delik İçi Malzeme Listesi gibi kendi tablolarınızı oluşturabilirsiniz.
- Kolon tipleri: metin, uzun metin, sayı, tarih, seçim listesi, evet/hayır.
- Bir kolon **anahtar** seçilebilir; aynı anahtarla ikinci kayıt eklenemez.
- Kayıt eklenebilir, düzenlenebilir, silinebilir ve Excel'e aktarılabilir.
- Veriler `App_Data/custom-tables.json` dosyasında tutulur.

### Ana Sayfa (özet paneli)
Ana Sayfa, KITT Hazırlama ve DEKIT verilerini tek bakışta gösterir (yalnızca okur; kullanıcının KITT / DEKIT iş emri listelerini kendi tercihlerinden alır):
- Üst kutular: iş emri sayısı, toplama ilerlemesi (%), toplaması biten iş emri, DEKIT iş emri, DEKIT Gitsin / Kalsın / Harici sayıları, uyarı sayısı.
- İş emri durumları: hazırlık durumuna göre dağılım çubuğu ve her durumdaki iş emirleri (rengi KITT ayarındaki seçenek rengidir; durumu girilmemişler ayrı gösterilir).
- Toplama ilerlemesi: iş emri başına alınan / toplam kalem (kanban ve sayıma dahil olmayan işlem tipleri hariç).
- DEKIT özeti: her iş emrinin adresi, KITT durumu ve Kalsın / Gitsin / Harici dağılımı. KITT'te "DEKIT Geldi" olup DEKIT listesinde olmayan iş emirleri uyarı olarak çıkar.
- Son 14 gün toplama hareketi (okutma / elle), son hareketler, özel tablo kayıt sayıları ve veri kaynağı durumu.

### Ayar çakışma koruması
Ayarlar sayfası açıldıktan sonra başka bir yerden ayar değiştirildiyse, eski sayfadan yapılan kayıt reddedilir ve sayfayı yenilemeniz istenir. Böylece kimsenin değişikliği diğerinin üzerine yazılmaz.

### Kullanıcı tercihleri (sunucuda saklanır)
Seçili iş emirleri, kolon sırası / genişlikleri, filtre alanlarının görünürlüğü ve menü durumu **tarayıcıya değil sunucuya** (`App_Data/user-prefs.json`) kaydedilir.
Farklı tarayıcı, adres (`localhost:5173` / `:5080`) veya bilgisayarda aynı kullanıcı adıyla girildiğinde aynı düzen görülür. Tercihler kullanıcı adına göre ayrılır.
Eski sürümden tarayıcıda kalan kayıtlar ilk açılışta otomatik sunucuya taşınır.

### Tablolar
- Tüm tablolarda başlık sürüklenerek kolon yer değiştirir, başlığın sağ kenarı çekilerek genişlik ayarlanır ("Sütunları sıfırla" ile geri alınır).
- Tablonun üstündeki **Filtre** alanı sabittir; sağındaki dişli düğmesinden hangi filtrelerin görüneceği seçilir.

### Ayarlar sayfası
Solda kategorili menü, sağda yalnızca seçilen bölüm görünür: Genel · Veri · Sipariş Analizi · KITT Hazırlama (Tablo) · KITT Toplama Penceresi.
Kaydedilmemiş değişiklik olan bölümlerde menüde uyarı noktası çıkar; bölümler arası geçişte düzenlemeler kaybolmaz.

### Toplama penceresi: barkod, PAP Kontrol
- **Barkod / karekod:** Okutunca Enter'a basmak gerekmez; okuyucunun hızlı yazışı algılanınca kod otomatik işlenir (eşleşirse Alındı, eşleşmezse kırmızı uyarı). Elle yazılıyorsa tam eşleşme olunca birkaç saniye içinde veya Enter ile işlenir.
- **PAP Kontrol:** Pencerede malzemenin bir özel tabloda (ör. "PAP listesi") kayıtlı olup olmadığını **Var / Yok** olarak gösteren kolon. Ayarlar > KITT Toplama Penceresi > Etiket Kolonları bölümünden başka tablolar için de benzer kontrol kolonları eklenebilir.
- **Uzun içerik:** Hücreler sütun genişliğini aşmaz; taşan metin "…" olur ve üzerine gelince tam metin balonda görünür.

### Özel tablolara Excel'den yükleme
"Şablon İndir" ile hazır dosya alınabilir; ama kendi dosyanızı da yükleyebilirsiniz: dosyayı seçince hangi tablo kolonunun dosyadaki hangi kolondan (A, B, C...) dolacağını siz seçersiniz.
Başlık satırı numarası ayarlanabilir (0 = başlıksız). Tarih kolonları için "yükleme tarihi", metin kolonları için "yükleyen kullanıcı" otomatik değer olarak seçilebilir.

### DEKIT sayfası
Sol menüde KITT Hazırlama'nın altındadır. Ayarları **Ayarlar > DEKIT** bölümündedir.
- **İş emri formatı:** İş emrinden soldan (ve/veya sağdan) belirtilen sayıda karakter silinerek depo adresi elde edilir (ör. `225AF01KRT01` → soldan 3 → `AF01KRT01`). Ayarlarda deneme kutusuyla sonuç görülür.
- İş emirleri yazılır / yapıştırılır ve sayfada listelenir; her biri için adres, adreste bulunan malzeme sayısı ve **adresteki toplam miktar** görünür. İş emrine tıklayınca LX02'de o adreste duran malzemeler açılır (aynı malzemenin satırları birleşir, miktar toplanır).
- **Kart Depo Adresleri:** Her malzemenin LX02'de depo yeri `KART` olan adresleri (yalnızca adres, miktar yok; miktarı 0 olanlar hariç). İlk 3'ü görünür, fazlası "+N daha".
- **Kalsın / Gitsin:** DEKIT'e eklediğiniz iş emirleri dışındaki iş emirlerine bakılır: KITT Hazırlama'da eklenmiş ve hazırlık durumu **"DEKIT Geldi" olmayan** iş emirleri (Ayarlar'dan "KITT kaynağındaki tüm iş emirleri" de seçilebilir). Adresteki malzeme bu iş emirlerinden herhangi birinin COOIS listesinde geçiyorsa **Kalsın** (üzerine gelince hangi iş emri istiyor görünür), hiçbirinde geçmiyorsa kırmızı **Gitsin** yazılır.
- **Harici stoklar:** Gitsin çıkacak malzeme, Özel Tablolar'daki harici stok listesinde geçiyorsa **"Harici stoklarda geçiyor"** yazılır (ayarlanabilir).
- **Barkod okuyucu (DEKIT penceresi):** Gelen fiziksel malzemeyi okutunca (Enter gerekmez) ekranın ortasında büyük renkli sonuç çıkar: yeşil **KALSIN**, kırmızı **GİTSİN**, mavi **Harici stoklarda geçiyor**, sarı **TANINMIYOR**. Malzeme adres listesinde olmasa bile sistemde tanınıyorsa karar verilir. Sonuca göre ayrı sesler çalar. Okutulan malzemeler tabloda "Okutuldu ✓" olur, başlıkta "3 / 10 okutulan" görünür (iş emri bazında saklanır; "Sıfırla" ile temizlenir).
- "DEKIT Geldi olanları ekle" düğmesi, KITT'te bu durumda olan iş emirlerini listeye toplu ekler.

### Toplama ilerlemesi
İşlem tipi (Delik içi / Özel işlem...) seçilen malzemeler ilerleme sayımına (ör. 24 / 26) dahil edilmez; bu davranış her işlem tipi ve Kanban için Ayarlar > İşlem Tipi / Kanban bölümünden açılıp kapatılır.

### Koşullu biçimlendirme
- Kullanılabilecek koşullar: eşittir, büyüktür, arasında, içerir, boş, listede vb.
- Karşılaştırma sabit bir değerle veya başka bir kolonla yapılabilir.
- Tarihler için `BUGÜN`, `BUGÜN+14` gibi göreli değerler kullanılabilir.
- Biçim yalnızca hücreye, tüm satıra veya başka bir kolona uygulanabilir.
- Zemin rengi, yazı rengi ve kalın yazı ayarlanabilir. "Doğruysa dur" seçeneği vardır ve kural öncelik sırası değiştirilebilir.
- KITT sayfasında sanal kolonlar da kurallarda kullanılabilir.

## Klasör yapısı
```
backend/MeosKokpit.Api/
  Endpoints/ApiEndpoints.cs     REST API
  Services/DataEngine.cs        Kaynak yükleme, önbellek, DÜŞEYARA/ETOPLA motoru
  Services/FormulaEvaluator.cs  Formül motoru (Türkçe/İngilizce fonksiyon adları)
  Services/ExcelReaderService.cs
  Services/ConfigStore.cs, KittStore.cs, SampleData.cs
frontend/src/
  pages/ (HomePage, OrdersPage, KittPage, settings/...)
  components/DataTable.tsx      Ortak tablo (filtre, biçim, alt toplam, Excel'e aktar)
  lib/values.ts, rules.ts       Değer biçimleme ve koşullu biçim motoru
```

## Not
Kullanıcı kimliği şu an tarayıcıda girilen ad ile tutulur. Kurumsal ağda Windows kimlik doğrulaması (AD) istenirse backend'e `Negotiate` kimlik doğrulaması eklenebilir. Kullanıcı adı otomatik olarak `HttpContext.User`'dan alınacak şekilde hazırdır.
#   k o k p i t  
 
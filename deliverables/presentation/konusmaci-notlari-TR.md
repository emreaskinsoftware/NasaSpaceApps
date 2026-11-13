# ASTER — Konuşmacı notları

## ASTER_Urun_Sunumu_TR

### 1. Uzayda sağlık izleme — kanıt gözünüzün önünde.

ASTER, simülasyon öncelikli bir araştırma prototipidir; klinik olarak doğrulanmış ya da uçuşa hazır bir sistem değildir. Sunumdaki tüm ekranlar, tohumlanmış sentetik senaryoları çalıştıran gerçek uygulamadan alınmıştır. Temel soru: Ne değişti, ölçüm ne kadar güvenilir ve bir sonraki adımı hangi kanıt destekliyor?

### 2. Bir ölçüm farklı nedenlerle değişebilir

Tek bir mürettebat günü: rutin egzersiz sırasında yerel gaz ortamı değişir, ardından giysi gevşer. Her iz değişir — ama farklı nedenlerle. Mevcut sistemler bağlamı elbette dikkate alır; bizim iddiamız daha dardır: bu bağımlılıkları açık ve sınanabilir kılmak.

### 3. Var olanın üzerine inşa et

İlk akıllı giysi, ilk gaz monitörü ya da ilk sağlık paneli iddiamız yok. Solunum kapılaması önceki çalışmalarda mevcut (S06). Aday katkı: açıkça "kestirim vermeme" içeren yorumlama yöntemleri ve gizli gerçek + temel yöntemlerle değerlendirme akışı. Kaynaklar: S01–S06, S15–S16.

### 4. Üç araştırma sorusu, tek iş akışı

Üç ayrı hipotez tek bir gözlem ve olay hattını paylaşır. Bütünleştirme altyapıdır, yenilik kanıtı değildir: her yöntemin kendi karşılaştırma ölçütü ve sınırı vardır. Üründe evrensel bir "sağlık puanı" yoktur.

### 5. Gaz ölçümünü nefesle hizala

NASA'nın CO₂ risk kaydı kişisel ölçümleri solunan düzeylerden ayırır (S05). Kestirim, gecikmesi düzeltilmiş soluk alma penceresindeki zaman ağırlıklı derişimdir. Akış sinyali olmadan bu, solunan doz değildir. Solunum kapılaması yeni değildir (S06); sınadığımız şey örnekleme gecikmesine ve sensör yanıtına dayanıklılık ile dürüstçe kestirim vermemektir.

### 6. Değişimi yorumlamadan önce ölçüm bağlantısını denetle

Bilinen bir mekanik uyarım ile temas ölçümü, bir pencerenin yorumlanıp yorumlanamayacağına karar verir. Aktüatör yolu fizyolojik yoldan farklı olabilir; bu yüzden başarılı bir öz denetim fizyolojik kalibrasyon değildir. Yol uyumsuzluğu senaryosunda düzeltme reddedilir. Donanım düzeni simülasyonda modellenen bir konsepttir. Kaynaklar: S07–S09.

### 7. Benzeri benzerle karşılaştır

Prototip atrofi tanısı koymaz, egzersizin etkinliğini kanıtlamaz. Kişi içi sapmayı yalnızca eşleşen seanslar ve geçerli tekrarlar için gösterir; aksi hâlde "karşılaştırılamaz" der ve nedenini belirtir. Kaynaklar: S10–S14.

### 8. Tek olay, incelenebilir bir açıklama

Bu, birleşik senaryodaki temas olayının gerçek vaka görünümüdür. Kas yorumu geri çekilmişken, bağımsız olarak geçerli maruziyet olayı açık kalır. Yönlendirme, doğrulanmamış ve örnek niteliğinde bir iş akışı olarak etiketlenir.

### 9. Bağlantı yokken de vaka elinizin altında

Bağlantı, sanal saat üzerinde çalışan uygulama düzeyinde bir sakla-ilet modelidir ve hızlandırılmış gösterilir. S15 ve S16 bağlamı kurar; uygulama iddiası, ayrı gateway ve yer süreçleri arasındaki gerçek HTTP alışverişi dâhil kendi aktarım testlerimize dayanır.

### 10. Motora yanıtı vermeyen bir simülatör

Motor paketi yalnızca sözleşmeleri içe aktarır; bunu bir lint kuralı ve birim testi zorunlu kılar. Ayrılmış koşularda sensör dinamiği değişir; kestiricinin modellemediği ikinci bir yanıt katmanı da eklenir. Üç zorlu senaryo: yavaş gaz sensörü, kalibrasyon yolu uyumsuzluğu, yük uyumsuzluğu. Sentetik başarı klinik kanıt değildir.

### 11. Uygulamanın gösterdikleri

Her satır çalıştırılmış bir test ya da dondurulmuş değerlendirme raporudur. Olumsuz sonuçlar korunur: kazanç telafisi yol uyumsuzluğunda sistematik hata bırakır, eşli referans giderimi temas arızasında fayda sağlamadı ve yalnızca sıvı kayması bazı koşularda yanlış sapma olayı üretti.

### 12. Gerçek kullanım için tasarlandı

Çevrimdışı yeniden yükleme ağ kapalıyken doğrulandı. Otomatik erişilebilirlik denetimleri her iki temada tüm rotalarda geçiyor. Tüm entegrasyonlar yalnızca emülatörle doğrulanmıştır; hiçbiri donanımla doğrulanmamıştır, Bluetooth uygulanmamıştır.

### 13. Kanıtlanması gerekenler

Yazılım doğrulaması fizyolojik geçerleme değildir. Üç temel risk üç modüle karşılık gelir. Herhangi bir düzenleyici yol ya da geçerleme takvimi iddia etmiyoruz.

### 14. Uzayda sağlık izleme — kanıt gözünüzün önünde.

Çalışan prototipi değerlendirmeye davet ediyoruz: bir senaryo yükleyin, arıza enjekte edin, vakayı inceleyin, doğrulama raporunu okuyun. Herhangi bir ödül, davet ya da onay ima edilmemektedir.

### 15. Ek A — Veri ve mimari

Sözleşmeler her sınırda doğrulanan zod şemalarıdır. Aynı çalışma zamanı hem tarayıcı worker'ında hem yerel gateway'de çalışır. Simülasyon ve iletişim tek bir sanal saati paylaştığı için bir koşu, tanımı ve komut günlüğünden yeniden kurulabilir.

### 16. Ek B — Yöntem karşılaştırma ayrıntıları

Kapsama, hatayla birlikte okunmalıdır: kapı, veriyi reddederek doğru kalır. Telafi kapsamayı geri kazanır ama aktüatör ve fizyolojik yollar farklı ölçeklendiğinde yanlıdır; bu yüzden yalnızca deneysel olarak gösterilir.

### 17. Ek C — Kaynaklar ve iddialar

Tam liste: docs/CLAIM_LEDGER.md. Sınırlarıyla birlikte S01–S20 kaynakları Kanıt Kütüphanesi'nde yer alır. Tüm ekran görüntüleri varlık bildiriminde listelenen derlemeden alınmıştır. NASA materyali onay değil, atıf olarak anılır.

## ASTER_Kisa_Sunum_TR (yedi slaytlık kısa sunum: ana sunumun 1, 2, 4, birleşik 5–7, 8, birleşik 10–11 ve 14. slaytları)

### 1. Uzayda sağlık izleme — kanıt gözünüzün önünde.

ASTER, simülasyon öncelikli bir araştırma prototipidir; klinik olarak doğrulanmış ya da uçuşa hazır bir sistem değildir. Sunumdaki tüm ekranlar, tohumlanmış sentetik senaryoları çalıştıran gerçek uygulamadan alınmıştır. Temel soru: Ne değişti, ölçüm ne kadar güvenilir ve bir sonraki adımı hangi kanıt destekliyor?

### 2. Bir ölçüm farklı nedenlerle değişebilir

Tek bir mürettebat günü: rutin egzersiz sırasında yerel gaz ortamı değişir, ardından giysi gevşer. Her iz değişir — ama farklı nedenlerle. Mevcut sistemler bağlamı elbette dikkate alır; bizim iddiamız daha dardır: bu bağımlılıkları açık ve sınanabilir kılmak.

### 3. Üç araştırma sorusu, tek iş akışı

Üç ayrı hipotez tek bir gözlem ve olay hattını paylaşır. Bütünleştirme altyapıdır, yenilik kanıtı değildir: her yöntemin kendi karşılaştırma ölçütü ve sınırı vardır. Üründe evrensel bir "sağlık puanı" yoktur.

### 4. Üç modül, her biri belirtilmiş sınırıyla

Kısa sunumda 5–7. slaytları birleştiren modül slaytı. Prototip etiketi görünür kalır; sınırlar anlatımda belirtilir.

### 5. Tek olay, incelenebilir bir açıklama

Bu, birleşik senaryodaki temas olayının gerçek vaka görünümüdür. Kas yorumu geri çekilmişken, bağımsız olarak geçerli maruziyet olayı açık kalır. Yönlendirme, doğrulanmamış ve örnek niteliğinde bir iş akışı olarak etiketlenir.

### 6. Gizli gerçek, temel yöntemler ve sürümün gösterdikleri

Kısa sunumda 10–11. slaytları birleştiren kanıt slaytı.

### 7. Uzayda sağlık izleme — kanıt gözünüzün önünde.

Çalışan prototipi değerlendirmeye davet ediyoruz: bir senaryo yükleyin, arıza enjekte edin, vakayı inceleyin, doğrulama raporunu okuyun. Herhangi bir ödül, davet ya da onay ima edilmemektedir.


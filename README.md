# ChirpStack MQTT Forwarder

Bu proje, ChirpStack ağ geçidi verilerini bir MQTT broker'dan diğerine ileten basit bir Node.js uygulamasıdır. Özellikle MikroTik LR8 gibi LoRaWAN ağ geçitlerinden gelen verileri, kendi uzak MQTT sunucunuza iletmek için tasarlanmıştır.

## Özellikler

- Yerel MQTT broker'dan ChirpStack konularını dinler (`eu868/gateway/+/event/up`)
- Tüm mesajları, orijinal konu yapısını koruyarak uzak MQTT broker'a iletir
- Her iki broker'a da bağlantı kesintilerinde üstel geri çekilme ile yeniden bağlanır
- Bağlantı, abone olma, yayınlama ve hata olaylarını zaman damgalarıyla loglar

## Gereksinimler

- Node.js 18 veya üzeri
- MQTT broker (yerel ve uzak)

## Kurulum

### 1. Kaynak Koddan Kurulum

```bash
# Depoyu klonla
git clone https://github.com/gucluceyhan/chirpstack-mqtt-forwarder.git
cd chirpstack-mqtt-forwarder

# Bağımlılıkları yükle
npm install

# Çevre değişkenlerini ayarla
cp .env.example .env
# .env dosyasını düzenle
```

### 2. Docker ile Kurulum

```bash
# Docker imajını oluştur
docker build -t chirpstack-forwarder .

# Docker konteynerini çalıştır
docker run --env-file .env chirpstack-forwarder
```

## Yapılandırma

`.env` dosyasında aşağıdaki değişkenleri ayarlayın:

| Değişken | Açıklama | Örnek |
|----------|----------|-------|
| LOCAL_MQTT_URL | Yerel MQTT broker'ın URL'si | mqtt://localhost:1883 |
| LOCAL_MQTT_CLIENT_ID | Yerel bağlantı için istemci ID'si | chirpstack-forwarder-local |
| REMOTE_MQTT_URL | Uzak MQTT broker'ın URL'si | mqtt://your.server.com:1883 |
| REMOTE_MQTT_CLIENT_ID | Uzak bağlantı için istemci ID'si | chirpstack-forwarder-remote |
| REMOTE_MQTT_USERNAME | Uzak broker kullanıcı adı (opsiyonel) | kullanici |
| REMOTE_MQTT_PASSWORD | Uzak broker şifresi (opsiyonel) | sifre |
| REMOTE_TOPIC_PREFIX | Uzak broker için konu öneki | eu868/gateway |
| RECONNECT_INITIAL_DELAY_MS | İlk yeniden bağlanma gecikmesi (ms) | 1000 |
| RECONNECT_MAX_DELAY_MS | Maksimum yeniden bağlanma gecikmesi (ms) | 30000 |

## Başlatma

```bash
# Doğrudan çalıştırma
npm start

# PM2 ile servis olarak çalıştırma
pm2 start index.js --name chirpstack-forwarder
```

## Bağımlılıklar

- [mqtt](https://www.npmjs.com/package/mqtt): MQTT istemci kütüphanesi
- [dotenv](https://www.npmjs.com/package/dotenv): Çevre değişkenleri yönetimi

## Lisans

MIT
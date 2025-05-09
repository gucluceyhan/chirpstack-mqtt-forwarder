import mqtt from 'mqtt';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fs from 'fs';

// ESM ile __dirname eşdeğerini oluştur
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Yapılandırma dosyasını yükle
dotenv.config();

// Gerekli çevre değişkenlerini kontrol et
const requiredEnvVars = [
  'LOCAL_MQTT_URL',
  'LOCAL_MQTT_CLIENT_ID',
  'REMOTE_MQTT_URL',
  'REMOTE_MQTT_CLIENT_ID',
  'REMOTE_TOPIC_PREFIX',
  'RECONNECT_INITIAL_DELAY_MS',
  'RECONNECT_MAX_DELAY_MS'
];

// Eksik çevre değişkenleri varsa hata ver ve çık
for (const envVar of requiredEnvVars) {
  if (!process.env[envVar]) {
    console.error(`Hata: ${envVar} çevre değişkeni tanımlanmamış. Lütfen .env dosyasını kontrol edin.`);
    process.exit(1);
  }
}

// Yapılandırma değişkenlerini al
const config = {
  local: {
    url: process.env.LOCAL_MQTT_URL,
    clientId: process.env.LOCAL_MQTT_CLIENT_ID,
    topic: 'eu868/gateway/+/event/up'
  },
  remote: {
    url: process.env.REMOTE_MQTT_URL,
    clientId: process.env.REMOTE_MQTT_CLIENT_ID,
    username: process.env.REMOTE_MQTT_USERNAME || undefined,
    password: process.env.REMOTE_MQTT_PASSWORD || undefined,
    topicPrefix: process.env.REMOTE_TOPIC_PREFIX
  },
  reconnect: {
    initialDelay: parseInt(process.env.RECONNECT_INITIAL_DELAY_MS, 10),
    maxDelay: parseInt(process.env.RECONNECT_MAX_DELAY_MS, 10)
  }
};

// Loglama yardımcı fonksiyonu
function log(message) {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] ${message}`);
}

// Bağlantı geri çekilme (backoff) stratejisi
class BackoffStrategy {
  constructor(initialDelay, maxDelay) {
    this.initialDelay = initialDelay;
    this.maxDelay = maxDelay;
    this.attempt = 0;
  }

  nextDelay() {
    // Üstel geri çekilme hesapla (2^attempt * initialDelay)
    const delay = Math.min(
      this.initialDelay * Math.pow(2, this.attempt),
      this.maxDelay
    );
    this.attempt += 1;
    return delay;
  }

  reset() {
    this.attempt = 0;
  }
}

// MQTT istemcileri
let localClient = null;
let remoteClient = null;

// Geri çekilme stratejileri
const localBackoff = new BackoffStrategy(
  config.reconnect.initialDelay,
  config.reconnect.maxDelay
);
const remoteBackoff = new BackoffStrategy(
  config.reconnect.initialDelay,
  config.reconnect.maxDelay
);

// Yerel MQTT istemcisini bağla
function connectLocalClient() {
  log(`Yerel MQTT broker'a bağlanılıyor: ${config.local.url}`);
  
  localClient = mqtt.connect(config.local.url, {
    clientId: config.local.clientId,
    clean: true,
    reconnectPeriod: 0, // Otomatik yeniden bağlanma devre dışı (manuel yapacağız)
  });

  localClient.on('connect', () => {
    log('Yerel MQTT broker\'a bağlandı');
    localBackoff.reset();
    
    // Tüm ilgili konulara abone ol
    log(`Abone olunan konu: ${config.local.topic}`);
    localClient.subscribe(config.local.topic, (err) => {
      if (err) {
        log(`Abone olma hatası: ${err.message}`);
      }
    });
  });

  localClient.on('message', (topic, message) => {
    // Gelen mesajı uzak broker'a ilet
    forwardMessage(topic, message);
  });

  localClient.on('error', (err) => {
    log(`Yerel MQTT hatası: ${err.message}`);
  });

  localClient.on('close', () => {
    log('Yerel MQTT bağlantısı kapandı');
    scheduleLocalReconnect();
  });
}

// Uzak MQTT istemcisini bağla
function connectRemoteClient() {
  log(`Uzak MQTT broker'a bağlanılıyor: ${config.remote.url}`);
  
  const connectOptions = {
    clientId: config.remote.clientId,
    clean: true,
    reconnectPeriod: 0, // Otomatik yeniden bağlanma devre dışı (manuel yapacağız)
  };

  // Kullanıcı adı ve şifre varsa ekle
  if (config.remote.username) {
    connectOptions.username = config.remote.username;
  }
  
  if (config.remote.password) {
    connectOptions.password = config.remote.password;
  }

  remoteClient = mqtt.connect(config.remote.url, connectOptions);

  remoteClient.on('connect', () => {
    log('Uzak MQTT broker\'a bağlandı');
    remoteBackoff.reset();
  });

  remoteClient.on('error', (err) => {
    log(`Uzak MQTT hatası: ${err.message}`);
  });

  remoteClient.on('close', () => {
    log('Uzak MQTT bağlantısı kapandı');
    scheduleRemoteReconnect();
  });
}

// Mesajı uzak broker'a ilet
function forwardMessage(topic, message) {
  if (!remoteClient || !remoteClient.connected) {
    log('Uzak MQTT broker bağlı değil, mesaj iletilemedi');
    return;
  }

  // Konuyu yeniden düzenle (aynı konuyu kullan ama önek ekle)
  const remoteTopic = `${config.remote.topicPrefix}/${topic}`;
  
  // Mesajı uzak broker'a yayınla
  remoteClient.publish(remoteTopic, message, {}, (err) => {
    if (err) {
      log(`Mesaj yayınlama hatası: ${err.message}`);
    } else {
      log(`Mesaj iletildi: ${topic} -> ${remoteTopic}`);
    }
  });
}

// Yeniden bağlanma planlayıcıları
function scheduleLocalReconnect() {
  const delay = localBackoff.nextDelay();
  log(`Yerel MQTT broker'a ${delay}ms içinde yeniden bağlanılacak`);
  
  setTimeout(() => {
    connectLocalClient();
  }, delay);
}

function scheduleRemoteReconnect() {
  const delay = remoteBackoff.nextDelay();
  log(`Uzak MQTT broker'a ${delay}ms içinde yeniden bağlanılacak`);
  
  setTimeout(() => {
    connectRemoteClient();
  }, delay);
}

// Ana başlangıç fonksiyonu
function start() {
  log('ChirpStack MQTT Forwarder başlatılıyor...');
  connectLocalClient();
  connectRemoteClient();
}

// Uygulama kapatma işleyicileri
process.on('SIGINT', gracefulShutdown);
process.on('SIGTERM', gracefulShutdown);

function gracefulShutdown() {
  log('Uygulama kapatılıyor...');
  
  if (localClient) {
    localClient.end(true);
  }
  
  if (remoteClient) {
    remoteClient.end(true);
  }
  
  log('Uygulama kapatıldı');
  process.exit(0);
}

// Uygulamayı başlat
start();
FROM node:18-alpine

# Çalışma dizini oluştur
WORKDIR /app

# package.json ve package-lock.json dosyalarını kopyala
COPY package*.json ./

# Bağımlılıkları yükle
RUN npm install --production

# Kaynak kodları kopyala
COPY . .

# Uygulama için ortam değişkenini ayarla
ENV NODE_ENV=production

# Uygulamayı çalıştır
CMD ["node", "index.js"]
FROM node:20.18.0

WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .

# Открываем порт для Hardhat
EXPOSE 8545
# Команда для запуска Hardhat
CMD ["npx", "hardhat", "node"]
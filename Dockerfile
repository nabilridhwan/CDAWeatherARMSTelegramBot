FROM node:20-alpine
LABEL authors="nabil"

WORKDIR /app

COPY . .

RUN npm install && npm run build

CMD ["npm", "run", "start"]
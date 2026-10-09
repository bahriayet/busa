# Backend BUSA — image universal untuk Render/Fly/VPS.
# Node 24+ menjalankan TypeScript langsung (type stripping), tanpa build step.
FROM node:24-alpine

WORKDIR /app
ENV NODE_ENV=production

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY src ./src

EXPOSE 8080
CMD ["node", "--env-file-if-exists=.env", "src/index.ts"]

FROM openjdk:17-jdk-slim AS build

WORKDIR /app

RUN apt-get update && \
    apt-get install -y curl && \
    curl -fsSL https://deb.nodesource.com/setup_18.x | bash - && \
    apt-get install -y nodejs

COPY . .

RUN npm install

FROM openjdk:17-jdk-slim

WORKDIR /app

RUN apt-get update && \
    apt-get install -y curl && \
    curl -fsSL https://deb.nodesource.com/setup_18.x | bash - && \
    apt-get install -y nodejs

COPY --from=build /app /app

ENV NODE_ENV=production
ENV JAVA_HOME=/usr/lib/jvm/java-17-openjdk-amd64

CMD ["node", "index.js"]  # ou "src/index.js" se for compilado com build

FROM node:22-alpine AS web
WORKDIR /src/web
COPY web/package.json web/package-lock.json ./
RUN npm ci
COPY web/ ./
# Railway expone sus variables como argumentos de construcción: el commit identifica cada versión de la app
# y, al cambiar en cada despliegue, evita que la caché de capas reutilice un build antiguo de la web.
ARG RAILWAY_GIT_COMMIT_SHA
ENV RAILWAY_GIT_COMMIT_SHA=$RAILWAY_GIT_COMMIT_SHA
RUN npm run build

FROM mcr.microsoft.com/dotnet/sdk:10.0 AS server
WORKDIR /src
COPY nuget.config ./
COPY server/ ./server/
COPY --from=web /src/server/Viajes.Api/wwwroot ./server/Viajes.Api/wwwroot
RUN dotnet publish server/Viajes.Api/Viajes.Api.csproj -c Release -o /app

FROM mcr.microsoft.com/dotnet/aspnet:10.0
WORKDIR /app
COPY --from=server /app ./
USER root
RUN mkdir -p /data && chown $APP_UID /data
USER $APP_UID
ENV DATA_DIR=/data
# Railway termina el TLS en su proxy: sin esto la app se cree en http y rechaza como ajeno el Origin https.
ENV ASPNETCORE_FORWARDEDHEADERS_ENABLED=true
ENTRYPOINT ["dotnet", "Viajes.Api.dll"]

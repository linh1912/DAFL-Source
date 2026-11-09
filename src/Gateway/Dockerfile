# Stage 1: Build Gateway YARP (.NET 8) — đợt 14
# Cùng mẫu với src/Backend/Dockerfile (sdk:8.0 build + aspnet:8.0 runtime).
FROM mcr.microsoft.com/dotnet/sdk:8.0 AS build
WORKDIR /app

# Copy csproj and restore dependencies
COPY Gateway.csproj ./
RUN dotnet restore Gateway.csproj

# Copy the rest of the source and build release
COPY . ./
RUN dotnet publish Gateway.csproj -c Release -o /app/publish /p:UseAppHost=false

# Stage 2: Runtime Image
FROM mcr.microsoft.com/dotnet/aspnet:8.0 AS runtime
WORKDIR /app

# curl CHỈ để healthcheck trong docker-compose.yml
# (curl http://localhost:8080/gateway/health) — không dùng cho việc khác.
RUN apt-get update \
    && apt-get install -y --no-install-recommends curl \
    && rm -rf /var/lib/apt/lists/*

ENV ASPNETCORE_URLS=http://+:8080
EXPOSE 8080

COPY --from=build /app/publish .

ENTRYPOINT ["dotnet", "DAFL.Gateway.dll"]

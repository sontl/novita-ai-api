# Novita GPU Instance API

A high-performance API service for managing Novita.ai GPU instances with automated lifecycle management, high availability features, and seamless monitoring.

## 🚀 Features

- **Automated Lifecycle**: Smart instance creation, monitoring, and starting/stopping.
- **Cost Optimization**: Built-in auto-stop service for inactive instances.
- **Reliable Architecture**: Redis-backed persistence for jobs and caching with graceful in-memory fallback.
- **Production Ready**: Comprehensive health checks, performance metrics, and Docker support.
- **Type Safety**: Built with TypeScript for robust development and maintenance.

---

## 🛠️ Quick Start

### 1. Requirements
- Node.js 18+ (Local) or Docker & Docker Compose
- A valid Novita.ai API Key

### 2. Configuration
Copy the environment template and fill in your credentials:
```bash
cp .env.example .env
```
Key variables in `.env`:
- `NOVITA_API_KEY`: Your Novita API key.
- `WEBHOOK_URL`: Endpoint for instance status updates.
- `UPSTASH_REDIS_REST_URL`: (Optional) Redis URL for persistence.

### 3. Run the Service
**Development:**
```bash
npm install
npm run dev
```
**Production (Docker):**
```bash
docker-compose up -d
```
The API will be available at `http://localhost:3000`.

---

## 📡 API Reference

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/health` | GET | System health and service status |
| `/api/instances` | POST | Create a new GPU instance |
| `/api/instances` | GET | List all managed instances |
| `/api/instances/{id}` | GET | Get detailed status of an instance |
| `/api/instances/{id}/start` | POST | Start a stopped instance |
| `/api/instances/{id}/stop` | POST | Stop a running instance |
| `/api/cache/stats` | GET | View cache hit ratios and statistics |
| `/api/metrics` | GET | Export application performance metrics |

---

## 🚢 Deployment & Operations Guide

### Essential Environment Variables
| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | API server port | `3000` |
| `NODE_ENV` | `production` or `development` | `development` |
| `LOG_LEVEL` | Logging verbosity (`debug`, `info`, `warn`, `error`) | `info` |
| `INSTANCE_POLL_INTERVAL` | Status check frequency in ms | `30000` |
| `REDIS_ENABLE_FALLBACK` | Fallback to RAM if Redis is down | `true` |

### Production Best Practices
1. **Persistence**: Always use Redis in production to ensure background jobs survive service restarts.
2. **Monitoring**: Integrate `/api/metrics` with Prometheus/Grafana and set up alerts for the `/health` endpoint.
3. **Security**: Ensure your `.env` is never committed. The Docker image runs as a non-root `node` user by default.
4. **Maintenance**: Use `npm run build` to compile the TypeScript source before starting the production server with `npm start`.

### Common Operations
- **View Logs**: `docker-compose logs -f novita-api`
- **Check Health**: `curl http://localhost:3000/health`
- **Build Manually**: `npm run build`

---

## 📄 License
MIT

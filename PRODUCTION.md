# Production Deployment Guide

This document outlines production configuration and best practices for ClipMap deployed on Render (backend) and Cloudflare Pages (frontend).

## Prerequisites

- Node.js 20+ (for backend)
- Docker (optional, for containerized deployment)
- Environment variables configured

## Environment Variables

Copy `backend/.env.example` to `backend/.env` and configure:

```bash
# Server Configuration
PORT=4000
NODE_ENV=production

# CORS Configuration
# Comma-separated list of allowed origins
CORS_ORIGINS=https://yourdomain.com,https://www.yourdomain.com

# Logging
LOG_LEVEL=info

# Overpass API Configuration
OVERPASS_URL=https://overpass-api.de/api/interpreter
OVERPASS_TIMEOUT_MS=25000
OVERPASS_MAX_RETRIES=2

# Rate Limiting
RATE_LIMIT_WINDOW_MS=3600000
RATE_LIMIT_MAX_REQUESTS=60

# Request Timeout (milliseconds)
REQUEST_TIMEOUT_MS=300000
```

## Backend Deployment

### Option 1: Docker (Recommended)

```bash
# Build and run
docker-compose up -d

# Or build manually
cd backend
docker build -t clipmap-backend .
docker run -d \
  -p 4000:4000 \
  -e NODE_ENV=production \
  -e CORS_ORIGINS=https://yourdomain.com \
  -v $(pwd)/logs:/app/logs \
  clipmap-backend
```

### Option 2: Direct Node.js

```bash
# Build
cd backend
npm install
npm run build

# Start
NODE_ENV=production npm start
```

### Process Management

For production, use a process manager like PM2:

```bash
npm install -g pm2
pm2 start dist/index.js --name clipmap-backend
pm2 save
pm2 startup
```

## Frontend Deployment

### Build

```bash
cd frontend
npm install
npm run build
```

The built files will be in `frontend/dist/`. Serve these with a web server (nginx, Apache, etc.).

### Nginx Configuration Example

```nginx
server {
    listen 80;
    server_name yourdomain.com;

    root /path/to/frontend/dist;
    index index.html;

    # Gzip compression
    gzip on;
    gzip_types text/plain text/css application/json application/javascript text/xml application/xml application/xml+rss text/javascript;

    # Cache static assets
    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }

    # SPA routing
    location / {
        try_files $uri $uri/ /index.html;
    }

    # Proxy API requests to backend
    location /api {
        proxy_pass http://localhost:4000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

## Health Checks

The backend provides two health check endpoints:

- **Liveness**: `GET /healthz` - Returns 200 if server is running
- **Readiness**: `GET /readyz` - Returns 200 if server is ready to accept requests (checks memory usage)

Configure your load balancer or orchestration platform to use these endpoints.

## Monitoring

### Logs

Logs are written to `backend/logs/`:
- Daily logs: `app-YYYY-MM-DD.log` (last 10 days retained)
- Metrics logs: `metrics/metrics-{period}.log` (1h, 3h, 6h, 1d, 1w, 1mo, all)

### Metrics

Prometheus metrics are available at `GET /metrics`. Configure Prometheus to scrape this endpoint.

### Request IDs

All requests include an `X-Request-ID` header for log correlation.

## Security Considerations

1. **CORS**: Configure `CORS_ORIGINS` to only allow your frontend domain(s)
2. **Rate Limiting**: Adjust `RATE_LIMIT_MAX_REQUESTS` based on expected traffic
3. **Request Timeout**: Adjust `REQUEST_TIMEOUT_MS` based on expected export complexity
4. **Security Headers**: Automatically set by the application
5. **Error Messages**: Stack traces are hidden in production

## Performance Tuning

1. **Memory**: Monitor memory usage via `/readyz` endpoint
2. **Request Timeout**: Adjust based on largest expected export
3. **Rate Limiting**: Tune based on server capacity and expected load
4. **Log Level**: Use `info` in production, `debug` only for troubleshooting

## Troubleshooting

### High Memory Usage

- Check `/readyz` endpoint for memory stats
- Review logs for memory leaks
- Consider increasing server resources
- Check for stuck export requests

### Slow Exports

- Check Overpass API status
- Review request timeouts
- Check network connectivity
- Review export extent sizes

### Rate Limit Issues

- Adjust `RATE_LIMIT_MAX_REQUESTS` if legitimate users are being blocked
- Check logs for abuse patterns
- Consider IP whitelisting for known good actors

## Backup and Recovery

- **Logs**: Rotate daily, keep last 10 days
- **Metrics**: Retained per retention policy (1h to all-time)
- **Data**: Land tiles are static and can be re-downloaded if needed

## Scaling

For horizontal scaling:
1. Use a shared rate limiting store (Redis) instead of in-memory
2. Ensure logs directory is shared or use centralized logging
3. Configure load balancer with health checks
4. Consider using a message queue for export jobs if needed


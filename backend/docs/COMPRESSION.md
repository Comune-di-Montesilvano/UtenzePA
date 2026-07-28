# Response Compression

This NestJS template includes built-in HTTP response compression middleware to reduce bandwidth usage and improve API performance.

## Overview

Response compression automatically compresses HTTP responses using gzip or deflate algorithms before sending them to the client. This significantly reduces the payload size, especially for text-based content like JSON, HTML, and XML.

## Configuration

Compression settings are configured in the YAML configuration files under the `api` section:

```yaml
api:
  # Compression Configuration
  compressionEnabled: true      # Enable/disable response compression
  compressionLevel: 6           # Compression level (0-9, where 9 is best compression)
  compressionThreshold: 1024    # Minimum response size in bytes to compress (1KB)
```

### Configuration Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `compressionEnabled` | boolean | `true` | Enable or disable compression globally |
| `compressionLevel` | number | `6` | Compression level from 0 (no compression) to 9 (maximum compression) |
| `compressionThreshold` | number | `1024` | Minimum response size in bytes before compression is applied |

### Environment-Specific Settings

#### Development (`default.yml`)
```yaml
compressionEnabled: true
compressionLevel: 6        # Balanced for development
compressionThreshold: 1024 # 1KB
```

#### Production (`production.yml`)
```yaml
compressionEnabled: true
compressionLevel: 6        # Balanced for production performance
compressionThreshold: 1024 # 1KB
```

#### Test (`test.yml`)
```yaml
compressionEnabled: false  # Disabled for easier debugging
```

## How It Works

1. **Request Headers**: The client sends `Accept-Encoding: gzip, deflate` header
2. **Size Check**: Server checks if response size exceeds `compressionThreshold`
3. **Compression**: If conditions are met, response is compressed
4. **Response Headers**: Server adds `Content-Encoding: gzip` header
5. **Client Decompression**: Browser automatically decompresses the response

## Compression Levels

The compression level affects the trade-off between compression ratio and CPU usage:

| Level | Speed | Compression | Use Case |
|-------|-------|-------------|----------|
| 0 | Fastest | None | Disabled |
| 1 | Very Fast | Minimal | Real-time/high-throughput |
| 3 | Fast | Light | Development |
| 6 | Balanced | Good | **Recommended for production** |
| 9 | Slowest | Maximum | Static assets, low traffic |

### Recommended Settings

- **Development**: Level 6 (balanced)
- **Production**: Level 6 (optimal performance/compression ratio)
- **High Traffic**: Level 3-4 (faster compression)
- **Static Content**: Level 9 (maximum compression)

## Benefits

### Bandwidth Savings
- **JSON APIs**: 60-80% reduction
- **HTML**: 70-90% reduction
- **Plain Text**: 50-70% reduction
- **Already Compressed**: No change (images, videos)

### Performance Improvements
- Reduced bandwidth costs
- Faster response times (less data transfer)
- Better mobile performance
- Improved SEO (page speed)

## Disabling Compression

### For Specific Requests

Clients can disable compression by sending a custom header:

```http
GET /api/v1/endpoint
X-No-Compression: true
```

### Globally

Set in configuration file:

```yaml
api:
  compressionEnabled: false
```

## Content Types

Compression is automatically applied to compressible MIME types:

- ✅ `application/json`
- ✅ `text/html`
- ✅ `text/plain`
- ✅ `text/css`
- ✅ `text/xml`
- ✅ `application/javascript`
- ❌ `image/*` (already compressed)
- ❌ `video/*` (already compressed)
- ❌ `application/zip`
- ❌ `application/pdf`

## Testing Compression

### Using cURL

```bash
# Request with compression
curl -H "Accept-Encoding: gzip" \
     -i http://localhost:3000/api/v1/endpoint

# Check response headers
# Should include: Content-Encoding: gzip
```

### Using HTTPie

```bash
# HTTPie automatically handles compression
http :3000/api/v1/endpoint

# Disable compression
http :3000/api/v1/endpoint Accept-Encoding:identity
```

### Browser Developer Tools

1. Open DevTools (F12)
2. Go to Network tab
3. Make a request
4. Check response headers for `Content-Encoding: gzip`
5. Compare Size vs Transferred size

## Performance Considerations

### CPU vs Bandwidth Trade-off

Compression uses CPU cycles to save bandwidth. Consider:

- **CPU-bound systems**: Use lower compression levels (3-4)
- **Bandwidth-constrained**: Use higher levels (6-9)
- **Cloud environments**: Level 6 is optimal for cost/performance

### Caching Recommendations

For optimal performance, combine compression with caching:

```typescript
@Controller('api/v1/data')
export class DataController {
  @Get()
  @Header('Cache-Control', 'public, max-age=3600')
  getData() {
    // Large response that will be compressed and cached
    return largeDataset;
  }
}
```

## Troubleshooting

### Compression Not Working

**Check response headers:**
```bash
curl -H "Accept-Encoding: gzip" -I http://localhost:3000/api/v1/endpoint
```

**Common issues:**
1. Response size below threshold
2. Client doesn't send `Accept-Encoding` header
3. `compressionEnabled` is false
4. Custom `X-No-Compression` header present

### Performance Issues

If compression causes CPU issues:

1. Lower compression level to 3-4
2. Increase threshold to 2048 or 4096 bytes
3. Consider using a CDN for compression
4. Monitor CPU usage with compression enabled

## Best Practices

1. **Keep level at 6** for most use cases
2. **Set appropriate threshold** (1KB is good default)
3. **Monitor CPU usage** in production
4. **Use CDN** for static content compression
5. **Cache compressed responses** when possible
6. **Test with real traffic** patterns
7. **Don't compress already compressed** content

## Monitoring

Track these metrics:

- **Compression ratio**: Original size / Compressed size
- **CPU usage**: Before and after enabling compression
- **Response times**: Impact on latency
- **Bandwidth savings**: Monthly data transfer reduction

## Example Configuration

### High-Traffic API
```yaml
api:
  compressionEnabled: true
  compressionLevel: 4      # Fast compression
  compressionThreshold: 2048  # 2KB threshold
```

### Content-Heavy API
```yaml
api:
  compressionEnabled: true
  compressionLevel: 7      # Better compression
  compressionThreshold: 512   # Compress more aggressively
```

### Development
```yaml
api:
  compressionEnabled: true
  compressionLevel: 6
  compressionThreshold: 1024
```

## Additional Resources

- [Node.js Compression Documentation](https://github.com/expressjs/compression)
- [HTTP Compression Best Practices](https://developer.mozilla.org/en-US/docs/Web/HTTP/Compression)
- [gzip vs Brotli Comparison](https://blogs.akamai.com/2016/02/understanding-brotlis-potential.html)

## Related Documentation

- [Rate Limiting](./RATE_LIMITING.md)
- [Security Configuration](./SECURITY.md)
- [Performance Optimization](./PERFORMANCE.md)

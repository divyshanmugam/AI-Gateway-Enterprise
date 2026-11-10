import { type Request, type Response, type NextFunction } from 'express';

// A secure mock registry of valid developer platform API keys
const VALID_API_KEYS = new Set(['sk_dev_gateway_test_token_123', 'sk_prod_internal_app_456']);

interface TokenBucket {
  tokens: number;
  lastRefill: number;
}

// In-memory token bucket registry tracking rate limits per API key
const rateLimitRegistry = new Map<string, TokenBucket>();

const BUCKET_MAX_CAPACITY = 5; // Maximum bursting capacity limits
const REFILL_RATE_PER_MS = 1 / 10000; // Refill 1 token every 10 seconds

export function securityMiddleware(req: Request, res: Response, next: NextFunction): void {
  const apiKey = req.headers['x-api-key'] as string;

  // 1. Authorization Access Key Screening Check
  if (!apiKey || !VALID_API_KEYS.has(apiKey)) {
    res.status(401).json({ error: 'Unauthorized: Invalid or missing administrative platforms X-API-KEY header.' });
    return;
  }

  // 2. Token-Bucket Rate Limiter Evaluation
  const now = Date.now();
  if (!rateLimitRegistry.has(apiKey)) {
    rateLimitRegistry.set(apiKey, { tokens: BUCKET_MAX_CAPACITY, lastRefill: now });
  }

  const bucket = rateLimitRegistry.get(apiKey)!;

  // Calculate rolling replenishment delta
  const msElapsed = now - bucket.lastRefill;
  bucket.tokens = Math.min(BUCKET_MAX_CAPACITY, bucket.tokens + msElapsed * REFILL_RATE_PER_MS);
  bucket.lastRefill = now;

  if (bucket.tokens < 1) {
    res.status(429).json({ 
      error: 'Too Many Requests: Token bucket completely exhausted. Please back off your request execution loops.' 
    });
    return;
  }

  // Consume exactly 1 request allocation token block
  bucket.tokens -= 1;

  // Append usage tracking headers cleanly to response metadata pipeline
  res.setHeader('X-RateLimit-Remaining', Math.floor(bucket.tokens));
  next();
}
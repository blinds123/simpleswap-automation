import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Configuration
const MERCHANT_WALLET = process.env.MERCHANT_WALLET || "0x1372Ad41B513b9d6eC008086C03d69C635bAE578";
const POOL_SIZE = parseInt(process.env.POOL_SIZE) || 10;
const MIN_POOL_SIZE = parseInt(process.env.MIN_POOL_SIZE) || 5;
const PRODUCT_PRICE_USD = parseInt(process.env.PRODUCT_PRICE_USD) || 25;

// Middleware
app.use(cors({
    origin: process.env.FRONTEND_URL || 'https://beigesneaker.netlify.app',
    credentials: true
}));
app.use(express.json());

// Mock pool (no actual exchanges)
let exchangePool = [];

// Root endpoint
app.get('/', (req, res) => {
    res.json({
        service: 'SimpleSwap Pool Server',
        status: 'running',
        version: '3.4.0-no-pool-test',
        poolSize: exchangePool.length
    });
});

// Health check
app.get('/health', (req, res) => {
    res.json({
        status: 'healthy',
        poolSize: exchangePool.length,
        maxPool: POOL_SIZE,
        productPrice: PRODUCT_PRICE_USD,
        timestamp: new Date().toISOString()
    });
});

// Buy now endpoint (returns mock data)
app.post('/buy-now', async (req, res) => {
    console.log('Buy Now request received');
    res.json({
        success: true,
        exchangeId: 'mock-exchange-id',
        exchangeUrl: 'https://simpleswap.io/exchange?id=mock',
        amountUSD: PRODUCT_PRICE_USD,
        createdAt: new Date().toISOString(),
        poolStatus: 'mock'
    });
});

// Stats endpoint
app.get('/stats', (req, res) => {
    res.json({
        poolSize: exchangePool.length,
        maxSize: POOL_SIZE,
        minSize: MIN_POOL_SIZE,
        productPrice: PRODUCT_PRICE_USD,
        merchantWallet: MERCHANT_WALLET,
        exchanges: []
    });
});

// Admin init endpoint (no-op)
app.post('/admin/init-pool', async (req, res) => {
    console.log('Manual pool init requested (no-op in test mode)');
    res.json({
        success: true,
        poolSize: 0,
        message: 'Test mode - no actual pool initialization'
    });
});

app.listen(PORT, () => {
    console.log(`\n🚀 SimpleSwap Pool Server v3.4.0 (No Pool Test)`);
    console.log(`   Port: ${PORT}`);
    console.log(`   Frontend: ${process.env.FRONTEND_URL || 'https://beigesneaker.netlify.app'}`);
    console.log(`   Product: Beige Sneakers ($${PRODUCT_PRICE_USD})`);
    console.log(`\n✅ Server started WITHOUT Playwright pool logic\n`);
});

process.on('SIGTERM', () => {
    console.log('\n⏹ Shutting down...');
    process.exit(0);
});

import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { createExchange } from './automation.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Configuration
const MERCHANT_WALLET = process.env.MERCHANT_WALLET || "0x1372Ad41B513b9d6eC008086C03d69C635bAE578";
const EXCHANGE_AMOUNT = parseInt(process.env.EXCHANGE_AMOUNT || "25");
const POOL_SIZE = parseInt(process.env.POOL_SIZE || "10");
const MIN_POOL_SIZE = parseInt(process.env.MIN_POOL_SIZE || "5");

// In-memory exchange pool
let exchangePool = [];
let isInitializing = false;
let isReplenishing = false;

// Stats
let stats = {
    totalCreated: 0,
    totalDelivered: 0,
    currentPoolSize: 0,
    lastReplenish: null,
    poolStatus: 'initializing'
};

/**
 * Initialize the exchange pool on startup
 */
async function initializePool() {
    if (isInitializing) {
        console.log('⏳ Pool already initializing...');
        return;
    }

    isInitializing = true;
    stats.poolStatus = 'initializing';

    console.log(`\n🏊 Initializing exchange pool with ${POOL_SIZE} exchanges...`);
    console.log(`   Merchant Wallet: ${MERCHANT_WALLET}`);
    console.log(`   Amount per exchange: ${EXCHANGE_AMOUNT} USD\n`);

    const startTime = Date.now();

    // Create exchanges sequentially (BrightData might rate limit parallel)
    for (let i = 0; i < POOL_SIZE; i++) {
        try {
            console.log(`[${i + 1}/${POOL_SIZE}] Creating exchange...`);
            const exchange = await createExchange(MERCHANT_WALLET, EXCHANGE_AMOUNT);

            exchangePool.push({
                ...exchange,
                createdAt: new Date().toISOString(),
                used: false
            });

            stats.totalCreated++;
            stats.currentPoolSize = exchangePool.length;

            console.log(`   ✓ Exchange ${exchange.exchangeId} added to pool`);
        } catch (error) {
            console.error(`   ✗ Failed to create exchange ${i + 1}:`, error.message);
        }
    }

    const duration = ((Date.now() - startTime) / 1000).toFixed(1);

    console.log(`\n✅ Pool initialized with ${exchangePool.length} exchanges in ${duration}s`);
    console.log(`   Ready to serve customers!\n`);

    stats.poolStatus = 'ready';
    isInitializing = false;
}

/**
 * Replenish pool in background when it drops below minimum
 */
async function replenishPool() {
    if (isReplenishing) {
        return;
    }

    const neededExchanges = POOL_SIZE - exchangePool.length;

    if (neededExchanges <= 0) {
        return;
    }

    isReplenishing = true;
    stats.poolStatus = 'replenishing';
    stats.lastReplenish = new Date().toISOString();

    console.log(`\n🔄 Replenishing pool with ${neededExchanges} exchanges...`);

    for (let i = 0; i < neededExchanges; i++) {
        try {
            console.log(`[${i + 1}/${neededExchanges}] Creating exchange...`);
            const exchange = await createExchange(MERCHANT_WALLET, EXCHANGE_AMOUNT);

            exchangePool.push({
                ...exchange,
                createdAt: new Date().toISOString(),
                used: false
            });

            stats.totalCreated++;
            stats.currentPoolSize = exchangePool.length;

            console.log(`   ✓ Exchange ${exchange.exchangeId} added to pool`);
        } catch (error) {
            console.error(`   ✗ Failed to create exchange:`, error.message);
        }
    }

    console.log(`✅ Pool replenished. Current size: ${exchangePool.length}\n`);

    stats.poolStatus = 'ready';
    isReplenishing = false;
}

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({
        status: 'ok',
        service: 'SimpleSwap Pool Manager',
        pool: {
            available: exchangePool.length,
            total: POOL_SIZE,
            status: stats.poolStatus
        },
        timestamp: new Date().toISOString()
    });
});

// Stats endpoint
app.get('/stats', (req, res) => {
    res.json({
        ...stats,
        availableExchanges: exchangePool.length,
        poolSize: POOL_SIZE,
        timestamp: new Date().toISOString()
    });
});

/**
 * Main endpoint - Get pre-made exchange instantly
 * This is what your Netlify site calls
 */
app.get('/get-exchange', async (req, res) => {
    try {
        // Check if pool is ready
        if (exchangePool.length === 0) {
            if (isInitializing) {
                return res.status(503).json({
                    success: false,
                    error: 'Exchange pool is still initializing. Please try again in a moment.',
                    retryAfter: 10
                });
            }

            // Pool is empty but not initializing - create one on the fly
            console.log('⚠️  Pool empty, creating exchange on demand...');
            const exchange = await createExchange(MERCHANT_WALLET, EXCHANGE_AMOUNT);

            stats.totalCreated++;
            stats.totalDelivered++;

            // Trigger replenishment in background
            replenishPool().catch(err => console.error('Replenishment error:', err));

            return res.json({
                success: true,
                exchangeId: exchange.exchangeId,
                exchangeUrl: exchange.exchangeUrl,
                amount: EXCHANGE_AMOUNT,
                wallet: MERCHANT_WALLET,
                poolStatus: 'on-demand',
                timestamp: new Date().toISOString()
            });
        }

        // Get exchange from pool (FIFO - first in, first out)
        const exchange = exchangePool.shift();
        exchange.used = true;
        exchange.deliveredAt = new Date().toISOString();

        stats.totalDelivered++;
        stats.currentPoolSize = exchangePool.length;

        console.log(`📤 Delivered exchange ${exchange.exchangeId} (${exchangePool.length} remaining in pool)`);

        // Trigger replenishment if below minimum
        if (exchangePool.length < MIN_POOL_SIZE && !isReplenishing) {
            console.log(`⚠️  Pool size (${exchangePool.length}) below minimum (${MIN_POOL_SIZE}), triggering replenishment...`);
            replenishPool().catch(err => console.error('Replenishment error:', err));
        }

        res.json({
            success: true,
            exchangeId: exchange.exchangeId,
            exchangeUrl: exchange.exchangeUrl,
            amount: EXCHANGE_AMOUNT,
            wallet: MERCHANT_WALLET,
            poolStatus: 'instant',
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        console.error('Error delivering exchange:', error);

        res.status(500).json({
            success: false,
            error: error.message,
            timestamp: new Date().toISOString()
        });
    }
});

// Legacy endpoint for backward compatibility (creates on-demand, no pool)
app.get('/create-exchange', async (req, res) => {
    const { wallet, amount } = req.query;

    if (!wallet) {
        return res.status(400).json({
            error: 'Missing required parameter: wallet',
            hint: 'Use /get-exchange for instant pre-made exchanges'
        });
    }

    if (!/^0x[a-fA-F0-9]{40}$/.test(wallet)) {
        return res.status(400).json({
            error: 'Invalid wallet address format'
        });
    }

    const exchangeAmount = amount ? parseFloat(amount) : EXCHANGE_AMOUNT;

    try {
        console.log(`Creating custom exchange for wallet: ${wallet}, amount: ${exchangeAmount}`);
        const result = await createExchange(wallet, exchangeAmount);

        res.json({
            success: true,
            exchangeId: result.exchangeId,
            exchangeUrl: result.exchangeUrl,
            wallet: wallet,
            amount: exchangeAmount,
            poolStatus: 'custom',
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        console.error('Error creating custom exchange:', error);

        res.status(500).json({
            success: false,
            error: error.message,
            timestamp: new Date().toISOString()
        });
    }
});

// Start server and initialize pool
app.listen(PORT, async () => {
    console.log(`\n🚀 SimpleSwap Pool Manager starting...`);
    console.log(`   Server: http://localhost:${PORT}`);
    console.log(`\n📋 Endpoints:`);
    console.log(`   GET  /health - Health check`);
    console.log(`   GET  /stats - Pool statistics`);
    console.log(`   GET  /get-exchange - Get instant pre-made exchange`);
    console.log(`   GET  /create-exchange?wallet=0x... - Create custom exchange\n`);

    // Initialize pool on startup
    await initializePool();
});

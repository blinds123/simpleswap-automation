import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { createExchange } from './automation.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({
        status: 'ok',
        service: 'SimpleSwap Automation',
        timestamp: new Date().toISOString()
    });
});

// Main automation endpoint
app.get('/create-exchange', async (req, res) => {
    const { wallet, amount } = req.query;

    // Validation
    if (!wallet) {
        return res.status(400).json({
            error: 'Missing required parameter: wallet',
            example: '/create-exchange?wallet=0x1234...&amount=25'
        });
    }

    // Validate wallet format (basic Ethereum address check)
    if (!/^0x[a-fA-F0-9]{40}$/.test(wallet)) {
        return res.status(400).json({
            error: 'Invalid wallet address format. Must be a valid Ethereum address (0x...)'
        });
    }

    const exchangeAmount = amount ? parseFloat(amount) : 25;
    if (isNaN(exchangeAmount) || exchangeAmount <= 0) {
        return res.status(400).json({
            error: 'Invalid amount. Must be a positive number'
        });
    }

    try {
        console.log(`[${new Date().toISOString()}] Creating exchange for wallet: ${wallet}, amount: ${exchangeAmount}`);

        const result = await createExchange(wallet, exchangeAmount);

        console.log(`[${new Date().toISOString()}] Exchange created successfully: ${result.exchangeUrl}`);

        res.json({
            success: true,
            exchangeId: result.exchangeId,
            exchangeUrl: result.exchangeUrl,
            wallet: wallet,
            amount: exchangeAmount,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        console.error(`[${new Date().toISOString()}] Error creating exchange:`, error);

        res.status(500).json({
            success: false,
            error: error.message,
            wallet: wallet,
            amount: exchangeAmount,
            timestamp: new Date().toISOString()
        });
    }
});

// POST endpoint for programmatic access
app.post('/create-exchange', async (req, res) => {
    const { wallet, amount } = req.body;

    if (!wallet) {
        return res.status(400).json({
            error: 'Missing required field: wallet'
        });
    }

    if (!/^0x[a-fA-F0-9]{40}$/.test(wallet)) {
        return res.status(400).json({
            error: 'Invalid wallet address format'
        });
    }

    const exchangeAmount = amount || 25;

    try {
        console.log(`[${new Date().toISOString()}] Creating exchange (POST) for wallet: ${wallet}, amount: ${exchangeAmount}`);

        const result = await createExchange(wallet, exchangeAmount);

        console.log(`[${new Date().toISOString()}] Exchange created successfully: ${result.exchangeUrl}`);

        res.json({
            success: true,
            exchangeId: result.exchangeId,
            exchangeUrl: result.exchangeUrl,
            wallet: wallet,
            amount: exchangeAmount,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        console.error(`[${new Date().toISOString()}] Error creating exchange:`, error);

        res.status(500).json({
            success: false,
            error: error.message,
            timestamp: new Date().toISOString()
        });
    }
});

// Start server
app.listen(PORT, () => {
    console.log(`\n🚀 SimpleSwap Automation Service running on http://localhost:${PORT}`);
    console.log(`\n📋 Available endpoints:`);
    console.log(`   GET  /health`);
    console.log(`   GET  /create-exchange?wallet=0x...&amount=25`);
    console.log(`   POST /create-exchange (JSON body: {wallet, amount})`);
    console.log(`\n🌐 Web Interface: http://localhost:${PORT}\n`);
});

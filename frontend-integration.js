/**
 * SimpleSwap Frontend Integration for beigesneaker.netlify.app
 *
 * Replace Square payment with crypto payment via SimpleSwap
 * Add this code to your script.js file
 */

// Backend pool server URL (update after deploying to Render)
const BACKEND_URL = 'https://YOUR-APP-NAME.onrender.com';

/**
 * Handle Buy Now button click - Get pre-made exchange and redirect
 */
async function handleBuyNow() {
    const buyButton = document.getElementById('addToCartBtn');
    const originalText = buyButton.innerHTML;

    try {
        // Show loading state
        buyButton.disabled = true;
        buyButton.innerHTML = `
            <div class="spinner"></div>
            PROCESSING...
        `;

        // Call backend to get pre-made exchange from pool
        const response = await fetch(`${BACKEND_URL}/buy-now`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            }
        });

        const data = await response.json();

        if (data.success) {
            // Success! Redirect to SimpleSwap
            console.log('Exchange ready:', data.exchangeId);
            console.log('Pool status:', data.poolStatus);

            // Optional: Show success message briefly before redirect
            buyButton.innerHTML = '✓ REDIRECTING TO PAYMENT...';

            // Redirect to SimpleSwap exchange page
            setTimeout(() => {
                window.location.href = data.exchangeUrl;
            }, 500);

        } else {
            throw new Error(data.error || 'Failed to create exchange');
        }

    } catch (error) {
        console.error('Buy Now error:', error);

        // Show error
        buyButton.innerHTML = '✗ ERROR - TRY AGAIN';
        buyButton.style.background = '#ff4444';

        // Reset after 3 seconds
        setTimeout(() => {
            buyButton.disabled = false;
            buyButton.innerHTML = originalText;
            buyButton.style.background = '';
        }, 3000);

        // Optional: Show user-friendly error message
        alert('Payment system temporarily unavailable. Please try again in a moment.');
    }
}

/**
 * Initialize on page load
 */
document.addEventListener('DOMContentLoaded', () => {
    // Replace the existing button click handler
    const buyButton = document.getElementById('addToCartBtn');

    if (buyButton) {
        // Remove old Square payment handler
        buyButton.onclick = null;

        // Add new SimpleSwap handler
        buyButton.addEventListener('click', handleBuyNow);

        console.log('✓ SimpleSwap payment integration active');
    }

    // Optional: Also handle pre-order button
    const preOrderButton = document.getElementById('preOrderBtn');
    if (preOrderButton) {
        preOrderButton.addEventListener('click', handleBuyNow);
    }
});

// Add loading spinner CSS (add to your styles.css)
const spinnerCSS = `
.spinner {
    display: inline-block;
    width: 16px;
    height: 16px;
    border: 2px solid rgba(255,255,255,0.3);
    border-top-color: white;
    border-radius: 50%;
    animation: spin 0.6s linear infinite;
    margin-right: 8px;
    vertical-align: middle;
}

@keyframes spin {
    to { transform: rotate(360deg); }
}
`;

// Inject spinner CSS
const style = document.createElement('style');
style.textContent = spinnerCSS;
document.head.appendChild(style);

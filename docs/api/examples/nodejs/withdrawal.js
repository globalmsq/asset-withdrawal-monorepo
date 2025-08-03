const axios = require('axios');

// API base URL
const API_BASE_URL = 'http://localhost:8080';

// Submit withdrawal request
async function submitWithdrawal() {
  try {
    const response = await axios.post(`${API_BASE_URL}/withdrawal/request`, {
      userId: 'user-123456',
      amount: '0.5',
      toAddress: '0x742d35Cc6634C0532925a3b844Bc9e7595f7fAEd',
      tokenAddress: '0x0000000000000000000000000000000000000000',
      network: 'ethereum',
    });

    console.log('Withdrawal request submitted:', response.data);
    return response.data.data.id;
  } catch (error) {
    console.error(
      'Error submitting withdrawal:',
      error.response?.data || error.message
    );
    throw error;
  }
}

// Check withdrawal status
async function checkStatus(transactionId) {
  try {
    const response = await axios.get(
      `${API_BASE_URL}/withdrawal/status/${transactionId}`
    );
    console.log('Withdrawal status:', response.data);
    return response.data;
  } catch (error) {
    console.error(
      'Error checking status:',
      error.response?.data || error.message
    );
    throw error;
  }
}

// Example usage
(async () => {
  try {
    // Submit withdrawal
    const txId = await submitWithdrawal();

    // Wait 2 seconds
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Check status
    await checkStatus(txId);
  } catch (error) {
    console.error('Example failed:', error);
  }
})();

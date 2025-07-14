import requests
import time
import json

# API base URL
API_BASE_URL = 'http://localhost:8080'

def submit_withdrawal():
    """Submit a withdrawal request"""
    url = f"{API_BASE_URL}/withdrawal/request"
    payload = {
        "amount": "0.5",
        "toAddress": "0x742d35Cc6634C0532925a3b844Bc9e7595f7fAEd",
        "tokenAddress": "0x0000000000000000000000000000000000000000",
        "network": "polygon"
    }

    try:
        response = requests.post(url, json=payload)
        response.raise_for_status()
        data = response.json()
        print(f"Withdrawal request submitted: {json.dumps(data, indent=2)}")
        return data['data']['id']
    except requests.exceptions.RequestException as e:
        print(f"Error submitting withdrawal: {e}")
        if hasattr(e.response, 'json'):
            print(f"Response: {e.response.json()}")
        raise

def check_status(transaction_id):
    """Check withdrawal status"""
    url = f"{API_BASE_URL}/withdrawal/status/{transaction_id}"

    try:
        response = requests.get(url)
        response.raise_for_status()
        data = response.json()
        print(f"Withdrawal status: {json.dumps(data, indent=2)}")
        return data
    except requests.exceptions.RequestException as e:
        print(f"Error checking status: {e}")
        if hasattr(e.response, 'json'):
            print(f"Response: {e.response.json()}")
        raise

def get_request_queue_status():
    """Get request queue status (for debugging)"""
    url = f"{API_BASE_URL}/withdrawal/request-queue/status"

    try:
        response = requests.get(url)
        response.raise_for_status()
        data = response.json()
        print(f"Request queue status: {json.dumps(data, indent=2)}")
        return data
    except requests.exceptions.RequestException as e:
        print(f"Error getting request queue status: {e}")
        raise

def get_tx_queue_status():
    """Get transaction queue status (for debugging)"""
    url = f"{API_BASE_URL}/withdrawal/tx-queue/status"

    try:
        response = requests.get(url)
        response.raise_for_status()
        data = response.json()
        print(f"Transaction queue status: {json.dumps(data, indent=2)}")
        return data
    except requests.exceptions.RequestException as e:
        print(f"Error getting transaction queue status: {e}")
        raise

if __name__ == "__main__":
    try:
        # Submit withdrawal
        tx_id = submit_withdrawal()

        # Wait 2 seconds
        time.sleep(2)

        # Check status
        check_status(tx_id)

        # Check queue status
        get_request_queue_status()
        get_tx_queue_status()

    except Exception as e:
        print(f"Example failed: {e}")
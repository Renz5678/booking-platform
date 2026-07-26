import asyncio
import os
import sys

# Add backend directory to sys.path
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.services.payment_service import create_paymongo_checkout

async def run():
    try:
        url = await create_paymongo_checkout(1500.0, "test-booking-12345")
        print(f"Checkout URL: {url}")
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    asyncio.run(run())

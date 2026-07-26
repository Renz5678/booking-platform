import os

from dotenv import load_dotenv
from google_auth_oauthlib.flow import InstalledAppFlow

# Load existing environment variables
load_dotenv()

# If modifying these scopes, delete the file token.json.
SCOPES = [
    'https://www.googleapis.com/auth/gmail.send',
    'https://www.googleapis.com/auth/calendar.events'
]

def main():
    client_id = os.getenv("GOOGLE_CLIENT_ID")
    client_secret = os.getenv("GOOGLE_CLIENT_SECRET")
    
    if not client_id or not client_secret:
        print("Please ensure GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET are set in your .env file!")
        return

    # We can reconstruct the client_secrets.json structure needed by the flow
    client_config = {
        "installed": {
            "client_id": client_id,
            "project_id": "counseling-platform",
            "auth_uri": "https://accounts.google.com/o/oauth2/auth",
            "token_uri": "https://oauth2.googleapis.com/token",
            "auth_provider_x509_cert_url": "https://www.googleapis.com/oauth2/v1/certs",
            "client_secret": client_secret,
            "redirect_uris": ["http://localhost:8080/"]
        }
    }

    print("Opening your browser to authorize the application...")
    flow = InstalledAppFlow.from_client_config(client_config, SCOPES)
    
    # We ask for a refresh token by setting prompt="consent" and access_type="offline"
    # We use a fixed port 8080 so you can configure it in Google Cloud Console.
    creds = flow.run_local_server(port=8080, prompt='consent', access_type='offline')
    
    print("\n" + "="*60)
    print("Authorization Successful!")
    print("="*60)
    print("Please copy the following refresh token and add it to your .env file")
    print("as GOOGLE_REFRESH_TOKEN=\"your_token_here\"\n")
    print(f"GOOGLE_REFRESH_TOKEN=\"{creds.refresh_token}\"")
    print("="*60 + "\n")

if __name__ == '__main__':
    main()

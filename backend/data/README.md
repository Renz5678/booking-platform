# Counselor import

Copy `counselors.example.json` to `counselors.local.json` in this directory and replace the sample. Add one object per counselor. The local file is ignored by Git. Do not put passwords, identity documents, tokens or calendar credentials in the JSON.

From `backend`, validate without connecting to the database:

```
.venv/bin/python scripts/import_counselors.py data/counselors.local.json
```

For each account, set a unique password in the environment variable named by `initial_password_env`. Use a password manager and supply variables through your deployment secret manager or a hidden shell prompt; do not place values in shell history. Passwords must satisfy the application policy and fit within 72 UTF-8 bytes.

After migrations and backup, apply to the database configured for this environment:

```
.venv/bin/python scripts/import_counselors.py data/counselors.local.json --apply
```

Import is atomic. Existing counselor accounts are skipped without changing passwords or profile data; an existing non-counselor account aborts the import. New accounts can log in with their initial password and must enroll in MFA. Their profiles remain inactive/unverified until calendar onboarding and administrator review. Share initial passwords privately and have counselors change them. Availability and credentials are configured through the application after onboarding.

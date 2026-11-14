-- Frozen synthetic-data baseline, 2026-10-31. Never regenerate for deployed revisions.
CREATE TABLE audit_events (
	id VARCHAR NOT NULL, 
	actor_id VARCHAR NOT NULL, 
	target_id VARCHAR NOT NULL, 
	action VARCHAR NOT NULL, 
	outcome VARCHAR NOT NULL, 
	created_at TIMESTAMP WITH TIME ZONE NOT NULL, 
	PRIMARY KEY (id)
);

CREATE TABLE booking_requests (
	key VARCHAR NOT NULL, 
	payload_hash VARCHAR NOT NULL, 
	response JSON, 
	PRIMARY KEY (key)
);

CREATE TABLE contact_messages (
	id VARCHAR NOT NULL, 
	name VARCHAR NOT NULL, 
	email VARCHAR NOT NULL, 
	message TEXT NOT NULL, 
	is_read BOOLEAN NOT NULL, 
	created_at TIMESTAMP WITH TIME ZONE, 
	PRIMARY KEY (id)
);

CREATE TABLE outbox_jobs (
	id VARCHAR NOT NULL, 
	operation_key VARCHAR NOT NULL, 
	kind VARCHAR NOT NULL, 
	payload JSON NOT NULL, 
	status VARCHAR NOT NULL, 
	attempts INTEGER NOT NULL, 
	next_attempt_at TIMESTAMP WITH TIME ZONE NOT NULL, 
	lease_until TIMESTAMP WITH TIME ZONE, 
	error_code VARCHAR, 
	created_at TIMESTAMP WITH TIME ZONE NOT NULL, 
	PRIMARY KEY (id), 
	UNIQUE (operation_key)
);

CREATE TABLE payment_claims (
	id VARCHAR NOT NULL, 
	booking_id VARCHAR NOT NULL, 
	reference VARCHAR(64) NOT NULL, 
	status VARCHAR NOT NULL, 
	reason VARCHAR(500), 
	created_at TIMESTAMP WITH TIME ZONE NOT NULL, 
	PRIMARY KEY (id)
);

CREATE INDEX ix_payment_claims_booking_id ON payment_claims (booking_id);

CREATE TABLE recovery_tokens (
	token_hash VARCHAR NOT NULL, 
	user_id VARCHAR NOT NULL, 
	purpose VARCHAR NOT NULL, 
	expires_at TIMESTAMP WITH TIME ZONE NOT NULL, 
	PRIMARY KEY (token_hash)
);

CREATE INDEX ix_recovery_tokens_user_id ON recovery_tokens (user_id);

CREATE TABLE site_content (
	key VARCHAR NOT NULL, 
	value TEXT NOT NULL, 
	updated_at TIMESTAMP WITH TIME ZONE, 
	PRIMARY KEY (key)
);

CREATE TABLE users (
	id VARCHAR NOT NULL, 
	role VARCHAR(9) NOT NULL, 
	email VARCHAR NOT NULL, 
	password_hash VARCHAR NOT NULL, 
	full_name VARCHAR NOT NULL, 
	is_verified BOOLEAN NOT NULL, 
	is_active BOOLEAN NOT NULL, 
	mfa_secret TEXT, 
	mfa_enabled BOOLEAN NOT NULL, 
	mfa_last_counter INTEGER NOT NULL, 
	mfa_recovery_hashes JSON, 
	mfa_failed_attempts INTEGER NOT NULL, 
	mfa_locked_until TIMESTAMP WITH TIME ZONE, 
	created_at TIMESTAMP WITH TIME ZONE, 
	verification_otp VARCHAR, 
	verification_otp_expires_at TIMESTAMP WITH TIME ZONE, 
	google_refresh_token TEXT, 
	google_calendar_connected BOOLEAN NOT NULL, 
	failed_login_attempts INTEGER NOT NULL, 
	locked_until TIMESTAMP WITH TIME ZONE, 
	invite_token VARCHAR, 
	invite_token_expires_at TIMESTAMP WITH TIME ZONE, 
	PRIMARY KEY (id)
);

CREATE UNIQUE INDEX ix_users_email ON users (email);

CREATE TABLE verified_transfers (
	id VARCHAR NOT NULL, 
	reference VARCHAR(64) NOT NULL, 
	claim_id VARCHAR NOT NULL, 
	amount NUMERIC(10, 2) NOT NULL, 
	status VARCHAR NOT NULL, 
	refund_reference VARCHAR(64), 
	verified_by VARCHAR NOT NULL, 
	created_at TIMESTAMP WITH TIME ZONE NOT NULL, 
	PRIMARY KEY (id), 
	UNIQUE (reference), 
	UNIQUE (claim_id), 
	UNIQUE (refund_reference)
);

CREATE TABLE auth_sessions (
	id VARCHAR NOT NULL, 
	user_id VARCHAR NOT NULL, 
	refresh_hash VARCHAR NOT NULL, 
	expires_at TIMESTAMP WITH TIME ZONE NOT NULL, 
	mfa_verified BOOLEAN NOT NULL, 
	mfa_deadline TIMESTAMP WITH TIME ZONE, 
	revoked BOOLEAN NOT NULL, 
	PRIMARY KEY (id), 
	FOREIGN KEY(user_id) REFERENCES users (id) ON DELETE CASCADE
);

CREATE INDEX ix_auth_sessions_user_id ON auth_sessions (user_id);

CREATE TABLE counselor_profiles (
	id VARCHAR NOT NULL, 
	user_id VARCHAR NOT NULL, 
	bio VARCHAR, 
	photo_url VARCHAR, 
	specialization_tags JSON, 
	credential_object JSON, 
	credentials_url VARCHAR, 
	is_verified BOOLEAN, 
	is_active BOOLEAN, 
	google_calendar_connected BOOLEAN, 
	google_refresh_token VARCHAR, 
	google_calendar_id VARCHAR, 
	PRIMARY KEY (id), 
	UNIQUE (user_id), 
	FOREIGN KEY(user_id) REFERENCES users (id) ON DELETE CASCADE
);

CREATE TABLE availability (
	id VARCHAR NOT NULL, 
	counselor_id VARCHAR NOT NULL, 
	day_of_week INTEGER, 
	specific_date DATE, 
	start_time TIME WITHOUT TIME ZONE NOT NULL, 
	end_time TIME WITHOUT TIME ZONE NOT NULL, 
	is_recurring BOOLEAN NOT NULL, 
	PRIMARY KEY (id), 
	FOREIGN KEY(counselor_id) REFERENCES counselor_profiles (id) ON DELETE CASCADE
);

CREATE TABLE bookings (
	id VARCHAR NOT NULL, 
	client_id VARCHAR NOT NULL, 
	counselor_id VARCHAR NOT NULL, 
	scheduled_start TIMESTAMP WITH TIME ZONE NOT NULL, 
	scheduled_end TIMESTAMP WITH TIME ZONE NOT NULL, 
	status VARCHAR(15) NOT NULL, 
	schedule_version INTEGER NOT NULL, 
	provisioning_status VARCHAR NOT NULL, 
	client_calendar_event_id VARCHAR, 
	meeting_link VARCHAR, 
	google_calendar_event_id VARCHAR, 
	created_at TIMESTAMP WITH TIME ZONE, 
	PRIMARY KEY (id), 
	FOREIGN KEY(client_id) REFERENCES users (id) ON DELETE CASCADE, 
	FOREIGN KEY(counselor_id) REFERENCES counselor_profiles (id) ON DELETE CASCADE
);

CREATE TABLE oauth_transactions (
	state_hash VARCHAR NOT NULL, 
	session_id VARCHAR NOT NULL, 
	user_id VARCHAR NOT NULL, 
	purpose VARCHAR NOT NULL, 
	verifier VARCHAR NOT NULL, 
	expires_at TIMESTAMP WITH TIME ZONE NOT NULL, 
	PRIMARY KEY (state_hash), 
	FOREIGN KEY(session_id) REFERENCES auth_sessions (id) ON DELETE CASCADE, 
	FOREIGN KEY(user_id) REFERENCES users (id) ON DELETE CASCADE
);

CREATE TABLE intake_forms (
	id VARCHAR NOT NULL, 
	booking_id VARCHAR NOT NULL, 
	concern_category VARCHAR NOT NULL, 
	notes VARCHAR, 
	submitted_at TIMESTAMP WITH TIME ZONE, 
	PRIMARY KEY (id), 
	UNIQUE (booking_id), 
	FOREIGN KEY(booking_id) REFERENCES bookings (id) ON DELETE CASCADE
);

CREATE TABLE payments (
	id VARCHAR NOT NULL, 
	booking_id VARCHAR NOT NULL, 
	amount NUMERIC(10, 2) NOT NULL, 
	currency VARCHAR NOT NULL, 
	provider VARCHAR NOT NULL, 
	provider_payment_id VARCHAR, 
	transaction_reference VARCHAR(64), 
	submitted_at TIMESTAMP WITH TIME ZONE, 
	review_deadline TIMESTAMP WITH TIME ZONE, 
	reviewed_by VARCHAR, 
	reviewed_at TIMESTAMP WITH TIME ZONE, 
	review_reason VARCHAR(500), 
	refund_reference VARCHAR(64), 
	refunded_at TIMESTAMP WITH TIME ZONE, 
	status VARCHAR(14) NOT NULL, 
	payment_method VARCHAR(8), 
	created_at TIMESTAMP WITH TIME ZONE, 
	paid_at TIMESTAMP WITH TIME ZONE, 
	PRIMARY KEY (id), 
	UNIQUE (booking_id), 
	FOREIGN KEY(booking_id) REFERENCES bookings (id) ON DELETE CASCADE, 
	UNIQUE (transaction_reference), 
	UNIQUE (refund_reference)
);

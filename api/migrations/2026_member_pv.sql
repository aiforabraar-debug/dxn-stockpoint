-- =====================================================================
-- DXN Stockpoint — Member Login & PV Distribution migration
-- Run once after base install. Idempotent (IF NOT EXISTS).
-- =====================================================================

-- Member login credentials (separate from admin shop PIN)
CREATE TABLE IF NOT EXISTS member_auth (
    id            BIGINT       NOT NULL AUTO_INCREMENT,
    customer_id   BIGINT       NOT NULL,
    member_id     VARCHAR(40)  NOT NULL,
    pin_hash      VARCHAR(255) NOT NULL,
    created_at    DATETIME     NOT NULL,
    updated_at    DATETIME     NOT NULL,
    rev           BIGINT       NOT NULL DEFAULT 0,
    PRIMARY KEY (id),
    UNIQUE KEY uk_member_auth_member (member_id),
    KEY idx_member_auth_customer (customer_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- PV distribution audit ledger (append-only, never delete)
CREATE TABLE IF NOT EXISTS pv_distributions (
    id             BIGINT       NOT NULL AUTO_INCREMENT,
    member_id      VARCHAR(40)  NOT NULL,
    staff_id       BIGINT       NULL,
    pv_amount      DECIMAL(12,2) NOT NULL DEFAULT 0,
    reason         VARCHAR(160) NOT NULL,
    reference_type VARCHAR(32)  NULL,
    reference_id   VARCHAR(64)  NULL,
    created_at     DATETIME     NOT NULL,
    rev            BIGINT       NOT NULL DEFAULT 0,
    PRIMARY KEY (id),
    UNIQUE KEY uk_pv_dist_ref (reference_type, reference_id),
    KEY idx_pv_dist_member (member_id),
    KEY idx_pv_dist_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Ensure members can be looked up by DXN member ID
ALTER TABLE customers ADD UNIQUE KEY IF NOT EXISTS uk_customers_member (dxn_member_id);

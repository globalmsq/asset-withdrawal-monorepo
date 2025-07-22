-- MySQL initialization script for Withdrawal System
-- This script runs when the Docker container starts.

-- Use database
USE withdrawal_system;

-- Create user if not exists
CREATE USER IF NOT EXISTS 'withdrawal_user'@'%' IDENTIFIED BY 'withdrawal_pass';
CREATE USER IF NOT EXISTS 'withdrawal_user'@'localhost' IDENTIFIED BY 'withdrawal_pass';

-- Create users table (fully matches Prisma schema)
CREATE TABLE IF NOT EXISTS `users` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `email` VARCHAR(255) NOT NULL,
    `password` VARCHAR(255) NOT NULL,
    `role` VARCHAR(20) NOT NULL DEFAULT 'USER',
    `wallet` VARCHAR(42) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `users_email_key`(`email`),
    UNIQUE INDEX `users_wallet_key`(`wallet`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Create transactions table (fully matches Prisma schema)
CREATE TABLE IF NOT EXISTS `transactions` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `requestId` VARCHAR(36) NULL,
    `amount` DECIMAL(18, 8) NOT NULL,
    `symbol` VARCHAR(10) NOT NULL,
    `tokenAddress` VARCHAR(42) NULL,
    `toAddress` VARCHAR(42) NULL,
    `network` VARCHAR(20) NULL,
    `status` VARCHAR(20) NOT NULL,
    `txHash` VARCHAR(66) NULL,
    `blockNumber` INTEGER NULL,
    `confirmations` INTEGER NOT NULL DEFAULT 0,
    `fee` DECIMAL(18, 8) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),

    INDEX `transactions_requestId_idx`(`requestId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Create withdrawal_requests table (fully matches Prisma schema)
CREATE TABLE IF NOT EXISTS `withdrawal_requests` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `requestId` VARCHAR(36) NOT NULL,
    `amount` VARCHAR(50) NOT NULL,
    `symbol` VARCHAR(10) NOT NULL,
    `toAddress` VARCHAR(42) NOT NULL,
    `tokenAddress` VARCHAR(42) NOT NULL,
    `network` VARCHAR(50) NOT NULL,
    `status` VARCHAR(20) NOT NULL DEFAULT 'PENDING',
    `errorMessage` TEXT NULL,
    `type` VARCHAR(10) NOT NULL DEFAULT 'SINGLE',
    `batchId` VARCHAR(36) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `withdrawal_requests_requestId_key`(`requestId`),
    INDEX `withdrawal_requests_status_idx`(`status`),
    INDEX `withdrawal_requests_requestId_idx`(`requestId`),
    INDEX `withdrawal_requests_createdAt_idx`(`createdAt`),
    INDEX `withdrawal_requests_batchId_idx`(`batchId`),
    INDEX `withdrawal_requests_type_idx`(`type`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Create signed_transactions table (fully matches Prisma schema)
CREATE TABLE IF NOT EXISTS `signed_transactions` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `requestId` VARCHAR(36) NOT NULL,
    `txHash` VARCHAR(66) NOT NULL,
    `nonce` INT UNSIGNED NOT NULL,
    `gasLimit` VARCHAR(50) NOT NULL,
    `maxFeePerGas` VARCHAR(50) NULL,
    `maxPriorityFeePerGas` VARCHAR(50) NULL,
    `gasPrice` VARCHAR(50) NULL,
    `from` VARCHAR(42) NOT NULL,
    `to` VARCHAR(42) NOT NULL,
    `value` VARCHAR(50) NOT NULL,
    `data` TEXT NULL,
    `chainId` INT UNSIGNED NOT NULL,
    `retryCount` INT NOT NULL DEFAULT 0,
    `status` VARCHAR(20) NOT NULL DEFAULT 'SIGNED',
    `errorMessage` TEXT NULL,
    `signedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `broadcastedAt` DATETIME(3) NULL,
    `confirmedAt` DATETIME(3) NULL,

    INDEX `signed_transactions_requestId_idx`(`requestId`),
    INDEX `signed_transactions_txHash_idx`(`txHash`),
    INDEX `signed_transactions_signedAt_idx`(`signedAt`),
    INDEX `signed_transactions_status_idx`(`status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Create batch_transactions table (fully matches Prisma schema)
CREATE TABLE IF NOT EXISTS `batch_transactions` (
    `id` VARCHAR(36) NOT NULL,
    `txHash` VARCHAR(66) NULL,
    `multicallAddress` VARCHAR(42) NOT NULL,
    `totalRequests` INT UNSIGNED NOT NULL,
    `status` VARCHAR(20) NOT NULL DEFAULT 'PENDING',
    `gasUsed` VARCHAR(50) NULL,
    `errorMessage` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `batch_transactions_txHash_key`(`txHash`),
    INDEX `batch_transactions_txHash_idx`(`txHash`),
    INDEX `batch_transactions_status_idx`(`status`),
    INDEX `batch_transactions_createdAt_idx`(`createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Development sample data (optional)
INSERT INTO `users` (`email`, `password`, `role`, `wallet`, `createdAt`, `updatedAt`) VALUES
('test@test.com', '$2b$10$0RRGARpzNxCcTXn0Q4kpve9nCkiV2vEIbos8FoaT2fHWVBvSxDkXe', 'USER', '0x1234567890abcdef1234567890abcdef12345678', NOW(), NOW());

-- Grant permissions
GRANT ALL PRIVILEGES ON withdrawal_system.* TO 'withdrawal_user'@'%';
FLUSH PRIVILEGES;

-- Initialization complete message
SELECT 'Database initialization completed successfully!' AS message;

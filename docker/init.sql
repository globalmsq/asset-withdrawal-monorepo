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
    `chain` VARCHAR(20) NOT NULL,
    `network` VARCHAR(50) NOT NULL,
    `status` VARCHAR(20) NOT NULL DEFAULT 'PENDING',
    `errorMessage` TEXT NULL,
    `processingMode` VARCHAR(10) NOT NULL DEFAULT 'SINGLE',
    `batchId` VARCHAR(36) NULL,
    `tryCount` INT UNSIGNED NOT NULL DEFAULT 0,
    `processingInstanceId` VARCHAR(100) NULL,
    `processingStartedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `withdrawal_requests_requestId_key`(`requestId`),
    INDEX `withdrawal_requests_status_idx`(`status`),
    INDEX `withdrawal_requests_requestId_idx`(`requestId`),
    INDEX `withdrawal_requests_createdAt_idx`(`createdAt`),
    INDEX `withdrawal_requests_batchId_idx`(`batchId`),
    INDEX `withdrawal_requests_processingMode_idx`(`processingMode`),
    INDEX `withdrawal_requests_status_processingInstanceId_idx`(`status`, `processingInstanceId`),
    INDEX `withdrawal_requests_chain_idx`(`chain`),
    INDEX `withdrawal_requests_chain_network_idx`(`chain`, `network`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Create signed_single_transactions table (fully matches Prisma schema)
CREATE TABLE IF NOT EXISTS `signed_single_transactions` (
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
    `amount` VARCHAR(50) NOT NULL,
    `symbol` VARCHAR(10) NOT NULL,
    `data` TEXT NULL,
    `chainId` INT UNSIGNED NOT NULL,
    `tryCount` INT NOT NULL DEFAULT 0,
    `status` VARCHAR(20) NOT NULL DEFAULT 'SIGNED',
    `gasUsed` VARCHAR(50) NULL,
    `errorMessage` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    `broadcastedAt` DATETIME(3) NULL,
    `confirmedAt` DATETIME(3) NULL,

    INDEX `signed_single_transactions_requestId_idx`(`requestId`),
    INDEX `signed_single_transactions_txHash_idx`(`txHash`),
    INDEX `signed_single_transactions_createdAt_idx`(`createdAt`),
    INDEX `signed_single_transactions_status_idx`(`status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Create signed_batch_transactions table (fully matches Prisma schema)
CREATE TABLE IF NOT EXISTS `signed_batch_transactions` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `txHash` VARCHAR(66) NULL,
    `multicallAddress` VARCHAR(42) NOT NULL,
    `totalRequests` INT UNSIGNED NOT NULL,
    `totalAmount` VARCHAR(50) NOT NULL,
    `symbol` VARCHAR(10) NOT NULL,
    `chainId` INT UNSIGNED NOT NULL,
    `nonce` INT UNSIGNED NOT NULL,
    `gasLimit` VARCHAR(50) NOT NULL,
    `maxFeePerGas` VARCHAR(50) NULL,
    `maxPriorityFeePerGas` VARCHAR(50) NULL,
    `tryCount` INT NOT NULL DEFAULT 0,
    `status` VARCHAR(20) NOT NULL DEFAULT 'PENDING',
    `gasUsed` VARCHAR(50) NULL,
    `errorMessage` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    `broadcastedAt` DATETIME(3) NULL,
    `confirmedAt` DATETIME(3) NULL,

    UNIQUE INDEX `signed_batch_transactions_txHash_key`(`txHash`),
    INDEX `signed_batch_transactions_txHash_idx`(`txHash`),
    INDEX `signed_batch_transactions_status_idx`(`status`),
    INDEX `signed_batch_transactions_createdAt_idx`(`createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Create sent_transactions table (fully matches Prisma schema)
CREATE TABLE IF NOT EXISTS `sent_transactions` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `requestId` VARCHAR(36) NULL,
    `batchId` VARCHAR(36) NULL,
    `transactionType` VARCHAR(10) NOT NULL,
    `originalTxHash` VARCHAR(66) NOT NULL,
    `sentTxHash` VARCHAR(66) NOT NULL,
    `chainId` INT UNSIGNED NOT NULL,
    `blockNumber` BIGINT UNSIGNED NULL,
    `gasUsed` VARCHAR(50) NULL,
    `status` VARCHAR(20) NOT NULL DEFAULT 'SENT',
    `error` TEXT NULL,
    `sentAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `confirmedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `sent_transactions_sentTxHash_key`(`sentTxHash`),
    INDEX `sent_transactions_requestId_idx`(`requestId`),
    INDEX `sent_transactions_batchId_idx`(`batchId`),
    INDEX `sent_transactions_originalTxHash_idx`(`originalTxHash`),
    INDEX `sent_transactions_sentTxHash_idx`(`sentTxHash`),
    INDEX `sent_transactions_status_idx`(`status`),
    INDEX `sent_transactions_chainId_idx`(`chainId`),
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

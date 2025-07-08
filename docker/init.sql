-- MySQL initialization script for Withdrawal System
-- This script runs when the Docker container starts.

-- Use database
USE withdrawal_system;

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
    `userId` BIGINT UNSIGNED NOT NULL,
    `amount` DECIMAL(18, 8) NOT NULL,
    `currency` VARCHAR(10) NOT NULL,
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

    PRIMARY KEY (`id`),
    CONSTRAINT `transactions_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Development sample data (optional)
INSERT INTO `users` (`email`, `password`, `role`, `wallet`, `createdAt`, `updatedAt`) VALUES
('test@test.com', '$2b$10$0RRGARpzNxCcTXn0Q4kpve9nCkiV2vEIbos8FoaT2fHWVBvSxDkXe', 'USER', '0x1234567890abcdef1234567890abcdef12345678', NOW(), NOW());

-- Grant permissions
GRANT ALL PRIVILEGES ON withdrawal_system.* TO 'withdrawal_user'@'%';
FLUSH PRIVILEGES;

-- Initialization complete message
SELECT 'Database initialization completed successfully!' AS message;

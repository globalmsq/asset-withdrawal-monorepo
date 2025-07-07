-- MySQL 초기화 스크립트 for Withdrawal System
-- 이 스크립트는 Docker 컨테이너 시작 시 실행됩니다.

-- 데이터베이스 사용
USE withdrawal_system;

-- transactions 테이블 생성
CREATE TABLE IF NOT EXISTS `transactions` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
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
    INDEX `idx_userId` (`userId`),
    INDEX `idx_status` (`status`),
    INDEX `idx_createdAt` (`createdAt`),
    INDEX `idx_tokenAddress` (`tokenAddress`),
    INDEX `idx_network` (`network`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- users 테이블 생성
CREATE TABLE IF NOT EXISTS `users` (
    `id` VARCHAR(191) NOT NULL,
    `wallet` VARCHAR(42) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `users_wallet_key`(`wallet`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- 개발용 샘플 데이터 (선택사항)
-- INSERT INTO `users` (`id`, `wallet`, `createdAt`, `updatedAt`) VALUES
-- ('user1', '0x1234567890abcdef1234567890abcdef12345678', NOW(), NOW()),
-- ('user2', '0xabcdef1234567890abcdef1234567890abcdef12', NOW(), NOW());

-- 권한 설정
GRANT ALL PRIVILEGES ON withdrawal_system.* TO 'withdrawal_user'@'%';
FLUSH PRIVILEGES;

-- 초기화 완료 메시지
SELECT 'Database initialization completed successfully!' AS message;
-- AlterTable
ALTER TABLE `transactions` ADD COLUMN `network` VARCHAR(20) NULL,
    ADD COLUMN `toAddress` VARCHAR(42) NULL,
    ADD COLUMN `tokenAddress` VARCHAR(42) NULL;

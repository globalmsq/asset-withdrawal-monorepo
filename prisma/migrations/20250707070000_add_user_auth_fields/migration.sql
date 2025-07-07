-- AlterTable
ALTER TABLE `users` ADD COLUMN `email` VARCHAR(255) NOT NULL,
ADD COLUMN `password` VARCHAR(255) NOT NULL,
ADD COLUMN `role` VARCHAR(20) NOT NULL DEFAULT 'USER',
MODIFY `wallet` VARCHAR(42) NULL;

-- CreateIndex
CREATE UNIQUE INDEX `users_email_key` ON `users`(`email`);
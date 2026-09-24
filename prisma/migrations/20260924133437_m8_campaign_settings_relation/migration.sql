-- AddForeignKey
ALTER TABLE "campaign_settings" ADD CONSTRAINT "campaign_settings_emailAccountId_fkey" FOREIGN KEY ("emailAccountId") REFERENCES "email_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

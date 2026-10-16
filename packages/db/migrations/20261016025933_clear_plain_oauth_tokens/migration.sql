-- Google access and refresh tokens saved before encryptOAuthTokens were plain
-- text. Nothing reads them, so clear them; later sign-ins store them encrypted.
UPDATE `account` SET `access_token` = NULL, `refresh_token` = NULL WHERE `access_token` IS NOT NULL OR `refresh_token` IS NOT NULL;

# DPS Map Download PHP API

This is a PHP 8.1+ implementation of the existing Node/Express API. It preserves the same client-facing routes, JSON fields, status codes, Supabase table, five-minute OTP expiry, Gmail delivery, and PDF mappings. It uses PHPMailer and Supabase's REST API.

## Setup

```powershell
cd php-server
composer install
Copy-Item .env.example .env
```

Fill in `.env`, then run PHP's development server:

```powershell
php -S localhost:5000 router.php
```

The existing React client works unchanged when `client/.env` contains:

```dotenv
VITE_API_URL=http://localhost:5000
```

By default PDFs are read from `../server/maps`, avoiding duplicate binary files. Set `MAPS_DIR` to an absolute or relative directory containing `yangon-map.pdf`, `myanmar-map.pdf`, and `mandalay-map.pdf` when deploying the PHP server separately.

## Web server deployment

- Apache: enable `mod_rewrite`, allow `.htaccess` overrides, and point the document root at `php-server`.
- Nginx: route requests that do not match a real file to `/index.php`.
- Ensure PHP has the cURL and JSON extensions and that the web process can read `MAPS_DIR`.
- HTTPS and SMTP certificate verification use Composer's project-local CA bundle, so Windows PHP installations do not require a global `curl.cainfo` setting.
- Keep `.env`, the Supabase service-role key, and Composer files outside public download access where the platform permits.

The implementation intentionally retains the original API behavior and therefore also retains its documented security limitations. See [`../docs/ARCHITECTURE.md`](../docs/ARCHITECTURE.md).

# MoA Leadership Survey Deployment Guide

This guide assumes the Ministry server is Windows Server with IIS, similar to the FTMS deployment. The React frontend is served by IIS, the Node.js API listens only on `127.0.0.1:5001`, and PostgreSQL stores the survey data.

## 1. Push the project to Git

Create an empty private repository in the Ministry GitHub/GitLab account. Do not add a README or `.gitignore` on the website because this project already contains them.

From PowerShell on the development computer:

```powershell
Set-Location "D:\OneDrive\projects\MoA_FCS"
git status
git add -A
git commit -m "Deploy MoA leadership assessment survey"
git remote add origin https://github.com/YOUR-ORGANIZATION/YOUR-REPOSITORY.git
git push -u origin main
```

If `origin` already exists, replace its URL instead:

```powershell
git remote set-url origin https://github.com/YOUR-ORGANIZATION/YOUR-REPOSITORY.git
git push -u origin main
```

Confirm that `backend/.env` is ignored before pushing:

```powershell
git check-ignore -v backend/.env
git remote -v
git status
```

Never commit `backend/.env`, database passwords, administrator passwords, session secrets, TLS private keys, database dumps, or log files.

## 2. Prepare the Ministry server

Install or confirm:

- Git
- Node.js 22.13 or newer
- PostgreSQL
- IIS with Static Content
- IIS URL Rewrite module
- IIS Application Request Routing (ARR), with proxy enabled
- PM2, if the FTMS server already uses it: `npm install -g pm2`

Create folders such as:

```powershell
New-Item -ItemType Directory -Path "C:\apps\moa-leadership-survey" -Force
New-Item -ItemType Directory -Path "C:\inetpub\wwwroot\moa-leadership-survey" -Force
```

Clone the private repository:

```powershell
git clone https://github.com/YOUR-ORGANIZATION/YOUR-REPOSITORY.git "C:\apps\moa-leadership-survey"
Set-Location "C:\apps\moa-leadership-survey"
```

Use the Ministry Git credential manager, deploy key, or service account for private repository access. Do not place a personal access token inside scripts.

## 3. Create the PostgreSQL database

Open `psql` as a PostgreSQL administrator and create a dedicated application role:

```sql
CREATE ROLE moa_survey_app LOGIN PASSWORD 'REPLACE_WITH_A_LONG_RANDOM_PASSWORD';
CREATE DATABASE moa_reform_feedback OWNER moa_survey_app;
```

Keep PostgreSQL bound to the internal server interface or localhost. Do not expose port 5432 to the public internet. Configure scheduled encrypted backups according to Ministry policy.

## 4. Configure the production environment

Create `C:\apps\moa-leadership-survey\backend\.env` from `.env.example`:

```dotenv
NODE_ENV=production
HOST=127.0.0.1
PORT=5001
DB_HOST=127.0.0.1
DB_PORT=5432
DB_NAME=moa_reform_feedback
DB_USER=moa_survey_app
DB_PASSWORD=REPLACE_WITH_THE_DATABASE_PASSWORD
DB_SSL=false
ALLOWED_ORIGINS=https://leadershipsurvey.moa.gov.et
MINISTRY_ADMIN_USERNAME=admin
MINISTRY_ADMIN_PASSWORD=REPLACE_WITH_A_LONG_UNIQUE_ADMIN_PASSWORD
MINISTRY_ADMIN_SESSION=REPLACE_WITH_AT_LEAST_64_RANDOM_CHARACTERS
```

Generate the session secret in PowerShell:

```powershell
[Convert]::ToHexString([Security.Cryptography.RandomNumberGenerator]::GetBytes(48))
```

Restrict NTFS read permission on `.env` to the service account and authorized server administrators.

## 5. Install, migrate, and start the API

```powershell
Set-Location "C:\apps\moa-leadership-survey\backend"
npm ci
npm run db:migrate
pm2 start ecosystem.config.cjs
pm2 save
Invoke-RestMethod http://127.0.0.1:5001/api/health
```

The health response must report `status: ok` and `database: connected`. Configure the same Windows startup/service method already used for FTMS so `pm2 resurrect` runs after a server reboot. Keep port 5001 blocked from external access; IIS will proxy `/api` to it locally.

## 6. Build and publish the frontend

```powershell
Set-Location "C:\apps\moa-leadership-survey\frontend"
npm ci
npm run build
Copy-Item -Path ".\build\*" -Destination "C:\inetpub\wwwroot\moa-leadership-survey" -Recurse -Force
```

The build includes `web.config`. It routes `/api/*` to `http://127.0.0.1:5001/api/*` and sends other non-file routes to `index.html`.

Grant the IIS application-pool identity read access to the published frontend folder. It does not need write access.

## 7. Configure IIS

1. Open IIS Manager.
2. At the server level, open **Application Request Routing Cache** → **Server Proxy Settings** and enable **Proxy**.
3. Create a new website named `MoA Leadership Survey`.
4. Set the physical path to `C:\inetpub\wwwroot\moa-leadership-survey`.
5. Add an HTTPS binding for the Ministry DNS name, for example `leadershipsurvey.moa.gov.et`.
6. Select the Ministry-approved TLS certificate.
7. Add an HTTP-to-HTTPS redirect if Ministry policy requires it.
8. Ensure the application pool uses **No Managed Code**.
9. Restart the website after applying the binding.

Create the DNS record before public testing. If the site is for the internal Ministry network only, use an internal DNS record and ensure staff phones can reach that network/Wi-Fi.

## 8. Verify the production deployment

Test from the server:

```powershell
Invoke-RestMethod http://127.0.0.1:5001/api/health
Invoke-RestMethod https://leadershipsurvey.moa.gov.et/api/health
```

Then verify in a browser:

1. Open `https://leadershipsurvey.moa.gov.et`.
2. Confirm the TLS padlock has no certificate warning.
3. Scan the QR code at the top. It should open the same production URL automatically.
4. Switch between English and Amharic.
5. Confirm leadership positions and sectors change with the selected level.
6. Submit one controlled test response.
7. Sign in as administrator and confirm the response appears.
8. Test CSV export.
9. Restart the server during the maintenance window and confirm IIS, the API, and PostgreSQL recover automatically.

## 9. Deploy later updates

```powershell
Set-Location "C:\apps\moa-leadership-survey"
git pull --ff-only origin main

Set-Location ".\backend"
npm ci
npm run db:migrate
pm2 restart ecosystem.config.cjs --update-env

Set-Location "..\frontend"
npm ci
npm run build
Copy-Item -Path ".\build\*" -Destination "C:\inetpub\wwwroot\moa-leadership-survey" -Recurse -Force
```

Back up PostgreSQL before migrations, retain the previous frontend build for rollback, and deploy during an approved maintenance window.


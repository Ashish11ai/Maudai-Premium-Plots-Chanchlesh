# Property Plot Layout

## GitHub repo persistence

Admin updates are written to the local data files and synced back to the GitHub repository when the GitHub environment variables are configured.

### Required GitHub environment variables

Set these in your server environment or CI/deployment environment:

- `GITHUB_TOKEN`: a personal access token with `contents:write` permission
- `GITHUB_REPOSITORY`: your repository in the form `owner/repo`
- `GITHUB_BRANCH`: the branch to update (for example `main`)

### Optional environment variables

- `ADMIN_SECRET`: optional admin access secret for secure header-based admin authentication
- `PORT`: local server port (default `3000`)

### Run locally

1. `npm install`
2. `npm start`
3. Open `http://localhost:3000` (or the port you set)

### Notes

- The app works locally without GitHub env vars, but GitHub sync will be skipped if config is missing.
- When GitHub env vars are configured, admin updates commit the data files into the repository using the GitHub API.
- This repo is now the primary persistence store for your admin changes.

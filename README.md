# Property Plot Layout

## Netlify + GitHub persistence

Admin updates are now written to the local data files and, when Netlify environment variables are configured, synced to GitHub automatically.

### Required Netlify environment variables

Set these in Netlify Site configuration > Environment variables:

- GITHUB_TOKEN: a personal access token with `contents:write` permission
- GITHUB_REPOSITORY: your repository in the form `owner/repo`
- GITHUB_BRANCH: the branch to update (for example `main`)

### Notes

- The app still works locally without GitHub env vars, but commits will be skipped and the server will log that GitHub sync is not configured.
- The sync writes the data files under the repository so admin changes can be tracked in Git history.

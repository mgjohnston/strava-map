# Contributing to Strava Map

## Commit Convention

Use this format for commit messages:

```
type: short description
```

### Types

- `feat` - new feature
- `fix` - bug fix
- `refactor` - code change that neither fixes nor adds
- `style` - formatting, missing semicolons, etc
- `docs` - documentation only
- `chore` - updating build tasks, package manager configs, etc

### Examples

```
feat: add direction-coloured polylines for elevation
fix: html2canvas mis-cropping on PNG export
refactor: extract overpass lift fetching into a service
docs: add Strava setup instructions
chore: bump MUI to v7
```

## Branch Strategy

- `main` - stable, deployable code
- `feat/*` - new features (e.g., `feat/strava-sync`)
- `fix/*` - bug fixes (e.g., `fix/token-refresh`)

## Pull Requests

1. Create a branch from `main`
2. Make your changes
3. Ensure `npm run build` passes
4. Submit a PR using the template

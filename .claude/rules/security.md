# Security Rules

- Never commit secrets, API keys, tokens, or credentials to source control
- Do not add `.env` files or modify `.gitignore` to expose secret files
- Do not install new dependencies without user approval
- Do not modify CI/CD pipeline configuration without user approval
- Protect vault file integrity — only modify .md files through the defined scanner/archiver workflows
- Sanitize user inputs in API routes; never trust external data
- Do not expose the MINIMAX_API_KEY or VAULT_PATH in client-side code
- SQLite DB files are local-only — do not commit or expose them
- Do not disable TypeScript strict mode or bypass type checks

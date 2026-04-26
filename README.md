# ReGenX 

ReGenX is a web page operations dashboard for smart bio-waste collection. It turns the implementation plan into a working web app with:

- pickup request creation
- AI-style route publishing for riders
- plant capacity monitoring with overflow prediction
- rider earnings calculation
- local persistence for demo sessions
- Appwrite Sites deployment support

## Local development

```bash
npm run serve
```

## Appwrite deployment

Appwrite Sites currently expects your project endpoint and project ID in addition to an API key. The deployment script uses server-side environment variables and keeps secrets out of the browser bundle.

1. Copy `.env.example` to `.env`.
2. Fill in `APPWRITE_ENDPOINT`, `APPWRITE_PROJECT_ID`, and `APPWRITE_API_KEY`.
3. Run:

```bash
npm run deploy:appwrite
```

The script will:

- create the Appwrite Site if it does not exist
- upload the current static project as a deployment
- wait for the deployment to finish
- activate the deployment if Appwrite leaves it in `ready`

Never expose a private Appwrite API key in frontend code.

---
description: Deploy to Firebase Hosting and Firestore
---

To deploy the website and firestore rules/indexes:

### Local deployment

1.  Open the terminal.
2.  Login to Firebase if needed:
    ```bash
    bun x firebase login
    ```
3.  Deploy the project to Firebase Hosting:
    ```bash
    bun x firebase deploy --only hosting
    ```

### GitHub Actions deployment

1.  GitHub Actions deployment is configured in `.github/workflows/deploy.yml` with manual trigger (`workflow_dispatch`).
2.  Ensure the repository secret `FIREBASE_TOKEN` is configured in GitHub repository settings.
3.  Trigger the "Deploy to Firebase Hosting" workflow manually from the Actions tab.

Note: This deploys the content from the `public/` directory to the project `museum-6f112`.
After deployment, verify the results at:
- https://museum-6f112.web.app
- https://portal.museum.ehime-u.ac.jp/

---
description: Deploy to Firebase Hosting and Firestore
---

To deploy the website and firestore rules/indexes:

1.  Open the terminal.
2.  Login to Firebase if needed:
    ```powershell
    bun x firebase login
    ```
3.  Deploy the project:
    ```powershell
    bun x firebase deploy
    ```

Note: This will deploy the content from the `public/` directory to the project `museum-6f112`.
After deployment, verify the results at:
- https://museum-6f112.web.app
- https://portal.museum.ehime-u.ac.jp/

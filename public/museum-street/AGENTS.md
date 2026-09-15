# Agent Guidelines for Matsuyama Museum Street

This document outlines the key design principles and architecture for the Matsuyama Museum Street project. All developers and coding agents should adhere to these guidelines to maintain consistency and quality.

## 1. Dynamic Content Management with Firestore

The primary source of truth for UI elements that may change frequently (icons, theme colors) is **Firestore**. This allows for real-time content updates without requiring a full site redeployment.

-   **Collection**: `museumIcons`
-   **Document ID**: A string representing the museum's unique ID (e.g., "1", "2", "10").
-   **Schema**:
    -   `svgContent` (string): The raw SVG code for the icon.
    -   `backgroundColor` (string): The hexadecimal color code (e.g., "#a97f71") for the icon's background and theme.

## 2. FOUC (Flash of Unstyled Content) Prevention Strategy

A critical design goal is to prevent the visual "flicker" or "flash" that occurs when dynamic content is loaded after the initial page render. We achieve this through a specific loading strategy.

1.  **Lean HTML**: The main HTML file (`index.html`) is intentionally minimal. **It does NOT contain default icons or hardcoded theme colors in the markup.** The containers for dynamic elements (like the `div.plasma-sphere`) are left empty on purpose.

2.  **JavaScript-driven Styling**: All dynamic icons and colors are applied via JavaScript.

3.  **Cache-First, then Server**: The script (`index.html`) follows this sequence:
    a.  **Attempt to load from cache**: It first tries to get the `museumIcons` collection from Firestore's local cache (`{ source: 'cache' }`). This makes subsequent page loads feel instant and enables robust offline functionality.
    b.  **Fetch from server**: After the cache attempt, it fetches the latest data from the server (`{ source: 'server' }`). This ensures that if there are any updates, they are reflected.

4.  **Fallback Mechanism**: The JavaScript in `index.html` contains a `defaultColors` object. This object serves as a **fallback** ONLY if Firestore (both cache and server) fails to provide a color for a specific museum. This ensures the UI never appears broken.

**DO NOT** add default icons (e.g., `<i data-lucide="...">`) or color classes (e.g., `bg-blue-500`) to the museum list items in `index.html`. This would defeat the FOUC prevention strategy.

## 3. Developer & Content Management Tool (`view-icons.html`)

A dedicated utility page, `public/museum-street/view-icons.html`, exists for development, debugging, and content management.

-   **Purpose**: This page provides a user-friendly interface to view, edit, and update the `svgContent` and `backgroundColor` for every icon directly in Firestore.
-   **Audience**: This page is for developers and content managers only. It is not part of the public-facing application.
-   **Key Features**:
    -   **Real-time Previews**: Any changes made to the SVG code or background color are instantly reflected in a preview pane, allowing for rapid iteration before saving.
    -   **Intuitive Color Editing**: Includes a native color picker (`<input type="color">`) for easy color selection, which is synced with a text input for precise HEX code entry.
    -   **Direct Firestore Integration**: A "Save" button on each card pushes the changes directly to the corresponding document in the `museumIcons` collection in Firestore.
-   **Layout Preservation**: The current layout of the editor is considered highly effective and user-friendly. Future modifications should aim to preserve this layout: a multi-column grid where each card contains a live preview, interactive editing controls, and a save button.

## 4. Modular Content with iFrames

To keep the main application shell (`index.html`) clean and to modularize content, detailed information (like museum events) is loaded into an `<iframe>`.
-   The source for the iframe is a separate HTML file (e.g., `events/06-events.html`).
-   These separate files are responsible for fetching their own specific data, for instance from a Google Apps Script endpoint. This isolates concerns and simplifies the main application's logic.
